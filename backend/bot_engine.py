"""
Bot trading engine — connects to Hyperliquid, monitors spreads,
executes pair trades with all safety protections.

Each bot monitors multiple coin pairs (SILVER, TSLA, etc.) across two
HiP-3 deployers (e.g., xyz vs cash). WebSocket subscriptions use the
Hyperliquid format: deployer:COIN (e.g., xyz:SILVER, cash:SILVER).
"""
import asyncio
import json
import logging
import time
from collections import deque
from dataclasses import dataclass
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

# Map deployer labels to HiP-3 prefix (lowercase)
DEPLOYER_PREFIX = {
    "XYZ": "xyz",
    "CASH": "cash",
    "KM": "km",
    "FLX": "flx",
}


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
    coin: str  # which coin this sample is for


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
    Connects to Hyperliquid via SDK, subscribes to l2Book WebSocket
    for all enabled pairs across two deployers, calculates spreads,
    and executes pair trades.
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
        self.pair_a = pair_a       # deployer A label (e.g., "XYZ")
        self.pair_b = pair_b       # deployer B label (e.g., "CASH")
        self.direction = direction
        self.account_address = account_address
        self.api_key = api_key
        self.sub_account = sub_account
        self.config = config or BotConfig()
        self.on_trade_callback = on_trade_callback

        # HiP-3 deployer prefixes
        self._prefix_a = DEPLOYER_PREFIX.get(pair_a, pair_a.lower())
        self._prefix_b = DEPLOYER_PREFIX.get(pair_b, pair_b.lower())

        self.state = BotState.STOPPED
        self.metrics = BotMetrics()

        # Enabled trading pairs (coin symbols like SILVER, TSLA, etc.)
        self._enabled_pairs: list[str] = []

        # Hyperliquid SDK objects (created on start)
        self._exchange = None
        self._info = None

        # Spread tracking — per coin
        self._samples: dict[str, deque[SpreadSample]] = {}

        # Orderbook state — per HiP-3 symbol (e.g., "xyz:SILVER")
        self._books: dict[str, dict] = {}

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

    def set_enabled_pairs(self, pairs: list[str]):
        """Set the list of enabled coin symbols (e.g., ['SILVER', 'TSLA', 'GOLD'])."""
        self._enabled_pairs = pairs
        for coin in pairs:
            if coin not in self._samples:
                self._samples[coin] = deque(maxlen=50_000)
        logger.info(f"[Bot {self.bot_id}] Enabled pairs: {pairs}")

    def _hip3_symbol(self, deployer_prefix: str, coin: str) -> str:
        """Build HiP-3 symbol: deployer:COIN."""
        return f"{deployer_prefix}:{coin}"

    # ── Hyperliquid Connection ──

    def _connect_exchange(self):
        """Create Hyperliquid Exchange + Info clients using the agent wallet pattern."""
        if not self.account_address or not self.api_key:
            logger.error(f"[Bot {self.bot_id}] No credentials configured — cannot connect")
            return False

        try:
            import eth_account
            from hyperliquid.exchange import Exchange
            from hyperliquid.info import Info
            from hyperliquid.utils import constants

            base_url = constants.MAINNET_API_URL

            # Create agent wallet from API key (strip 0x prefix if present)
            key = self.api_key
            if key.startswith("0x"):
                key = key[2:]
            agent_wallet = eth_account.Account.from_key(key)

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
        """Subscribe to l2Book WebSocket for all enabled pairs on both deployers."""
        try:
            import websockets
        except ImportError:
            logger.error(f"[Bot {self.bot_id}] websockets library not installed")
            return

        if not self._enabled_pairs:
            logger.warning(f"[Bot {self.bot_id}] No enabled pairs — skipping WS subscription")
            return

        ws_url = "wss://api.hyperliquid.xyz/ws"

        # Build list of all HiP-3 symbols to subscribe to
        coins_to_sub = []
        for coin in self._enabled_pairs:
            sym_a = self._hip3_symbol(self._prefix_a, coin)
            sym_b = self._hip3_symbol(self._prefix_b, coin)
            coins_to_sub.append(sym_a)
            coins_to_sub.append(sym_b)

        logger.info(f"[Bot {self.bot_id}] Subscribing to {len(coins_to_sub)} l2Book channels: {coins_to_sub[:6]}...")

        backoff = 3
        max_backoff = 60

        while not self._stop_event.is_set():
            try:
                async with websockets.connect(
                    ws_url,
                    ping_interval=20,
                    ping_timeout=10,
                    close_timeout=5,
                ) as ws:
                    # Subscribe to all coins
                    for coin in coins_to_sub:
                        sub_msg = json.dumps({
                            "method": "subscribe",
                            "subscription": {"type": "l2Book", "coin": coin}
                        })
                        await ws.send(sub_msg)

                    logger.info(f"[Bot {self.bot_id}] WebSocket connected — subscribed to {len(coins_to_sub)} books")
                    backoff = 3  # Reset backoff on success

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
                                self._books[coin] = book
                        except Exception as e:
                            logger.debug(f"[Bot {self.bot_id}] WS parse error: {e}")

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.warning(f"[Bot {self.bot_id}] WS disconnected: {e}, reconnecting in {backoff}s...")
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, max_backoff)

    def _mid_price(self, book: dict) -> float | None:
        bids = book.get("bids", [])
        asks = book.get("asks", [])
        if not bids or not asks:
            return None
        return (bids[0][0] + asks[0][0]) / 2

    def _get_mids_for_coin(self, coin: str) -> tuple[float | None, float | None]:
        """Get mid prices for a coin from both deployers."""
        sym_a = self._hip3_symbol(self._prefix_a, coin)
        sym_b = self._hip3_symbol(self._prefix_b, coin)
        book_a = self._books.get(sym_a, {})
        book_b = self._books.get(sym_b, {})
        return self._mid_price(book_a), self._mid_price(book_b)

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

                    # Check funding for each enabled pair
                    for coin in self._enabled_pairs:
                        sym_a = self._hip3_symbol(self._prefix_a, coin)
                        sym_b = self._hip3_symbol(self._prefix_b, coin)
                        self._funding_a = rates.get(sym_a, 0.0)
                        self._funding_b = rates.get(sym_b, 0.0)
                        net = self._funding_a - self._funding_b

                        self._funding_blocked = (net < 0 and abs(net) > self.config.funding_rate_threshold)

                        if self._funding_blocked:
                            logger.info(f"[Bot {self.bot_id}] Funding blocked for {coin}: net={net:.6f}")
            except Exception as e:
                logger.warning(f"[Bot {self.bot_id}] Funding check error: {e}")

            try:
                await asyncio.wait_for(self._stop_event.wait(), timeout=60)
            except asyncio.TimeoutError:
                pass

    # ── Spread Calculation ──

    def _add_spread_sample(self, coin: str, mid_a: float, mid_b: float) -> SpreadSample:
        if mid_b == 0:
            spread = Decimal("0")
        else:
            spread = Decimal(str((mid_a - mid_b) / mid_b * 10000)).quantize(_Q8, rounding=ROUND_HALF_UP)

        sample = SpreadSample(
            timestamp=time.time(),
            spread=spread,
            mid_a=Decimal(str(mid_a)),
            mid_b=Decimal(str(mid_b)),
            coin=coin,
        )
        if coin not in self._samples:
            self._samples[coin] = deque(maxlen=50_000)
        self._samples[coin].append(sample)
        return sample

    def _compute_percentile(self, coin: str, timeframe: str) -> Decimal | None:
        samples = self._samples.get(coin)
        if not samples:
            return None

        seconds = TIMEFRAME_SECONDS.get(timeframe, 21600)
        cutoff = time.time() - seconds
        spreads = [float(s.spread) for s in samples if s.timestamp >= cutoff]

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
        self, coin: str, side_a: str, side_b: str, size: float, mid_a: float, mid_b: float
    ) -> tuple[OrderResult | None, OrderResult | None]:
        """Execute two orders simultaneously via bulk order."""
        if not self._exchange:
            logger.error(f"[Bot {self.bot_id}] No exchange connection")
            self.metrics.errors += 1
            return None, None

        sym_a = self._hip3_symbol(self._prefix_a, coin)
        sym_b = self._hip3_symbol(self._prefix_b, coin)

        tick_a = 0.01
        tick_b = 0.01
        slip_ticks = self.config.max_slippage_ticks

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
                order_spec_a = {
                    "coin": sym_a,
                    "is_buy": side_a == "buy",
                    "sz": size,
                    "limit_px": round(price_a, 6),
                    "order_type": {"limit": {"tif": "Ioc"}},
                    "reduce_only": False,
                }
                order_spec_b = {
                    "coin": sym_b,
                    "is_buy": side_b == "buy",
                    "sz": size,
                    "limit_px": round(price_b, 6),
                    "order_type": {"limit": {"tif": "Ioc"}},
                    "reduce_only": False,
                }

                results = self._exchange.bulk_orders([order_spec_a, order_spec_b])

                result_a = self._parse_order_result(results, 0, sym_a, side_a, size, mid_a)
                result_b = self._parse_order_result(results, 1, sym_b, side_b, size, mid_b)

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

    async def _one_leg_check(self, coin: str, result_a: OrderResult, result_b: OrderResult) -> bool:
        """Check if both legs filled. If only one filled, cancel and close."""
        if result_a.filled and result_b.filled:
            return True

        if not result_a.filled and not result_b.filled:
            return False

        sym_a = self._hip3_symbol(self._prefix_a, coin)
        sym_b = self._hip3_symbol(self._prefix_b, coin)

        self.metrics.orphans += 1
        logger.warning(f"[Bot {self.bot_id}] ONE-LEG detected on {coin}! A={result_a.filled}, B={result_b.filled}")

        try:
            if result_a.filled and not result_b.filled:
                if result_b.order_id and self._exchange:
                    self._exchange.cancel(sym_b, result_b.order_id)
                if self._exchange:
                    close_side = "sell" if result_a.side == "buy" else "buy"
                    self._exchange.order(
                        sym_a, close_side == "buy", result_a.size, 0,
                        {"limit": {"tif": "Ioc"}}, reduce_only=True,
                    )
            else:
                if result_a.order_id and self._exchange:
                    self._exchange.cancel(sym_a, result_a.order_id)
                if self._exchange:
                    close_side = "sell" if result_b.side == "buy" else "buy"
                    self._exchange.order(
                        sym_b, close_side == "buy", result_b.size, 0,
                        {"limit": {"tif": "Ioc"}}, reduce_only=True,
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
        """Single tick: iterate over all enabled pairs, find best opportunity."""
        if not self._enabled_pairs:
            return

        best_edge = None
        best_coin = None
        best_mid_a = None
        best_mid_b = None
        best_sample = None

        fees_rt = DEFAULT_FEE_BPS * 4  # 2 legs x 2 (entry + exit)
        slip_margin = Decimal(str(self.config.max_slippage_ticks * 0.01 * 2))
        min_edge = Decimal(str(self.config.min_edge_bps))

        for coin in self._enabled_pairs:
            mid_a, mid_b = self._get_mids_for_coin(coin)
            if mid_a is None or mid_b is None:
                continue

            sample = self._add_spread_sample(coin, mid_a, mid_b)
            target = self._compute_percentile(coin, self.config.timeframe)
            if target is None:
                continue

            edge = self._compute_edge(sample.spread, target, fees_rt, slip_margin)

            if best_edge is None or edge > best_edge:
                best_edge = edge
                best_coin = coin
                best_mid_a = mid_a
                best_mid_b = mid_b
                best_sample = sample

        if best_edge is None:
            return

        if self._has_position and self._open_trade:
            # Check exit on the coin we're currently holding
            open_coin = self._open_trade["coin"]
            open_mid_a, open_mid_b = self._get_mids_for_coin(open_coin)
            if open_mid_a is not None and open_mid_b is not None:
                open_target = self._compute_percentile(open_coin, self.config.timeframe)
                if open_target is not None:
                    open_edge = self._compute_edge(
                        self._add_spread_sample(open_coin, open_mid_a, open_mid_b).spread,
                        open_target, fees_rt, slip_margin
                    )
                    await self._check_exit(open_coin, open_mid_a, open_mid_b, float(fees_rt), float(slip_margin), float(open_edge))
        else:
            await self._check_entry(best_coin, best_mid_a, best_mid_b, float(best_edge), float(min_edge), best_sample)

    async def _check_entry(self, coin: str, mid_a: float, mid_b: float, edge: float, min_edge: float, sample: SpreadSample):
        if edge < min_edge:
            return

        if self._funding_blocked:
            logger.debug(f"[Bot {self.bot_id}] Entry blocked by funding on {coin}")
            return

        size = self.config.max_position_size

        if self.direction == "long_a_short_b":
            side_a, side_b = "buy", "sell"
        else:
            side_a, side_b = "sell", "buy"

        logger.info(f"[Bot {self.bot_id}] ENTRY SIGNAL {coin} edge={edge:.2f}bps spread={sample.spread}")

        result_a, result_b = await self._execute_pair_order(coin, side_a, side_b, size, mid_a, mid_b)

        if result_a is None or result_b is None:
            return

        if self.config.one_leg_protection:
            both_filled = await self._one_leg_check(coin, result_a, result_b)
            if not both_filled:
                return

        if not result_a.filled or not result_b.filled:
            return

        # Trade opened successfully
        self._has_position = True
        self.metrics.open += 1
        self.metrics.record_slippage(result_a.slippage_bps, result_b.slippage_bps)

        self._open_trade = {
            "coin": coin,
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

        logger.info(f"[Bot {self.bot_id}] TRADE OPENED {coin} a={result_a.price} b={result_b.price} size={size}")

        if self.on_trade_callback:
            self.on_trade_callback("open", self.bot_id, self._open_trade)

    async def _check_exit(self, coin: str, mid_a: float, mid_b: float, fees_rt: float, slip_margin: float, current_edge: float):
        trade = self._open_trade
        if not trade:
            return

        entry_a = trade["entry_price_a"]
        entry_b = trade["entry_price_b"]
        size = trade["size"]

        if self.direction == "long_a_short_b":
            pnl_a = (mid_a - entry_a) * size
            pnl_b = (entry_b - mid_b) * size
        else:
            pnl_a = (entry_a - mid_a) * size
            pnl_b = (mid_b - entry_b) * size

        gross_pnl = pnl_a + pnl_b
        net_pnl = gross_pnl - fees_rt

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

        exit_side_a = "sell" if trade["side_a"] == "buy" else "buy"
        exit_side_b = "sell" if trade["side_b"] == "buy" else "buy"

        result_a, result_b = await self._execute_pair_order(coin, exit_side_a, exit_side_b, size, mid_a, mid_b)

        if result_a is None or result_b is None:
            logger.warning(f"[Bot {self.bot_id}] Exit order failed on {coin}, position still open")
            return

        actual_fees = fees_rt
        self.metrics.record_trade_close(net_pnl, actual_fees, size * (mid_a + mid_b))
        self.metrics.record_slippage(
            result_a.slippage_bps if result_a else 0,
            result_b.slippage_bps if result_b else 0,
        )

        logger.info(f"[Bot {self.bot_id}] TRADE CLOSED {coin} pnl={net_pnl:.6f} reason={close_reason}")

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

        if not self.account_address or not self.api_key:
            raise RuntimeError(f"Bot {self.bot_id}: No credentials configured")

        if not self._enabled_pairs:
            raise RuntimeError(f"Bot {self.bot_id}: No trading pairs enabled")

        self.state = BotState.CONNECTING
        logger.info(f"[Bot {self.bot_id}] Starting {self.name} with {len(self._enabled_pairs)} pairs...")

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

        logger.info(f"[Bot {self.bot_id}] RUNNING — {self.name} — pairs: {self._enabled_pairs}")

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
                coin = trade["coin"]
                exit_side_a = "sell" if trade["side_a"] == "buy" else "buy"
                exit_side_b = "sell" if trade["side_b"] == "buy" else "buy"

                mid_a, mid_b = self._get_mids_for_coin(coin)
                mid_a = mid_a or trade["entry_price_a"]
                mid_b = mid_b or trade["entry_price_b"]

                await self._execute_pair_order(coin, exit_side_a, exit_side_b, trade["size"], mid_a, mid_b)
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
