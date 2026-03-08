"""
Bot trading engine — connects to Hyperliquid, monitors spreads,
executes pair trades with all safety protections.
"""
import asyncio
import json
import logging
import os
import time
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from enum import Enum

import numpy as np

logger = logging.getLogger("bot_engine")

# ── Constants ──
TIMEFRAME_SECONDS = {"1h": 3600, "6h": 21600, "12h": 43200, "24h": 86400}
_Q8 = Decimal("0.00000001")
_Q2 = Decimal("0.01")
DEFAULT_FEE_BPS = Decimal("0.0007")  # HIP-3 taker fee per leg


class BotState(str, Enum):
    IDLE = "idle"
    CONNECTING = "connecting"
    RUNNING = "running"
    PAUSED = "paused"
    LIQUIDATING = "liquidating"
    STOPPED = "stopped"


@dataclass(slots=True)
class SpreadSample:
    timestamp: float
    spread: Decimal
    mid_a: Decimal
    mid_b: Decimal


@dataclass(slots=True)
class OrderResult:
    order_id: str
    asset: str
    side: str
    size: float
    price: float
    filled: bool
    slippage_bps: float


@dataclass
class BotMetrics:
    pnl_net: float = 0.0
    fees: float = 0.0
    volume: float = 0.0
    open: int = 0
    closed: int = 0
    wins: int = 0
    losses: int = 0
    win_pct: float | None = None
    slip_avg_bps: float = 0.0
    errors: int = 0
    orphans: int = 0
    funding: float = 0.0
    _slippage_sum: float = 0.0
    _slippage_count: int = 0

    def record_slippage(self, slip_a: float, slip_b: float):
        self._slippage_sum += abs(slip_a) + abs(slip_b)
        self._slippage_count += 2
        self.slip_avg_bps = self._slippage_sum / self._slippage_count if self._slippage_count else 0

    def record_trade_close(self, pnl: float, fees: float, volume: float):
        self.closed += 1
        self.open = max(0, self.open - 1)
        self.pnl_net += pnl
        self.fees += fees
        self.volume += volume
        if pnl > 0:
            self.wins += 1
        else:
            self.losses += 1
        total = self.wins + self.losses
        self.win_pct = (self.wins / total * 100) if total > 0 else None

    def to_dict(self):
        return {
            "pnl_net": round(self.pnl_net, 6),
            "fees": round(self.fees, 6),
            "volume": round(self.volume, 2),
            "open": self.open,
            "closed": self.closed,
            "wins": self.wins,
            "losses": self.losses,
            "win_pct": round(self.win_pct, 1) if self.win_pct is not None else None,
            "slip_avg_bps": round(self.slip_avg_bps, 2),
            "errors": self.errors,
            "orphans": self.orphans,
            "funding": round(self.funding, 6),
        }


