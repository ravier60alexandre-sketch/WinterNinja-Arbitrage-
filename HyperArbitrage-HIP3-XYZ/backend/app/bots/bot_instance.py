import asyncio
import json
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

# Map config percentile float → key in compute_percentiles() result
PCT_MAP = {0.5: "p50", 0.75: "p75", 0.8: "p80", 0.95: "p95"}


class BotInstance(BaseBot):
    """Multi-pair arbitrage bot.

    Scans ALL available pairs for a deployer (e.g. CASH → xyz:TSLA/cash:TSLA,
    xyz:NVDA/cash:NVDA, …) and manages individual positions per pair.
    Each pair has its own SpreadCalculator with independent percentile stats.
    """

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
        deployer_registry: object | None = None,
    ) -> None:
        super().__init__(bot_id, name)
        # pair_a = protocol prefix (e.g. "XYZ"), pair_b = deployer (e.g. "CASH")
        self.pair_a = pair_a
        self.pair_b = pair_b
        self.direction = direction
        self.account_address = account_address
        self.trading_address = trading_address
        self._exchange = exchange
        self._hl_info = hl_info
        self._config = config
        self._deployer_registry = deployer_registry

        # Multi-pair state
        self._available_pairs: list[tuple[str, str]] = []
        self._pair_enabled: dict[tuple[str, str], bool] = {}
        self._spread_calculators: dict[tuple[str, str], SpreadCalculator] = {}

        # Shared services
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

    def _discover_pairs(self) -> None:
        """Populate _available_pairs from the DeployerRegistry.

        For a bot with pair_a="XYZ" and pair_b="CASH", discover all coins
        on the CASH deployer (cash:TSLA, cash:NVDA, …) and build pairs
        like (xyz:TSLA, cash:TSLA).
        """
        if self._deployer_registry is None:
            # Fallback: single pair mode (backward compat)
            self._available_pairs = [(self.pair_a, self.pair_b)]
            key = (self.pair_a, self.pair_b)
            if key not in self._spread_calculators:
                self._spread_calculators[key] = SpreadCalculator(self.bot_id)
            self._pair_enabled.setdefault(key, True)
            logger.info("single_pair_mode", bot_id=self.bot_id, pair_a=self.pair_a, pair_b=self.pair_b)
            return

        deployer_name = self.pair_b.lower()  # e.g. "cash"
        protocol_prefix = self.pair_a.lower()  # e.g. "xyz"

        deployer_coins = self._deployer_registry.get_deployer_coins(deployer_name)
        if not deployer_coins:
            logger.warning("no_deployer_coins", bot_id=self.bot_id, deployer=deployer_name)
            self._available_pairs = [(self.pair_a, self.pair_b)]
            key = (self.pair_a, self.pair_b)
            if key not in self._spread_calculators:
                self._spread_calculators[key] = SpreadCalculator(self.bot_id)
            self._pair_enabled.setdefault(key, True)
            return

        # Also get protocol (pair_a side) coins
        protocol_coins = self._deployer_registry.get_deployer_coins(protocol_prefix)
        protocol_bases = {c.split(":")[-1] for c in protocol_coins} if protocol_coins else set()

        pairs = []
        for coin in deployer_coins:
            # coin = "cash:TSLA" → base_name = "TSLA"
            base_name = coin.split(":")[-1]
            pair_a_asset = f"{protocol_prefix}:{base_name}"
            pair_b_asset = coin  # e.g. "cash:TSLA"

            # Only add pair if the protocol side also has this asset
            if protocol_bases and base_name not in protocol_bases:
                continue

            pairs.append((pair_a_asset, pair_b_asset))

        self._available_pairs = pairs

        # Load disabled pairs from config
        disabled_pairs_json = self._config.get("disabled_pairs")
        disabled_set: set[str] = set()
        if disabled_pairs_json:
            try:
                disabled_set = set(json.loads(disabled_pairs_json))
            except (json.JSONDecodeError, TypeError):
                pass

        # Initialize per-pair state
        for pair_key in self._available_pairs:
            if pair_key not in self._spread_calculators:
                self._spread_calculators[pair_key] = SpreadCalculator(self.bot_id)
            pair_str = f"{pair_key[0]}|{pair_key[1]}"
            self._pair_enabled.setdefault(pair_key, pair_str not in disabled_set)

        logger.info(
            "pairs_discovered",
            bot_id=self.bot_id,
            deployer=deployer_name,
            total_pairs=len(self._available_pairs),
            enabled=sum(1 for v in self._pair_enabled.values() if v),
            pairs=[f"{a}/{b}" for a, b in self._available_pairs],
        )

    async def start(self) -> None:
        await self.transition(BotState.CONNECTING, "user_start")

        try:
            # Discover all pairs for this deployer
            self._discover_pairs()

            # Pre-populate fee cache for the first pair
            if self._available_pairs:
                first_a, first_b = self._available_pairs[0]
                await self.fee_calculator.compute_roundtrip_fees(
                    first_a, first_b, self.trading_address,
                )
                self._last_fee_refresh = time.time()

            await self.transition(BotState.RUNNING, "connected")

            self._stop_event.clear()

            # Build list of all unique assets for funding monitoring
            all_assets = set()
            for pa, pb in self._available_pairs:
                all_assets.add(pa)
                all_assets.add(pb)

            self._tasks = [
                asyncio.create_task(self._main_loop()),
                asyncio.create_task(
                    self.funding_monitor.run_loop(
                        list(all_assets), self._stop_event,
                    )
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
        self._spread_calculators.clear()
        self._available_pairs.clear()
        self._pair_enabled.clear()
        self._open_trades.clear()
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

        max_slippage_ticks = self._config.get("max_slippage_ticks", 2)
        min_edge_bps = Decimal(str(self._config.get("min_edge_bps", 2)))
        max_concurrent = self._config.get("max_concurrent_positions", 10)
        timeframe_key = f"{self._config.get('timeframe_hours', 6)}h"
        if timeframe_key not in ("1h", "6h", "12h", "24h", "7d"):
            timeframe_key = "24h"
        target_pct_key = self._config.get("percentile", 0.75)

        # Refresh fees every 60 seconds
        now = time.time()
        fee_refresh_needed = now - self._last_fee_refresh > 60

        for pair_key in self._available_pairs:
            if not self._pair_enabled.get(pair_key, True):
                continue

            pair_a, pair_b = pair_key

            book_a = self.orderbook_service.get(pair_a)
            book_b = self.orderbook_service.get(pair_b)
            if book_a is None or book_b is None:
                continue

            mid_a = book_a.mid_price
            mid_b = book_b.mid_price
            if mid_a is None or mid_b is None:
                continue

            # Per-pair spread calculator
            calc = self._spread_calculators[pair_key]
            sample = calc.add_sample(mid_a, mid_b)

            # Per-pair percentiles (individual stats per pair)
            percentiles = calc.compute_percentiles(timeframe_key)
            target_percentile = percentiles.get(PCT_MAP.get(target_pct_key, "p75"))
            if target_percentile is None:
                continue

            # Refresh fees if needed
            if fee_refresh_needed:
                await self.fee_calculator.compute_roundtrip_fees(
                    pair_a, pair_b, self.trading_address,
                )

            fees_roundtrip = await self.fee_calculator.get_fees_roundtrip(pair_a, pair_b)

            tick_a = self.order_executor._tick_sizes.get(pair_a, Decimal("0.01"))
            slippage_margin = tick_a * max_slippage_ticks * 2

            edge = calc.compute_edge(
                sample.spread, target_percentile, fees_roundtrip, slippage_margin
            )

            # Check exits for trades on THIS pair
            for trade in self._open_trades[:]:
                if trade["pair_a"] == pair_a and trade["pair_b"] == pair_b:
                    await self._check_exit_trade(
                        trade, pair_a, pair_b,
                        mid_a, mid_b, fees_roundtrip, slippage_margin, edge
                    )

            # Check entry for THIS pair if below max concurrent
            if len(self._open_trades) < max_concurrent:
                # Size = liquidity at best price (1 tick) on both legs
                size = self._compute_size_from_book(book_a, book_b)

                if size > Decimal("0"):
                    await self._check_entry(
                        pair_a, pair_b, size,
                        mid_a, mid_b, edge, min_edge_bps,
                        fees_roundtrip, slippage_margin, max_slippage_ticks, sample
                    )

            # Flush spread samples if needed
            if calc.should_flush():
                calc.flush_batch()

        if fee_refresh_needed:
            self._last_fee_refresh = now

        elapsed_ms = (time.perf_counter_ns() - tick_start) / 1_000_000
        if elapsed_ms > 100:
            logger.warning("slow_tick", bot_id=self.bot_id, elapsed_ms=round(elapsed_ms, 2))

    def _compute_size_from_book(self, book_a, book_b) -> Decimal:
        """Position size = min liquidity at best price (1 tick) across both legs."""
        if self.direction == "long_a_short_b":
            size_a = book_a.asks[0].size if book_a.asks else Decimal("0")
            size_b = book_b.bids[0].size if book_b.bids else Decimal("0")
        else:
            size_a = book_a.bids[0].size if book_a.bids else Decimal("0")
            size_b = book_b.asks[0].size if book_b.asks else Decimal("0")
        return min(size_a, size_b)

    async def _check_entry(
        self,
        pair_a: str,
        pair_b: str,
        size: Decimal,
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
            logger.debug("entry_blocked_funding", bot_id=self.bot_id, pair_a=pair_a, pair_b=pair_b)
            return

        if self.direction == "long_a_short_b":
            side_a, side_b = "buy", "sell"
        else:
            side_a, side_b = "sell", "buy"

        logger.info(
            "entry_signal",
            bot_id=self.bot_id,
            edge=str(edge),
            spread=str(sample.spread),
            pair_a=pair_a,
            pair_b=pair_b,
            size=str(size),
        )

        result_a, result_b = await self.order_executor.execute_pair(
            asset_a=pair_a, side_a=side_a, size_a=size, mid_a=mid_a,
            asset_b=pair_b, side_b=side_b, size_b=size, mid_b=mid_b,
            max_slippage_ticks=max_slippage_ticks,
        )

        if self._config.get("one_leg_protection", True):
            success, status = await self.one_leg_guard.monitor_fills(
                result_a.order_id, result_b.order_id, self._fill_queue,
                asset_a=pair_a, asset_b=pair_b,
            )
            if not success:
                logger.warning("entry_one_leg", bot_id=self.bot_id, status=status)
                return

        if not result_a.filled or not result_b.filled:
            logger.warning("entry_not_filled", bot_id=self.bot_id)
            return

        trade = {
            "pair_a": pair_a,
            "pair_b": pair_b,
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
            pair_a=pair_a,
            pair_b=pair_b,
            entry_a=str(result_a.price),
            entry_b=str(result_b.price),
            size=str(size),
            edge=str(edge),
            open_count=len(self._open_trades),
        )

    async def _check_exit_trade(
        self,
        trade: dict,
        pair_a: str,
        pair_b: str,
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
            asset_a=pair_a, side_a=exit_side_a, size_a=trade["size"],
            asset_b=pair_b, side_b=exit_side_b, size_b=trade["size"],
        )

        close_reason = "on_profit" if not reverse_signal else "on_reverse"

        if closed:
            self._open_trades.remove(trade)
            logger.info(
                "trade_closed",
                bot_id=self.bot_id,
                pair_a=pair_a,
                pair_b=pair_b,
                net_pnl=str(net_pnl),
                close_reason=close_reason,
                remaining_open=len(self._open_trades),
            )
        else:
            logger.error(
                "trade_close_failed_will_retry",
                bot_id=self.bot_id,
                pair_a=pair_a,
                pair_b=pair_b,
                net_pnl=str(net_pnl),
                close_reason=close_reason,
            )

    def set_pair_enabled(self, pair_key: tuple[str, str], enabled: bool) -> None:
        """Toggle a specific pair on/off."""
        self._pair_enabled[pair_key] = enabled
        status = "enabled" if enabled else "disabled"
        logger.info(
            f"pair_{status}",
            bot_id=self.bot_id,
            pair_a=pair_key[0],
            pair_b=pair_key[1],
        )

    def get_pair_states(self) -> list[dict]:
        """Return the state of all pairs (for API/UI)."""
        result = []
        for pair_key in self._available_pairs:
            pair_a, pair_b = pair_key
            enabled = self._pair_enabled.get(pair_key, True)
            calc = self._spread_calculators.get(pair_key)

            live_edge = None
            if calc and calc.latest:
                timeframe_key = f"{self._config.get('timeframe_hours', 6)}h"
                percentiles = calc.compute_percentiles(timeframe_key)
                target_pct_key = self._config.get("percentile", 0.75)
                target = percentiles.get(PCT_MAP.get(target_pct_key, "p75"))
                if target is not None:
                    live_edge = float(calc.latest.spread - target)

            base_name = pair_b.split(":")[-1] if ":" in pair_b else pair_b
            result.append({
                "symbol": base_name,
                "pair_a": pair_a,
                "pair_b": pair_b,
                "enabled": enabled,
                "live_edge": live_edge,
                "sample_count": calc.sample_count if calc else 0,
            })
        return result

    def update_config(self, config: dict) -> None:
        self._config.update(config)
        self.position_manager.exit_mode = config.get("exit_mode", self.position_manager.exit_mode)

        # Handle pair toggles update
        pair_toggles = config.get("pair_toggles")
        if pair_toggles and isinstance(pair_toggles, dict):
            for pair_str, enabled in pair_toggles.items():
                parts = pair_str.split("|")
                if len(parts) == 2:
                    self.set_pair_enabled(tuple(parts), enabled)

    def on_fill(self, fill: FillEvent) -> None:
        try:
            self._fill_queue.put_nowait(fill)
        except asyncio.QueueFull:
            logger.warning("fill_queue_full", bot_id=self.bot_id)
