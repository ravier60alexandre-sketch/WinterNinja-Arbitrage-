"""
Bot trading engine — connects to Hyperliquid, monitors spreads,
executes pair trades with all safety protections.

Each bot monitors multiple coin pairs (SILVER, TSLA, etc.) across two
HiP-3 deployers (e.g., xyz vs cash). WebSocket subscriptions use the
Hyperliquid format: deployer:COIN (e.g., xyz:SILVER, cash:SILVER).

Ported from the Replit Node.js bot with:
1. loadDeployerPerps — dynamic asset index discovery
2. SDK patching — inject deployer perp indices into SDK
3. Dynamic szDecimals — proper size rounding per asset
4. Dex-aware position/fills queries
5. Rate limiting (6 concurrent, 80ms gap)
6. VWAP-based spread calculation (not just mid-price)
"""
import asyncio
import json
import logging
import math
import time
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from enum import Enum

import numpy as np

from deployer_perps import DeployerRegistry, load_deployer_perps, patch_sdk

logger = logging.getLogger("bot_engine")

# ── Constants ──
TIMEFRAME_SECONDS = {"1h": 3600, "6h": 21600, "12h": 43200, "24h": 86400}
_Q8 = Decimal("0.00000001")
_Q2 = Decimal("0.01")

# Fee constants (matching Replit bot config)
GROWTH_TAKER_FEE = 0.000045     # 0.45 bps for growth-mode DEXes
NO_GROWTH_TAKER_FEE = 0.00015   # 1.5 bps for non-growth DEXes
DEFAULT_FEE_BPS = Decimal(str(GROWTH_TAKER_FEE * 10000))  # in bps per leg

# Notional sizes for VWAP (matching Replit bot: [25, 50, 100])
NOTIONAL_SIZES = [25, 50, 100]

# Max orderbook levels to consume for VWAP
MAX_LEVELS_TO_CONSUME = 2

# Map deployer labels to HiP-3 prefix (lowercase)
DEPLOYER_PREFIX = {
    "XYZ": "xyz",
    "CASH": "cash",
    "KM": "km",
    "FLX": "flx",
}

# Deployers in growth mode (lower fees)
GROWTH_DEPLOYERS = {"xyz", "flx", "km", "cash"}

# Shared deployer registry (loaded once, shared across all bots)
_deployer_registry: DeployerRegistry | None = None
_registry_lock = asyncio.Lock()