@dataclass
class BotConfig:
    percentile: float = 0.75
    timeframe: str = "6h"
    min_edge_bps: float = 2.0
    max_slippage_ticks: int = 2
    max_position_size: float = 300.0
    max_leverage: float = 10.0
    funding_rate_threshold: float = 0.5
    one_leg_protection: bool = True
    one_leg_timeout_ms: int = 500
    exit_mode: str = "on_profit"  # "on_profit" or "on_reverse"
    close_buffer_bps: float = 2.0
    order_retries: int = 3

    def to_dict(self):
        return {
            "percentile": self.percentile,
            "timer": self.timeframe,
            "min_edge_bps": self.min_edge_bps,
            "slip": self.max_slippage_ticks,
            "max_pos": self.max_position_size,
            "max_lev": self.max_leverage,
            "funding_threshold": self.funding_rate_threshold,
            "one_leg_protection": self.one_leg_protection,
            "exit_mode": self.exit_mode,
            "close_buffer_bps": self.close_buffer_bps,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "BotConfig":
        c = cls()
        if "percentile" in d:
            c.percentile = float(d["percentile"])
        if "timer" in d:
            c.timeframe = d["timer"]
        if "min_edge_bps" in d:
            c.min_edge_bps = float(d["min_edge_bps"])
        if "slip" in d:
            c.max_slippage_ticks = int(d["slip"])
        if "max_pos" in d:
            c.max_position_size = float(d["max_pos"])
        if "max_lev" in d:
            c.max_leverage = float(d["max_lev"])
        if "funding_threshold" in d:
            c.funding_rate_threshold = float(d["funding_threshold"])
        if "one_leg_protection" in d:
            c.one_leg_protection = bool(d["one_leg_protection"])
        if "exit_mode" in d:
            c.exit_mode = d["exit_mode"]
        if "close_buffer_bps" in d:
            c.close_buffer_bps = float(d["close_buffer_bps"])
        return c


class BotEngine:
    """
    Full trading engine for one arbitrage bot.
    Connects to Hyperliquid via SDK, subscribes to l2Book WebSocket,
    calculates spreads, and executes pair trades.
    """

    def __init__(
        self,
        bot_id: int,
        name: str,
        pair_a: str,
        pair_b: str,
        direction: str,
        account_address: str,
        api_key: str,
        sub_account: str | None = None,
        config: BotConfig | None = None,
        on_trade_callback=None,
    ):
        self.bot_id = bot_id
        self.name = name
        self.pair_a = pair_a
        self.pair_b = pair_b
        self.direction = direction
        self.account_address = account_address
        self.api_key = api_key
        self.sub_account = sub_account
        self.config = config or BotConfig()
        self.on_trade_callback = on_trade_callback

        self.state = BotState.STOPPED
        self.metrics = BotMetrics()

        # Hyperliquid SDK objects (created on start)
        self._exchange = None
        self._info = None

        # Spread tracking
        self._samples: deque[SpreadSample] = deque(maxlen=50_000)

        # Orderbook state
        self._book_a: dict = {}  # {"bids": [...], "asks": [...]}
        self._book_b: dict = {}

        # Open position tracking
        self._has_position = False
        self._open_trade: dict | None = None

        # Funding state
        self._funding_a = 0.0
        self._funding_b = 0.0
        self._funding_blocked = False

        # Async control
        self._stop_event = asyncio.Event()
        self._tasks: list[asyncio.Task] = []

    # ── Hyperliquid Connection ──

    def _connect_exchange(self):
        """Create Hyperliquid Exchange + Info clients using the agent wallet pattern."""
        try:
            import eth_account
            from hyperliquid.exchange import Exchange
            from hyperliquid.info import Info
            from hyperliquid.utils import constants

            base_url = constants.MAINNET_API_URL

            # Create agent wallet from API key
            agent_wallet = eth_account.Account.from_key(self.api_key)

            # Trading address = sub_account if set, otherwise account_address
            trading_address = self.sub_account or self.account_address

            self._exchange = Exchange(
                wallet=agent_wallet,
                base_url=base_url,
                account_address=trading_address,
            )
            self._info = Info(base_url=base_url, skip_ws=True)

            logger.info(f"[Bot {self.bot_id}] Connected to Hyperliquid mainnet, trading as {trading_address[:10]}...")
            return True

        except ImportError as e:
            logger.error(f"[Bot {self.bot_id}] Hyperliquid SDK not installed: {e}")
            return False
        except Exception as e:
            logger.error(f"[Bot {self.bot_id}] Failed to connect: {e}")
            return False

    # ── Orderbook WebSocket ──

    async def _subscribe_orderbooks(self):
        """Subscribe to l2Book WebSocket for both pairs."""
        import websockets

        ws_url = "wss://api.hyperliquid.xyz/ws"

        while not self._stop_event.is_set():
            try:
                async with websockets.connect(ws_url, ping_interval=20) as ws:
                    # Subscribe to both pairs
                    for coin in [self.pair_a, self.pair_b]:
                        sub_msg = json.dumps({
                            "method": "subscribe",
                            "subscription": {"type": "l2Book", "coin": coin}
                        })
                        await ws.send(sub_msg)

                    logger.info(f"[Bot {self.bot_id}] Subscribed to l2Book for {self.pair_a}, {self.pair_b}")

                    async for raw_msg in ws:
                        if self._stop_event.is_set():
                            break
                        try:
                            msg = json.loads(raw_msg)
                            if msg.get("channel") == "l2Book":
                                data = msg.get("data", {})
                                coin = data.get("coin", "")
                                levels = data.get("levels", [[], []])
                                book = {
                                    "bids": [(float(l["px"]), float(l["sz"])) for l in levels[0][:10]],
                                    "asks": [(float(l["px"]), float(l["sz"])) for l in levels[1][:10]],
                                }
                                if coin == self.pair_a:
                                    self._book_a = book
                                elif coin == self.pair_b:
                                    self._book_b = book
                        except Exception as e:
                            logger.debug(f"[Bot {self.bot_id}] WS parse error: {e}")

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.warning(f"[Bot {self.bot_id}] WS disconnected: {e}, reconnecting in 3s...")
                await asyncio.sleep(3)

    def _mid_price(self, book: dict) -> float | None:
        bids = book.get("bids", [])
        asks = book.get("asks", [])
        if not bids or not asks:
            return None
        return (bids[0][0] + asks[0][0]) / 2

    # ── Funding Monitor ──

    async def _funding_loop(self):
        """Check funding rates every 60s and block entry if adverse."""
        while not self._stop_event.is_set():
            try:
                if self._info:
                    meta = self._info.meta()
                    rates = {}
                    for asset_info in meta.get("universe", []):
                        name = asset_info.get("name", "")
                        funding = float(asset_info.get("funding", "0"))
                        rates[name] = funding

                    self._funding_a = rates.get(self.pair_a, 0.0)
                    self._funding_b = rates.get(self.pair_b, 0.0)
                    net = self._funding_a - self._funding_b

                    self._funding_blocked = (net < 0 and abs(net) > self.config.funding_rate_threshold)

                    if self._funding_blocked:
                        logger.info(f"[Bot {self.bot_id}] Funding blocked: net={net:.6f}")
            except Exception as e:
                logger.warning(f"[Bot {self.bot_id}] Funding check error: {e}")

            try:
                await asyncio.wait_for(self._stop_event.wait(), timeout=60)
            except asyncio.TimeoutError:
                pass

    # ── Spread Calculation ──

    def _add_spread_sample(self, mid_a: float, mid_b: float) -> SpreadSample:
        if mid_b == 0:
            spread = Decimal("0")
        else:
            spread = Decimal(str((mid_a - mid_b) / mid_b * 10000)).quantize(_Q8, rounding=ROUND_HALF_UP)

        sample = SpreadSample(
            timestamp=time.time(),
            spread=spread,
            mid_a=Decimal(str(mid_a)),
            mid_b=Decimal(str(mid_b)),
        )
        self._samples.append(sample)
        return sample

    def _compute_percentile(self, timeframe: str) -> Decimal | None:
        seconds = TIMEFRAME_SECONDS.get(timeframe, 21600)
        cutoff = time.time() - seconds
        spreads = [float(s.spread) for s in self._samples if s.timestamp >= cutoff]

        if len(spreads) < 10:
            return None

        arr = np.array(spreads, dtype=np.float64)
        pct_value = self.config.percentile * 100
        result = float(np.percentile(arr, pct_value))
        return Decimal(str(round(result, 8)))

    def _compute_edge(self, current_spread: Decimal, target: Decimal, fees_rt: Decimal, slippage: Decimal) -> Decimal:
        return (current_spread - (target + fees_rt + slippage)).quantize(_Q8, rounding=ROUND_HALF_UP)

    # ── Order Execution ──

    async def _execute_pair_order(
        self, side_a: str, side_b: str, size: float, mid_a: float, mid_b: float
    ) -> tuple[OrderResult | None, OrderResult | None]:
        """Execute two orders simultaneously via bulk order."""
        if not self._exchange:
            logger.error(f"[Bot {self.bot_id}] No exchange connection")
            self.metrics.errors += 1
            return None, None

        tick_a = 0.01  # default tick size
        tick_b = 0.01
        slip_ticks = self.config.max_slippage_ticks

        # Aggressive pricing
        if side_a == "buy":
            price_a = mid_a + (tick_a * slip_ticks)
        else:
            price_a = mid_a - (tick_a * slip_ticks)

        if side_b == "buy":
            price_b = mid_b + (tick_b * slip_ticks)
        else:
            price_b = mid_b - (tick_b * slip_ticks)

        for attempt in range(self.config.order_retries):
            try:
                # Execute both orders in parallel using bulk_orders
                order_spec_a = {
                    "coin": self.pair_a,
                    "is_buy": side_a == "buy",
                    "sz": size,
                    "limit_px": round(price_a, 6),
                    "order_type": {"limit": {"tif": "Ioc"}},
                    "reduce_only": False,
                }
                order_spec_b = {
                    "coin": self.pair_b,
                    "is_buy": side_b == "buy",
                    "sz": size,
                    "limit_px": round(price_b, 6),
                    "order_type": {"limit": {"tif": "Ioc"}},
                    "reduce_only": False,
                }

                # Use bulk_orders for atomic execution
                results = self._exchange.bulk_orders([order_spec_a, order_spec_b])

                result_a = self._parse_order_result(results, 0, self.pair_a, side_a, size, mid_a)
                result_b = self._parse_order_result(results, 1, self.pair_b, side_b, size, mid_b)

                return result_a, result_b

            except (ConnectionError, TimeoutError, OSError) as e:
                delay = 0.1 * (2 ** attempt)
                logger.warning(f"[Bot {self.bot_id}] Order retry {attempt+1}: {e}")
                await asyncio.sleep(delay)
            except Exception as e:
                logger.error(f"[Bot {self.bot_id}] Order execution error: {e}")
                self.metrics.errors += 1
                return None, None

        self.metrics.errors += 1
        return None, None

    def _parse_order_result(self, bulk_result, idx: int, asset: str, side: str, size: float, mid: float) -> OrderResult:
        """Parse the Hyperliquid bulk_orders response for one leg."""
        try:
            statuses = bulk_result.get("response", {}).get("data", {}).get("statuses", [])
            if idx >= len(statuses):
                return OrderResult("", asset, side, size, mid, False, 0)

            status = statuses[idx]

            if "filled" in status:
                fill_info = status["filled"]
                oid = str(fill_info.get("oid", ""))
                avg_px = float(fill_info.get("avgPx", mid))
                slip = abs(avg_px - mid) / mid * 10000 if mid != 0 else 0
                return OrderResult(oid, asset, side, size, avg_px, True, round(slip, 2))

            if "resting" in status:
                oid = str(status["resting"].get("oid", ""))
                return OrderResult(oid, asset, side, size, mid, False, 0)

            return OrderResult("", asset, side, size, mid, False, 0)

        except Exception as e:
            logger.warning(f"[Bot {self.bot_id}] Parse order result error: {e}")
            return OrderResult("", asset, side, size, mid, False, 0)

    # ── One-Leg Guard ──

    async def _one_leg_check(self, result_a: OrderResult, result_b: OrderResult) -> bool:
        """Check if both legs filled. If only one filled, cancel and close."""
        if result_a.filled and result_b.filled:
            return True

        if not result_a.filled and not result_b.filled:
            return False

        # One-leg situation
        self.metrics.orphans += 1
        logger.warning(f"[Bot {self.bot_id}] ONE-LEG detected! A={result_a.filled}, B={result_b.filled}")

        # Try to cancel unfilled + market close filled
        try:
            if result_a.filled and not result_b.filled:
                # Cancel B, close A
                if result_b.order_id and self._exchange:
                    self._exchange.cancel(self.pair_b, result_b.order_id)
                # Market close A
                if self._exchange:
                    close_side = "sell" if result_a.side == "buy" else "buy"
                    self._exchange.order(
                        self.pair_a,
                        close_side == "buy",
                        result_a.size,
                        0,
                        {"limit": {"tif": "Ioc"}},
                        reduce_only=True,
                    )
            else:
                # Cancel A, close B
                if result_a.order_id and self._exchange:
                    self._exchange.cancel(self.pair_a, result_a.order_id)
                if self._exchange:
                    close_side = "sell" if result_b.side == "buy" else "buy"
                    self._exchange.order(
                        self.pair_b,
                        close_side == "buy",
                        result_b.size,
                        0,
                        {"limit": {"tif": "Ioc"}},
                        reduce_only=True,
                    )
        except Exception as e:
            logger.error(f"[Bot {self.bot_id}] One-leg cleanup error: {e}")
            self.metrics.errors += 1

        return False

    # ── Main Trading Loop ──

    async def _main_loop(self):
        """Core trading loop: runs every 200ms when state is RUNNING."""
        while not self._stop_event.is_set():
            try:
                if self.state != BotState.RUNNING:
                    await asyncio.sleep(0.5)
                    continue

                await self._tick()
                await asyncio.sleep(0.2)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"[Bot {self.bot_id}] Main loop error: {e}")
                self.metrics.errors += 1
                await asyncio.sleep(1.0)

    async def _tick(self):
        """Single tick: check orderbooks, compute spread, decide entry/exit."""
        mid_a = self._mid_price(self._book_a)
        mid_b = self._mid_price(self._book_b)
        if mid_a is None or mid_b is None:
            return

        sample = self._add_spread_sample(mid_a, mid_b)

        target = self._compute_percentile(self.config.timeframe)
        if target is None:
            return  # Not enough data yet

        fees_rt = DEFAULT_FEE_BPS * 4  # 2 legs × 2 (entry + exit)
        slip_margin = Decimal(str(self.config.max_slippage_ticks * 0.01 * 2))

        edge = self._compute_edge(sample.spread, target, fees_rt, slip_margin)
        min_edge = Decimal(str(self.config.min_edge_bps))

        if self._has_position and self._open_trade:
            await self._check_exit(mid_a, mid_b, float(fees_rt), float(slip_margin), float(edge))
        else:
            await self._check_entry(mid_a, mid_b, float(edge), float(min_edge), sample)

    async def _check_entry(self, mid_a: float, mid_b: float, edge: float, min_edge: float, sample: SpreadSample):
        if edge < min_edge:
            return

        if self._funding_blocked:
            logger.debug(f"[Bot {self.bot_id}] Entry blocked by funding")
            return

        size = self.config.max_position_size

        if self.direction == "long_a_short_b":
            side_a, side_b = "buy", "sell"
        else:
            side_a, side_b = "sell", "buy"

        logger.info(f"[Bot {self.bot_id}] ENTRY SIGNAL edge={edge:.2f}bps spread={sample.spread}")

        result_a, result_b = await self._execute_pair_order(side_a, side_b, size, mid_a, mid_b)

        if result_a is None or result_b is None:
            return

        # One-leg protection
        if self.config.one_leg_protection:
            both_filled = await self._one_leg_check(result_a, result_b)
            if not both_filled:
                return

        if not result_a.filled or not result_b.filled:
            return

        # Trade opened successfully
        self._has_position = True
        self.metrics.open += 1
        self.metrics.record_slippage(result_a.slippage_bps, result_b.slippage_bps)

        self._open_trade = {
            "entry_time": datetime.now(timezone.utc).isoformat(),
            "entry_price_a": result_a.price,
            "entry_price_b": result_b.price,
            "size": size,
            "side_a": side_a,
            "side_b": side_b,
            "entry_spread": float(sample.spread),
            "edge_at_entry": edge,
            "slippage_a": result_a.slippage_bps,
            "slippage_b": result_b.slippage_bps,
        }

        logger.info(f"[Bot {self.bot_id}] TRADE OPENED a={result_a.price} b={result_b.price} size={size}")

        # Persist via callback
        if self.on_trade_callback:
            self.on_trade_callback("open", self.bot_id, self._open_trade)

    async def _check_exit(self, mid_a: float, mid_b: float, fees_rt: float, slip_margin: float, current_edge: float):
        trade = self._open_trade
        if not trade:
            return

        entry_a = trade["entry_price_a"]
        entry_b = trade["entry_price_b"]
        size = trade["size"]

        # Compute net PnL
        if self.direction == "long_a_short_b":
            pnl_a = (mid_a - entry_a) * size
            pnl_b = (entry_b - mid_b) * size
        else:
            pnl_a = (entry_a - mid_a) * size
            pnl_b = (mid_b - entry_b) * size

        gross_pnl = pnl_a + pnl_b
        net_pnl = gross_pnl - fees_rt

        # Exit decision
        should_exit = False
        close_reason = ""

        if self.config.exit_mode == "on_profit":
            threshold = fees_rt + slip_margin + self.config.close_buffer_bps / 10000
            if net_pnl > threshold:
                should_exit = True
                close_reason = "on_profit"
        elif self.config.exit_mode == "on_reverse":
            if current_edge < 0:
                should_exit = True
                close_reason = "on_reverse"

        if not should_exit:
            return

        # Execute exit
        exit_side_a = "sell" if trade["side_a"] == "buy" else "buy"
        exit_side_b = "sell" if trade["side_b"] == "buy" else "buy"

        result_a, result_b = await self._execute_pair_order(exit_side_a, exit_side_b, size, mid_a, mid_b)

        if result_a is None or result_b is None:
            logger.warning(f"[Bot {self.bot_id}] Exit order failed, position still open")
            return

        # Record trade close
        actual_fees = fees_rt
        self.metrics.record_trade_close(net_pnl, actual_fees, size * (mid_a + mid_b))
        self.metrics.record_slippage(
            result_a.slippage_bps if result_a else 0,
            result_b.slippage_bps if result_b else 0,
        )

        logger.info(f"[Bot {self.bot_id}] TRADE CLOSED pnl={net_pnl:.6f} reason={close_reason}")

        # Persist via callback
        if self.on_trade_callback:
            trade_record = {
                **trade,
                "exit_time": datetime.now(timezone.utc).isoformat(),
                "exit_price_a": mid_a,
                "exit_price_b": mid_b,
                "pnl": net_pnl,
                "fees": actual_fees,
                "close_reason": close_reason,
            }
            self.on_trade_callback("close", self.bot_id, trade_record)

        self._has_position = False
        self._open_trade = None

    # ── Lifecycle ──

    async def start(self):
        if self.state == BotState.RUNNING:
            return

        self.state = BotState.CONNECTING
        logger.info(f"[Bot {self.bot_id}] Starting {self.name}...")

        if not self._connect_exchange():
            self.state = BotState.STOPPED
            raise RuntimeError(f"Bot {self.bot_id}: Failed to connect to Hyperliquid")

        self.state = BotState.RUNNING
        self._stop_event.clear()

        self._tasks = [
            asyncio.create_task(self._subscribe_orderbooks()),
            asyncio.create_task(self._main_loop()),
            asyncio.create_task(self._funding_loop()),
        ]

        logger.info(f"[Bot {self.bot_id}] RUNNING — {self.name}")

    async def stop(self):
        logger.info(f"[Bot {self.bot_id}] Stopping {self.name}...")
        self.state = BotState.PAUSED
        self._stop_event.set()

        for task in self._tasks:
            task.cancel()
        if self._tasks:
            await asyncio.gather(*self._tasks, return_exceptions=True)
        self._tasks.clear()

        self.state = BotState.STOPPED
        logger.info(f"[Bot {self.bot_id}] STOPPED")

    async def liquidate(self):
        """Emergency close all positions and stop."""
        logger.info(f"[Bot {self.bot_id}] LIQUIDATING...")
        self.state = BotState.LIQUIDATING

        if self._has_position and self._open_trade and self._exchange:
            try:
                trade = self._open_trade
                exit_side_a = "sell" if trade["side_a"] == "buy" else "buy"
                exit_side_b = "sell" if trade["side_b"] == "buy" else "buy"

                mid_a = self._mid_price(self._book_a) or trade["entry_price_a"]
                mid_b = self._mid_price(self._book_b) or trade["entry_price_b"]

                await self._execute_pair_order(exit_side_a, exit_side_b, trade["size"], mid_a, mid_b)
                self._has_position = False
                self._open_trade = None
            except Exception as e:
                logger.error(f"[Bot {self.bot_id}] Liquidation error: {e}")

        await self.stop()

    async def reset(self):
        await self.stop()
        self.metrics = BotMetrics()
        self._samples.clear()
        self._has_position = False
        self._open_trade = None
        self.state = BotState.STOPPED
        logger.info(f"[Bot {self.bot_id}] RESET complete")
