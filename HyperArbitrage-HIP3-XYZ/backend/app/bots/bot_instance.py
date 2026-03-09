import asyncio
import time
from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal

from app.bots.base_bot import BaseBot, BotState
from app.bots.fee_calculator import FeeCalculator
from app.bots.funding_monitor import FundingMonitor
from app.bots.one_leg_guard import FillEvent, OneLegGuard
from app.bots.order_executor import OrderExecutor
from app.bots.position_manager import PositionManager
from app.bots.spread_calculator import SpreadCalculator
from app.core.exceptions import FundingBlockedError, InsufficientEdgeError
from app.core.logging import get_logger
from app.services.orderbook_service import OrderbookService

logger = get_logger("bots.bot_instance")


class BotInstance(BaseBot):
    def __init__(
        self,
        bot_id: int,
        name: str,
        pair_a: str,
        pair_b: str,
        direction: str,
        account_address: str,
        trading_address: str,
        exchange: object,
        hl_info: object,
        config: dict,
    ) -> None:
        super().__init__(bot_id, name)
        self.pair_a = pair_a
        self.pair_b = pair_b
        self.direction = direction
        self.account_address = account_address
        self.trading_address = trading_address
        self._exchange = exchange
        self._hl_info = hl_info
        self._config = config

        self.spread_calculator = SpreadCalculator(bot_id)
        self.fee_calculator = FeeCalculator(bot_id, hl_info)
        self.order_executor = OrderExecutor(bot_id, exchange, config.get("max_retries", 3))
        self.one_leg_guard = OneLegGuard(bot_id, config.get("one_leg_timeout_ms", 500), exchange)
        self.funding_monitor = FundingMonitor(bot_id, hl_info, config.get("funding_threshold", 0.5))
        self.position_manager = PositionManager(bot_id, exchange, config.get("exit_mode", "on_profit"))
        self.orderbook_service = OrderbookService()

        self._stop_event = asyncio.Event()
        self._fill_queue: asyncio.Queue = asyncio.Queue(maxlen=100)
        self._tasks: list[asyncio.Task] = []
        self._open_trades: list[dict] = []
        self._last_fee_refresh: float = 0.0

    async def start(self) -> None:
        await self.transition(BotState.CONNECTING, "user_start")

        try:
            # Pre-populate fee cache so _tick() has real values
            await self.fee_calculator.compute_roundtrip_fees(
                self.pair_a, self.pair_b, self.trading_address,
            )
            self._last_fee_refresh = time.time()

            await self.transition(BotState.RUNNING, "connected")

            self._stop_event.clear()
            self._tasks = [
                asyncio.create_task(self._main_loop()),
                asyncio.create_task(
                    self.funding_monitor.run_loop(self.pair_a, self.pair_b, self._stop_event)
                ),
            ]

        except Exception as exc:
            await self.transition(BotState.STOPPED, f"connection_failed: {exc}")
            raise

    async def stop(self) -> None:
        await self.transition(BotState.PAUSED, "user_stop")
        self._stop_event.set()
        for task in self._tasks:
            task.cancel()
        self._tasks.clear()

    async def liquidate(self) -> None:
        await self.transition(BotState.LIQUIDATING, "user_liquidate")
        self._stop_event.set()
        for task in self._tasks:
            task.cancel()
        self._tasks.clear()

    async def reset(self) -> None:
        if self.state not in (BotState.PAUSED, BotState.STOPPED):
            await self.stop()
        await self.transition(BotState.STOPPED, "reset")
        self.spread_calculator = SpreadCalculator(self.bot_id)
        await self.transition(BotState.IDLE, "reset_complete")

    async def _main_loop(self) -> None:
        while not self._stop_event.is_set():
            try:
                if self.state != BotState.RUNNING:
                    await asyncio.sleep(0.5)
                    continue

                await self._tick()
                await asyncio.sleep(0.2)

            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.error("main_loop_error", bot_id=self.bot_id, error=str(exc))
                await asyncio.sleep(1.0)

    async def _tick(self) -> None:
        tick_start = time.perf_counter_ns()

        book_a = self.orderbook_service.get(self.pair_a)
        book_b = self.orderbook_service.get(self.pair_b)
        if book_a is None or book_b is None:
            return

        mid_a = book_a.mid_price
        mid_b = book_b.mid_price
        if mid_a is None or mid_b is None:
            return

        sample = self.spread_calculator.add_sample(mid_a, mid_b)

        timeframe_key = f"{self._config.get('timeframe_hours', 6)}h"
        if timeframe_key not in ("1h", "6h", "12h", "24h"):
            timeframe_key = "24h"
        percentiles = self.spread_calculator.compute_percentiles(timeframe_key)

        target_pct_key = self._config.get("percentile", 0.75)
        pct_map = {0.5: "p50", 0.75: "p75", 0.8: "p80", 0.95: "p95"}
        target_percentile = percentiles.get(pct_map.get(target_pct_key, "p75"))
        if target_percentile is None:
            return

        # Refresh fees every 60 seconds
        now = time.time()
        if now - self._last_fee_refresh > 60:
            await self.fee_calculator.compute_roundtrip_fees(
                self.pair_a, self.pair_b, self.trading_address,
            )
            self._last_fee_refresh = now

        fees_roundtrip = await self.fee_calculator.get_fees_roundtrip(self.pair_a, self.pair_b)

        max_slippage_ticks = self._config.get("max_slippage_ticks", 2)
        tick_a = self.order_executor._tick_sizes.get(self.pair_a, Decimal("0.01"))
        slippage_margin = tick_a * max_slippage_ticks * 2

        edge = self.spread_calculator.compute_edge(
            sample.spread, target_percentile, fees_roundtrip, slippage_margin
        )

        min_edge_bps = Decimal(str(self._config.get("min_edge_bps", 2)))

        # Check exits on all open trades
        for trade in self._open_trades[:]:
            await self._check_exit_trade(trade, mid_a, mid_b, fees_roundtrip, slippage_margin, edge)

        # Check entry if below max concurrent positions
        max_concurrent = self._config.get("max_concurrent_positions", 10)
        if len(self._open_trades) < max_concurrent:
            await self._check_entry(
                mid_a, mid_b, edge, min_edge_bps,
                fees_roundtrip, slippage_margin, max_slippage_ticks, sample
            )

        if self.spread_calculator.should_flush():
            self.spread_calculator.flush_batch()

        elapsed_ms = (time.perf_counter_ns() - tick_start) / 1_000_000
        if elapsed_ms > 50:
            logger.warning("slow_tick", bot_id=self.bot_id, elapsed_ms=round(elapsed_ms, 2))

    async def _check_entry(
        self,
        mid_a: Decimal,
        mid_b: Decimal,
        edge: Decimal,
        min_edge_bps: Decimal,
        fees_roundtrip: Decimal,
        slippage_margin: Decimal,
        max_slippage_ticks: int,
        sample,
    ) -> None:
        if edge < min_edge_bps:
            return

        if self.funding_monitor.is_blocked:
            logger.debug("entry_blocked_funding", bot_id=self.bot_id)
            return

        max_position = self._config.get("max_position_size")
        size = Decimal(str(max_position)) if max_position else Decimal("1")

        if self.direction == "long_a_short_b":
            side_a, side_b = "buy", "sell"
        else:
            side_a, side_b = "sell", "buy"

        logger.info(
            "entry_signal",
            bot_id=self.bot_id,
            edge=str(edge),
            spread=str(sample.spread),
            pair_a=self.pair_a,
            pair_b=self.pair_b,
        )

        result_a, result_b = await self.order_executor.execute_pair(
            asset_a=self.pair_a, side_a=side_a, size_a=size, mid_a=mid_a,
            asset_b=self.pair_b, side_b=side_b, size_b=size, mid_b=mid_b,
            max_slippage_ticks=max_slippage_ticks,
        )

        if self._config.get("one_leg_protection", True):
            success, status = await self.one_leg_guard.monitor_fills(
                result_a.order_id, result_b.order_id, self._fill_queue,
                asset_a=self.pair_a, asset_b=self.pair_b,
            )
            if not success:
                logger.warning("entry_one_leg", bot_id=self.bot_id, status=status)
                return

        if not result_a.filled or not result_b.filled:
            logger.warning("entry_not_filled", bot_id=self.bot_id)
            return

        trade = {
            "entry_time": datetime.now(UTC),
            "entry_price_a": result_a.price,
            "entry_price_b": result_b.price,
            "size": size,
            "side_a": side_a,
            "side_b": side_b,
            "entry_spread": sample.spread,
            "edge_at_entry": edge,
            "slippage_a": result_a.slippage,
            "slippage_b": result_b.slippage,
            "fees_entry": fees_roundtrip / 2,
        }
        self._open_trades.append(trade)

        logger.info(
            "trade_opened",
            bot_id=self.bot_id,
            entry_a=str(result_a.price),
            entry_b=str(result_b.price),
            size=str(size),
            edge=str(edge),
            open_count=len(self._open_trades),
        )

    async def _check_exit_trade(
        self,
        trade: dict,
        mid_a: Decimal,
        mid_b: Decimal,
        fees_roundtrip: Decimal,
        slippage_margin: Decimal,
        current_edge: Decimal,
    ) -> None:
        net_pnl = self.position_manager.compute_net_pnl(
            entry_price_a=trade["entry_price_a"],
            entry_price_b=trade["entry_price_b"],
            exit_price_a=mid_a,
            exit_price_b=mid_b,
            size=trade["size"],
            fees_paid=fees_roundtrip,
            funding_paid=Decimal("0"),
            direction=self.direction,
        )

        reverse_signal = current_edge < Decimal("0")
        should_exit = self.position_manager.should_exit(
            net_pnl, fees_roundtrip, slippage_margin, reverse_signal
        )

        if not should_exit:
            return

        exit_side_a = "sell" if trade["side_a"] == "buy" else "buy"
        exit_side_b = "sell" if trade["side_b"] == "buy" else "buy"

        closed = await self.position_manager.close_position(
            asset_a=self.pair_a, side_a=exit_side_a, size_a=trade["size"],
            asset_b=self.pair_b, side_b=exit_side_b, size_b=trade["size"],
        )

        close_reason = "on_profit" if not reverse_signal else "on_reverse"

        if closed:
            self._open_trades.remove(trade)
            logger.info(
                "trade_closed",
                bot_id=self.bot_id,
                net_pnl=str(net_pnl),
                close_reason=close_reason,
                remaining_open=len(self._open_trades),
            )
        else:
            logger.error(
                "trade_close_failed_will_retry",
                bot_id=self.bot_id,
                net_pnl=str(net_pnl),
                close_reason=close_reason,
            )

    def update_config(self, config: dict) -> None:
        self._config.update(config)
        self.position_manager.exit_mode = config.get("exit_mode", self.position_manager.exit_mode)

    def on_fill(self, fill: FillEvent) -> None:
        try:
            self._fill_queue.put_nowait(fill)
        except asyncio.QueueFull:
            logger.warning("fill_queue_full", bot_id=self.bot_id)