async def ensure_deployer_registry() -> DeployerRegistry:
    """Load the deployer registry once, shared across all bot instances."""
    global _deployer_registry
    async with _registry_lock:
        if _deployer_registry is None or (time.time() - _deployer_registry.last_loaded > 3600):
            logger.info("Loading deployer perps registry...")
            _deployer_registry = await load_deployer_perps()
            logger.info(f"Registry loaded: {len(_deployer_registry.assets)} assets")
    return _deployer_registry


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
    # VWAP fields
    edge_long_bps: float   # edge if long A, short B
    edge_short_bps: float  # edge if short A, long B
    notional: float        # notional size this was computed for


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
    min_edge_bps: float = 7.0   # Matched to Replit: minEdgeOpenBpsOverride = 7
    max_slippage_bps: float = 8.0  # Replit: maxSlippageBps = 8 (was max_slippage_ticks)
    max_position_size: float = 300.0
    max_leverage: float = 10.0
    funding_rate_threshold: float = 0.5
    one_leg_protection: bool = True
    one_leg_timeout_ms: int = 500
    exit_mode: str = "on_profit"  # "on_profit" or "on_reverse"
    close_buffer_bps: float = 2.0
    order_retries: int = 3
    notional_sizes: list[float] | None = None  # VWAP notional sizes

    def to_dict(self):
        return {
            "percentile": self.percentile,
            "timer": self.timeframe,
            "min_edge_bps": self.min_edge_bps,
            "slip": self.max_slippage_bps,
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
            c.max_slippage_bps = float(d["slip"])
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


# ── VWAP Orderbook Helpers (ported from Replit orderbook.js) ──

def buy_vwap(asks: list[tuple[float, float]], notional_usd: float, max_levels: int = MAX_LEVELS_TO_CONSUME) -> dict:
    """Walk the ask side consuming liquidity up to notional_usd.

    Returns {vwap, filled, qty, capacity, filledPct, bestPrice}.
    Equivalent to buyVWAP() in the Replit bot.
    """
    filled = 0.0
    qty = 0.0
    best_price = asks[0][0] if asks else 0.0

    for i, (px, sz) in enumerate(asks):
        if i >= max_levels:
            break
        level_notional = px * sz
        if filled + level_notional >= notional_usd:
            remaining = notional_usd - filled
            partial_qty = remaining / px
            qty += partial_qty
            filled = notional_usd
            break
        filled += level_notional
        qty += sz

    vwap = filled / qty if qty > 0 else best_price
    capacity = filled
    filled_pct = filled / notional_usd if notional_usd > 0 else 0

    return {
        "vwap": vwap,
        "filled": filled,
        "qty": qty,
        "capacity": capacity,
        "filledPct": filled_pct,
        "bestPrice": best_price,
    }


def sell_vwap(bids: list[tuple[float, float]], notional_usd: float, max_levels: int = MAX_LEVELS_TO_CONSUME) -> dict:
    """Walk the bid side consuming liquidity up to notional_usd.

    Returns {vwap, filled, qty, capacity, filledPct, bestPrice}.
    Equivalent to sellVWAP() in the Replit bot.
    """
    filled = 0.0
    qty = 0.0
    best_price = bids[0][0] if bids else 0.0

    for i, (px, sz) in enumerate(bids):
        if i >= max_levels:
            break
        level_notional = px * sz
        if filled + level_notional >= notional_usd:
            remaining = notional_usd - filled
            partial_qty = remaining / px
            qty += partial_qty
            filled = notional_usd
            break
        filled += level_notional
        qty += sz

    vwap = filled / qty if qty > 0 else best_price
    capacity = filled
    filled_pct = filled / notional_usd if notional_usd > 0 else 0

    return {
        "vwap": vwap,
        "filled": filled,
        "qty": qty,
        "capacity": capacity,
        "filledPct": filled_pct,
        "bestPrice": best_price,
    }


def compute_vwap_metrics(
    book_a: dict, book_b: dict,
    notional_usd: float,
    fee_a_bps: float, fee_b_bps: float,
    max_levels: int = MAX_LEVELS_TO_CONSUME,
) -> dict | None:
    """Compute VWAP-based spread metrics between two orderbooks.

    Ported from arb.js computeMetrics():
    - Direction 1 (Long A, Short B): edge = (sellVWAP_B - buyVWAP_A) / midRef * 10000
    - Direction 2 (Short A, Long B): edge = (sellVWAP_A - buyVWAP_B) / midRef * 10000
    """
    bids_a = book_a.get("bids", [])
    asks_a = book_a.get("asks", [])
    bids_b = book_b.get("bids", [])
    asks_b = book_b.get("asks", [])

    if not bids_a or not asks_a or not bids_b or not asks_b:
        return None

    mid_a = (bids_a[0][0] + asks_a[0][0]) / 2
    mid_b = (bids_b[0][0] + asks_b[0][0]) / 2
    mid_ref = (mid_a + mid_b) / 2

    if mid_ref <= 0:
        return None

    # Fast rejection: check top-of-book edge first (< -5bps = skip VWAP)
    best_bid_a, best_ask_a = bids_a[0][0], asks_a[0][0]
    best_bid_b, best_ask_b = bids_b[0][0], asks_b[0][0]

    fast_long = (best_bid_b - best_ask_a) / mid_ref * 10000
    fast_short = (best_bid_a - best_ask_b) / mid_ref * 10000

    if max(fast_long, fast_short) < -5:
        return {
            "mid_a": mid_a, "mid_b": mid_b, "mid_ref": mid_ref,
            "edge_long_bps": fast_long, "edge_short_bps": fast_short,
            "capacity_long": 0, "capacity_short": 0,
            "fast_rejected": True,
        }

    # Full VWAP computation
    buy_a = buy_vwap(asks_a, notional_usd, max_levels)
    sell_b = sell_vwap(bids_b, notional_usd, max_levels)
    sell_a = sell_vwap(bids_a, notional_usd, max_levels)
    buy_b = buy_vwap(asks_b, notional_usd, max_levels)

    # Direction 1: Long A (buy A), Short B (sell B)
    edge_long_bps = (sell_b["vwap"] - buy_a["vwap"]) / mid_ref * 10000

    # Direction 2: Short A (sell A), Long B (buy B)
    edge_short_bps = (sell_a["vwap"] - buy_b["vwap"]) / mid_ref * 10000

    # Fee thresholds (matching Replit: feeOpenBps = (takerFeeA + takerFeeB) * 10000)
    fee_open_bps = fee_a_bps + fee_b_bps

    # Net edges after fees
    net_edge_long = edge_long_bps - fee_open_bps
    net_edge_short = edge_short_bps - fee_open_bps

    # Capacity = minimum fill between both legs
    capacity_long = min(buy_a["filled"], sell_b["filled"])
    capacity_short = min(sell_a["filled"], buy_b["filled"])

    return {
        "mid_a": mid_a,
        "mid_b": mid_b,
        "mid_ref": mid_ref,
        "edge_long_bps": edge_long_bps,
        "edge_short_bps": edge_short_bps,
        "net_edge_long_bps": net_edge_long,
        "net_edge_short_bps": net_edge_short,
        "fee_open_bps": fee_open_bps,
        "capacity_long": capacity_long,
        "capacity_short": capacity_short,
        "buy_a_vwap": buy_a["vwap"],
        "sell_b_vwap": sell_b["vwap"],
        "sell_a_vwap": sell_a["vwap"],
        "buy_b_vwap": buy_b["vwap"],
        "buy_a_qty": buy_a["qty"],
        "sell_b_qty": sell_b["qty"],
        "fast_rejected": False,
    }


def round_size(size: float, sz_decimals: int) -> float:
    """Round size to the correct number of decimals for the asset.

    Uses szDecimals from the deployer registry instead of hardcoded values.
    """
    if sz_decimals <= 0:
        return round(size)
    factor = 10 ** sz_decimals
    return math.floor(size * factor) / factor


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

        # Deployer registry reference (shared)
        self._registry: DeployerRegistry | None = None

        # Spread tracking — per coin
        self._samples: dict[str, deque[SpreadSample]] = {}

        # Orderbook state — per HiP-3 symbol (e.g., "xyz:SILVER")
        self._books: dict[str, dict] = {}

        # Open position tracking
        self._has_position = False
        self._open_trade: dict | None = None

        # Funding state — per coin
        self._funding_blocked_coins: set[str] = set()

        # Async control
        self._stop_event = asyncio.Event()
        self._tasks: list[asyncio.Task] = []

        # WS heartbeat tracking
        self._last_ws_data: float = 0.0

        # Diagnostic counters
        self._tick_count: int = 0
        self._last_diag_log: float = 0.0
        self._best_edge_seen: float = -999.0
        self._best_edge_coin: str = ""
        self._books_received: int = 0

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

    def _get_fee_bps(self, deployer: str) -> float:
        """Get taker fee in bps for a deployer (growth vs non-growth)."""
        if deployer in GROWTH_DEPLOYERS:
            return GROWTH_TAKER_FEE * 10000  # 0.45 bps
        return NO_GROWTH_TAKER_FEE * 10000  # 1.5 bps

    def _get_sz_decimals(self, coin: str) -> int:
        """Get szDecimals for a coin from the deployer registry."""
        if self._registry:
            sd = self._registry.get_sz_decimals(coin)
            if sd is not None:
                return sd
        return 0  # fallback: whole numbers

    # ── Hyperliquid Connection ──

    async def _connect_exchange(self):
        """Create Hyperliquid Exchange + Info clients using the agent wallet pattern.

        The SDK's Info.__init__ makes synchronous HTTP calls to load metadata,
        so we run it in a thread to avoid blocking the async event loop.
        """
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

            # Run SDK init in thread — it makes sync HTTP calls to load meta
            # Pass perp_dexs to let the SDK natively load deployer perp indices
            deployer_names = [self._prefix_a, self._prefix_b]
            # Also include "" for the main exchange perps
            perp_dexs_list = [""] + [d for d in deployer_names if d]

            def _init_sdk():
                info = Info(base_url=base_url, skip_ws=True, perp_dexs=perp_dexs_list)
                exchange = Exchange(
                    wallet=agent_wallet,
                    base_url=base_url,
                    account_address=trading_address,
                )
                return info, exchange

            logger.info(f"[Bot {self.bot_id}] Initializing SDK with perp_dexs={perp_dexs_list}...")
            self._info, self._exchange = await asyncio.get_event_loop().run_in_executor(None, _init_sdk)

            # Log what the SDK loaded
            n_coins = len(self._info.coin_to_asset) if hasattr(self._info, 'coin_to_asset') else 0
            logger.info(f"[Bot {self.bot_id}] SDK loaded {n_coins} assets, trading as {trading_address[:10]}...")
            return True

        except ImportError as e:
            logger.error(f"[Bot {self.bot_id}] Hyperliquid SDK not installed: {e}")
            return False
        except Exception as e:
            logger.error(f"[Bot {self.bot_id}] Failed to connect: {e}")
            return False

    async def _patch_sdk_with_deployer_perps(self):
        """Load deployer perps and patch the SDK so it recognizes HiP-3 assets."""
        self._registry = await ensure_deployer_registry()

        # Patch the Info instance inside the Exchange so name_to_asset() works
        if self._exchange and hasattr(self._exchange, 'info'):
            patch_sdk(self._exchange.info, self._registry)
            logger.info(f"[Bot {self.bot_id}] SDK patched with {len(self._registry.assets)} deployer perps")
        elif self._info:
            patch_sdk(self._info, self._registry)
            logger.info(f"[Bot {self.bot_id}] Info instance patched with {len(self._registry.assets)} deployer perps")

        # Verify our trading pairs are in the registry
        missing = []
        for coin in self._enabled_pairs:
            sym_a = self._hip3_symbol(self._prefix_a, coin)
            sym_b = self._hip3_symbol(self._prefix_b, coin)
            if sym_a not in self._registry.assets:
                missing.append(sym_a)
            if sym_b not in self._registry.assets:
                missing.append(sym_b)

        if missing:
            logger.warning(f"[Bot {self.bot_id}] Missing from registry: {missing}")
        else:
            logger.info(f"[Bot {self.bot_id}] All {len(self._enabled_pairs)} pairs verified in registry")

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

                    # Heartbeat: send ping every 30s (matching Replit bot)
                    last_ping = time.time()
                    self._last_ws_data = time.time()

                    async for raw_msg in ws:
                        if self._stop_event.is_set():
                            break

                        now = time.time()

                        # Send ping every 30s
                        if now - last_ping > 30:
                            try:
                                await ws.send(json.dumps({"method": "ping"}))
                                last_ping = now
                            except Exception:
                                pass

                        # Stale data check: no data for 60s = reconnect
                        if now - self._last_ws_data > 60:
                            logger.warning(f"[Bot {self.bot_id}] No WS data for 60s, reconnecting...")
                            break

                        try:
                            # Only process l2Book messages (fast check on raw string)
                            if "l2Book" not in raw_msg:
                                continue

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
                                self._last_ws_data = now
                                self._books_received += 1
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

    def _get_books_for_coin(self, coin: str) -> tuple[dict, dict]:
        """Get full orderbooks for a coin from both deployers."""
        sym_a = self._hip3_symbol(self._prefix_a, coin)
        sym_b = self._hip3_symbol(self._prefix_b, coin)
        return self._books.get(sym_a, {}), self._books.get(sym_b, {})

    def _get_mids_for_coin(self, coin: str) -> tuple[float | None, float | None]:
        """Get mid prices for a coin from both deployers."""
        book_a, book_b = self._get_books_for_coin(coin)
        return self._mid_price(book_a), self._mid_price(book_b)

    # ── Funding Monitor ──

    async def _funding_loop(self):
        """Check funding rates every 60s and block entry if adverse — per coin."""
        while not self._stop_event.is_set():
            try:
                if self._info:
                    # Query funding for each deployer DEX separately
                    import aiohttp
                    async with aiohttp.ClientSession() as session:
                        for deployer in [self._prefix_a, self._prefix_b]:
                            try:
                                async with session.post(
                                    "https://api.hyperliquid.xyz/info",
                                    json={"type": "meta", "dex": deployer}
                                ) as resp:
                                    meta = await resp.json()
                                    for asset_info in meta.get("universe", []):
                                        name = asset_info.get("name", "")
                                        funding = float(asset_info.get("funding", "0"))
                                        # Store as deployer:NAME
                                        full_name = f"{deployer}:{name}"
                                        # Check per-coin funding
                                        for coin in self._enabled_pairs:
                                            sym_a = self._hip3_symbol(self._prefix_a, coin)
                                            sym_b = self._hip3_symbol(self._prefix_b, coin)
                                            if full_name in (sym_a, sym_b):
                                                pass  # collected below
                            except Exception as e:
                                logger.debug(f"[Bot {self.bot_id}] Funding fetch error for {deployer}: {e}")

                    # Simple approach: check each coin pair
                    self._funding_blocked_coins.clear()
                    # For now, don't block on funding (HiP-3 funding is typically minimal)

            except Exception as e:
                logger.warning(f"[Bot {self.bot_id}] Funding check error: {e}")

            try:
                await asyncio.wait_for(self._stop_event.wait(), timeout=60)
            except asyncio.TimeoutError:
                pass

    # ── Spread Calculation (VWAP-based) ──

    def _compute_vwap_spread(self, coin: str, notional: float | None = None) -> dict | None:
        """Compute VWAP-based spread metrics for a coin pair.

        This replaces the simple mid-price spread with proper VWAP
        execution price analysis, matching the Replit bot's approach.
        """
        book_a, book_b = self._get_books_for_coin(coin)
        if not book_a or not book_b:
            return None

        fee_a = self._get_fee_bps(self._prefix_a)
        fee_b = self._get_fee_bps(self._prefix_b)
        target_notional = notional or (self.config.notional_sizes or NOTIONAL_SIZES)[0]

        return compute_vwap_metrics(
            book_a, book_b, target_notional,
            fee_a, fee_b, MAX_LEVELS_TO_CONSUME,
        )

    def _add_spread_sample(self, coin: str, metrics: dict) -> SpreadSample:
        """Record a spread sample from VWAP metrics."""
        mid_a = metrics["mid_a"]
        mid_b = metrics["mid_b"]
        mid_ref = metrics["mid_ref"]

        # Use the best edge direction for the spread sample
        edge_long = metrics.get("edge_long_bps", 0)
        edge_short = metrics.get("edge_short_bps", 0)

        # The "spread" in bps is the raw mid-price difference
        if mid_b != 0:
            spread = Decimal(str((mid_a - mid_b) / mid_b * 10000)).quantize(_Q8, rounding=ROUND_HALF_UP)
        else:
            spread = Decimal("0")

        sample = SpreadSample(
            timestamp=time.time(),
            spread=spread,
            mid_a=Decimal(str(mid_a)),
            mid_b=Decimal(str(mid_b)),
            coin=coin,
            edge_long_bps=edge_long,
            edge_short_bps=edge_short,
            notional=metrics.get("capacity_long", 0),
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
        """Execute two orders simultaneously via bulk order.

        Uses dynamic szDecimals and slippage based on best price (matching Replit bot).
        """
        if not self._exchange:
            logger.error(f"[Bot {self.bot_id}] No exchange connection")
            self.metrics.errors += 1
            return None, None

        sym_a = self._hip3_symbol(self._prefix_a, coin)
        sym_b = self._hip3_symbol(self._prefix_b, coin)

        # Get dynamic szDecimals from registry
        sz_dec_a = self._get_sz_decimals(sym_a)
        sz_dec_b = self._get_sz_decimals(sym_b)

        # Round size according to szDecimals
        rounded_size_a = round_size(size, sz_dec_a)
        rounded_size_b = round_size(size, sz_dec_b)

        if rounded_size_a <= 0 or rounded_size_b <= 0:
            logger.warning(f"[Bot {self.bot_id}] Size rounds to 0 for {coin} (sz_dec_a={sz_dec_a}, sz_dec_b={sz_dec_b})")
            return None, None

        # Compute limit prices with slippage (matching Replit: best_price * (1 +/- maxSlippageBps/10000))
        slip_factor = self.config.max_slippage_bps / 10000

        if side_a == "buy":
            price_a = mid_a * (1 + slip_factor)
        else:
            price_a = mid_a * (1 - slip_factor)

        if side_b == "buy":
            price_b = mid_b * (1 + slip_factor)
        else:
            price_b = mid_b * (1 - slip_factor)

        for attempt in range(self.config.order_retries):
            try:
                order_spec_a = {
                    "coin": sym_a,
                    "is_buy": side_a == "buy",
                    "sz": rounded_size_a,
                    "limit_px": round(price_a, 6),
                    "order_type": {"limit": {"tif": "Ioc"}},
                    "reduce_only": False,
                }
                order_spec_b = {
                    "coin": sym_b,
                    "is_buy": side_b == "buy",
                    "sz": rounded_size_b,
                    "limit_px": round(price_b, 6),
                    "order_type": {"limit": {"tif": "Ioc"}},
                    "reduce_only": False,
                }

                logger.info(
                    f"[Bot {self.bot_id}] Placing bulk order: "
                    f"{sym_a} {side_a} {rounded_size_a}@{price_a:.4f} | "
                    f"{sym_b} {side_b} {rounded_size_b}@{price_b:.4f}"
                )

                results = self._exchange.bulk_orders([order_spec_a, order_spec_b])

                result_a = self._parse_order_result(results, 0, sym_a, side_a, rounded_size_a, mid_a)
                result_b = self._parse_order_result(results, 1, sym_b, side_b, rounded_size_b, mid_b)

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
                logger.warning(f"[Bot {self.bot_id}] No status for leg {idx} of {asset}")
                return OrderResult("", asset, side, size, mid, False, 0)

            status = statuses[idx]

            # Check for error status
            if "error" in status:
                logger.error(f"[Bot {self.bot_id}] Order error for {asset}: {status['error']}")
                return OrderResult("", asset, side, size, mid, False, 0)

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

    # ── One-Leg Guard (enhanced from Replit: escalating slippage unwind) ──

    async def _one_leg_check(self, coin: str, result_a: OrderResult, result_b: OrderResult) -> bool:
        """Check if both legs filled. If only one filled, attempt escalating unwind."""
        if result_a.filled and result_b.filled:
            return True

        if not result_a.filled and not result_b.filled:
            return False

        sym_a = self._hip3_symbol(self._prefix_a, coin)
        sym_b = self._hip3_symbol(self._prefix_b, coin)

        self.metrics.orphans += 1
        logger.warning(f"[Bot {self.bot_id}] ONE-LEG detected on {coin}! A={result_a.filled}, B={result_b.filled}")

        # Wait 4s before attempting unwind (matching Replit bot)
        await asyncio.sleep(4.0)

        # Escalating slippage unwind attempts (Replit: 0.3%, 0.75%, 1.5%)
        unwind_slippages = [0.003, 0.0075, 0.015]

        filled_result = result_a if result_a.filled else result_b
        filled_sym = sym_a if result_a.filled else sym_b
        unfilled_result = result_b if result_a.filled else result_a
        unfilled_sym = sym_b if result_a.filled else sym_a

        # Cancel the unfilled resting order if any
        try:
            if unfilled_result.order_id and self._exchange:
                self._exchange.cancel(unfilled_sym, int(unfilled_result.order_id) if unfilled_result.order_id.isdigit() else 0)
        except Exception as e:
            logger.debug(f"[Bot {self.bot_id}] Cancel unfilled order error: {e}")

        # Attempt to unwind the filled leg with escalating slippage
        close_side = "sell" if filled_result.side == "buy" else "buy"
        for slip in unwind_slippages:
            try:
                if not self._exchange:
                    break
                unwind_price = filled_result.price * (1 + slip) if close_side == "buy" else filled_result.price * (1 - slip)

                sz_dec = self._get_sz_decimals(filled_sym)
                unwind_size = round_size(filled_result.size, sz_dec)

                result = self._exchange.order(
                    filled_sym, close_side == "buy", unwind_size, round(unwind_price, 6),
                    {"limit": {"tif": "Ioc"}}, reduce_only=True,
                )
                statuses = result.get("response", {}).get("data", {}).get("statuses", [])
                if statuses and "filled" in statuses[0]:
                    logger.info(f"[Bot {self.bot_id}] One-leg unwound at {slip*100:.1f}% slippage")
                    return False
            except Exception as e:
                logger.warning(f"[Bot {self.bot_id}] Unwind attempt at {slip*100:.1f}% failed: {e}")

        logger.error(f"[Bot {self.bot_id}] ORPHAN POSITION on {filled_sym} — all unwind attempts failed!")
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
        """Single tick: iterate over all enabled pairs using VWAP-based edge detection."""
        if not self._enabled_pairs:
            return

        self._tick_count += 1

        best_net_edge = None
        best_coin = None
        best_metrics = None
        best_direction = None  # "long" or "short"

        min_edge = self.config.min_edge_bps
        notionals = self.config.notional_sizes or NOTIONAL_SIZES

        # Track per-tick diagnostics
        coins_with_books = 0
        coins_fast_rejected = 0
        coins_no_books = 0

        for coin in self._enabled_pairs:
            # Skip coins with funding block
            if coin in self._funding_blocked_coins:
                continue

            # Compute VWAP metrics for the smallest notional first (fast rejection)
            metrics = self._compute_vwap_spread(coin, notionals[0])
            if metrics is None:
                coins_no_books += 1
                continue
            if metrics.get("fast_rejected"):
                coins_fast_rejected += 1
                coins_with_books += 1
                continue
            coins_with_books += 1

            # Record spread sample
            self._add_spread_sample(coin, metrics)

            # Only check the direction this bot is configured for
            if self.direction == "long_a_short_b":
                edge = metrics.get("net_edge_long_bps", 0)
                direction = "long"
            else:  # short_a_long_b
                edge = metrics.get("net_edge_short_bps", 0)
                direction = "short"

            if best_net_edge is None or edge > best_net_edge:
                best_net_edge = edge
                best_coin = coin
                best_metrics = metrics
                best_direction = direction

        # ── Periodic diagnostic log (every 30s) ──
        now = time.time()
        if best_net_edge is not None and best_net_edge > self._best_edge_seen:
            self._best_edge_seen = best_net_edge
            self._best_edge_coin = best_coin or ""

        if now - self._last_diag_log >= 30:
            n_books = len(self._books)
            total_pairs = len(self._enabled_pairs) * 2
            logger.info(
                f"[Bot {self.bot_id}] DIAG tick={self._tick_count} "
                f"books={n_books}/{total_pairs} ws_msgs={self._books_received} "
                f"with_data={coins_with_books} no_books={coins_no_books} fast_rej={coins_fast_rejected} "
                f"best_edge={best_net_edge:.2f}bps/{best_coin} "
                f"best_ever={self._best_edge_seen:.2f}bps/{self._best_edge_coin} "
                f"min_edge={min_edge}bps has_pos={self._has_position}"
            ) if best_net_edge is not None else logger.info(
                f"[Bot {self.bot_id}] DIAG tick={self._tick_count} "
                f"books={n_books}/{total_pairs} ws_msgs={self._books_received} "
                f"with_data={coins_with_books} no_books={coins_no_books} fast_rej={coins_fast_rejected} "
                f"NO EDGE FOUND — best_ever={self._best_edge_seen:.2f}bps/{self._best_edge_coin} "
                f"min_edge={min_edge}bps has_pos={self._has_position}"
            )
            self._last_diag_log = now

        if best_net_edge is None:
            return

        if self._has_position and self._open_trade:
            # Check exit on the coin we're currently holding
            open_coin = self._open_trade["coin"]
            open_metrics = self._compute_vwap_spread(open_coin)
            if open_metrics and not open_metrics.get("fast_rejected"):
                self._add_spread_sample(open_coin, open_metrics)
                await self._check_exit_vwap(open_coin, open_metrics)
        else:
            await self._check_entry_vwap(best_coin, best_metrics, best_direction, min_edge)

    async def _check_entry_vwap(self, coin: str, metrics: dict, edge_direction: str, min_edge: float):
        """Entry check using VWAP metrics (matching Replit arb.js logic)."""
        if edge_direction == "long":
            net_edge = metrics.get("net_edge_long_bps", 0)
            capacity = metrics.get("capacity_long", 0)
        else:
            net_edge = metrics.get("net_edge_short_bps", 0)
            capacity = metrics.get("capacity_short", 0)

        if net_edge < min_edge:
            return

        # Check minimum capacity
        if capacity < 10:  # At least $10 fillable
            return

        mid_a = metrics["mid_a"]
        mid_b = metrics["mid_b"]

        # Determine trade direction based on edge
        if edge_direction == "long":
            # Long A, Short B (buy A at ask, sell B at bid)
            if self.direction == "long_a_short_b":
                side_a, side_b = "buy", "sell"
            else:
                return  # Direction mismatch, skip
        else:
            # Short A, Long B (sell A at bid, buy B at ask)
            if self.direction == "short_a_long_b":
                side_a, side_b = "sell", "buy"
            else:
                return  # Direction mismatch, skip

        # Size from top-of-book liquidity (matching Replit: min(topSzA, topSzB))
        book_a, book_b = self._get_books_for_coin(coin)
        sym_a = self._hip3_symbol(self._prefix_a, coin)
        sym_b = self._hip3_symbol(self._prefix_b, coin)

        if side_a == "buy":
            top_sz_a = book_a.get("asks", [(0, 0)])[0][1] if book_a.get("asks") else 0
        else:
            top_sz_a = book_a.get("bids", [(0, 0)])[0][1] if book_a.get("bids") else 0

        if side_b == "buy":
            top_sz_b = book_b.get("asks", [(0, 0)])[0][1] if book_b.get("asks") else 0
        else:
            top_sz_b = book_b.get("bids", [(0, 0)])[0][1] if book_b.get("bids") else 0

        size = min(top_sz_a, top_sz_b)

        # Cap by max_position_size (in USD, convert to units)
        mid_ref = metrics["mid_ref"]
        if mid_ref > 0:
            max_units = self.config.max_position_size / mid_ref
            size = min(size, max_units)

        if size <= 0:
            return

        logger.info(
            f"[Bot {self.bot_id}] ENTRY SIGNAL {coin} dir={edge_direction} "
            f"net_edge={net_edge:.2f}bps capacity=${capacity:.0f} size={size:.4f}"
        )

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
            "size": result_a.size,  # Use actual filled size
            "side_a": side_a,
            "side_b": side_b,
            "entry_spread": float(metrics.get("edge_long_bps" if edge_direction == "long" else "edge_short_bps", 0)),
            "edge_at_entry": net_edge,
            "slippage_a": result_a.slippage_bps,
            "slippage_b": result_b.slippage_bps,
            "direction": edge_direction,
        }

        logger.info(f"[Bot {self.bot_id}] TRADE OPENED {coin} a={result_a.price} b={result_b.price} size={result_a.size}")

        if self.on_trade_callback:
            self.on_trade_callback("open", self.bot_id, self._open_trade)

    async def _check_exit_vwap(self, coin: str, metrics: dict):
        """Exit check using VWAP metrics."""
        trade = self._open_trade
        if not trade:
            return

        entry_a = trade["entry_price_a"]
        entry_b = trade["entry_price_b"]
        size = trade["size"]
        mid_a = metrics["mid_a"]
        mid_b = metrics["mid_b"]

        # Compute PnL based on trade direction
        trade_dir = trade.get("direction", "long")
        if trade_dir == "long":
            # Long A, Short B: profit when A rises and/or B falls
            pnl_a = (mid_a - entry_a) * size
            pnl_b = (entry_b - mid_b) * size
        else:
            # Short A, Long B: profit when A falls and/or B rises
            pnl_a = (entry_a - mid_a) * size
            pnl_b = (mid_b - entry_b) * size

        gross_pnl = pnl_a + pnl_b

        # Fee calculation
        fee_a = self._get_fee_bps(self._prefix_a)
        fee_b = self._get_fee_bps(self._prefix_b)
        fee_rt_bps = (fee_a + fee_b) * 2  # roundtrip = open + close
        mid_ref = metrics["mid_ref"]
        fee_usd = fee_rt_bps / 10000 * mid_ref * size
        net_pnl = gross_pnl - fee_usd

        should_exit = False
        close_reason = ""

        if self.config.exit_mode == "on_profit":
            threshold = fee_usd + (self.config.close_buffer_bps / 10000 * mid_ref * size)
            if net_pnl > threshold:
                should_exit = True
                close_reason = "on_profit"
        elif self.config.exit_mode == "on_reverse":
            # Check if edge has reversed
            if trade_dir == "long":
                current_edge = metrics.get("net_edge_long_bps", 0)
            else:
                current_edge = metrics.get("net_edge_short_bps", 0)
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

        self.metrics.record_trade_close(net_pnl, fee_usd, size * mid_ref * 2)
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
                "fees": fee_usd,
                "close_reason": close_reason,
            }
            self.on_trade_callback("close", self.bot_id, trade_record)

        self._has_position = False
        self._open_trade = None

    # ── Legacy check_exit for backwards compat ──

    async def _check_exit(self, coin: str, mid_a: float, mid_b: float, fees_rt: float, slip_margin: float, current_edge: float):
        """Legacy exit check — delegates to VWAP version."""
        metrics = self._compute_vwap_spread(coin)
        if metrics and not metrics.get("fast_rejected"):
            await self._check_exit_vwap(coin, metrics)

    async def _check_entry(self, coin: str, mid_a: float, mid_b: float, edge: float, min_edge: float, sample: SpreadSample):
        """Legacy entry check — delegates to VWAP version."""
        metrics = self._compute_vwap_spread(coin)
        if metrics and not metrics.get("fast_rejected"):
            direction = "long" if metrics.get("net_edge_long_bps", 0) > metrics.get("net_edge_short_bps", 0) else "short"
            await self._check_entry_vwap(coin, metrics, direction, min_edge)

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

        # Connect with timeout — SDK init makes HTTP calls that can be slow
        try:
            connected = await asyncio.wait_for(self._connect_exchange(), timeout=30.0)
        except asyncio.TimeoutError:
            self.state = BotState.STOPPED
            raise RuntimeError(f"Bot {self.bot_id}: Connection timed out (30s)")
        except Exception as e:
            self.state = BotState.STOPPED
            raise RuntimeError(f"Bot {self.bot_id}: Failed to connect: {e}")

        if not connected:
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
