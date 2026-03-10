"""
BotManager — manages all 6 bot instances, persists state to SQLite,
reads credentials from environment variables.
"""
import asyncio
import json
import logging
import os
import sqlite3
import time
from pathlib import Path

from bot_engine import BotConfig, BotEngine, BotMetrics, BotState

logger = logging.getLogger("bot_manager")


# Default pairs per exchange (same as dashboard)
EXCHANGE_PAIRS = {
    "CASH": [
        {"symbol": "SILVER", "enabled": True}, {"symbol": "NVDA", "enabled": True},
        {"symbol": "HOOD", "enabled": True}, {"symbol": "INTC", "enabled": True},
        {"symbol": "AMZN", "enabled": True}, {"symbol": "TSLA", "enabled": True},
        {"symbol": "GOLD", "enabled": True}, {"symbol": "GOOGL", "enabled": True},
        {"symbol": "META", "enabled": True}, {"symbol": "MSFT", "enabled": True},
        {"symbol": "EWY", "enabled": True},
    ],
    "KM": [
        {"symbol": "SILVER", "enabled": True}, {"symbol": "NVDA", "enabled": True},
        {"symbol": "TSLA", "enabled": True}, {"symbol": "GOLD", "enabled": True},
        {"symbol": "GOOGL", "enabled": True}, {"symbol": "PLTR", "enabled": True},
        {"symbol": "AAPL", "enabled": True}, {"symbol": "MU", "enabled": True},
        {"symbol": "BABA", "enabled": True},
    ],
    "FLX": [
        {"symbol": "SILVER", "enabled": True}, {"symbol": "TSLA", "enabled": True},
        {"symbol": "NVDA", "enabled": True}, {"symbol": "PLATINUM", "enabled": True},
        {"symbol": "GOLD", "enabled": True}, {"symbol": "COIN", "enabled": True},
        {"symbol": "CRCL", "enabled": True}, {"symbol": "COPPER", "enabled": True},
        {"symbol": "PALLADIUM", "enabled": True},
    ],
}


class BotManager:
    def __init__(self, db_path: Path):
        self._db_path = db_path
        self._bots: dict[int, BotEngine] = {}
        self._definitions: list[dict] = []
        self._bot_pairs: dict[int, list[dict]] = {}  # per-bot pair state with enabled flags

    def _db(self) -> sqlite3.Connection:
        return sqlite3.connect(str(self._db_path))

    def _load_credentials(self, bot_id: int) -> tuple[str, str, str]:
        """Load credentials from SQLite (set via dashboard UI)."""
        try:
            conn = self._db()
            row = conn.execute(
                "SELECT account_address, api_key, sub_account FROM bot_credentials WHERE bot_id = ?",
                (bot_id,),
            ).fetchone()
            conn.close()
            if row:
                return row[0] or "", row[1] or "", row[2] or ""
        except Exception:
            pass
        return "", "", ""

    def save_credentials(self, bot_id: int, account_address: str, api_key: str, sub_account: str):
        """Persist credentials to SQLite so they survive restarts."""
        try:
            conn = self._db()
            conn.execute(
                """INSERT INTO bot_credentials (bot_id, account_address, api_key, sub_account, updated_at)
                   VALUES (?, ?, ?, ?, datetime('now'))
                   ON CONFLICT(bot_id) DO UPDATE SET
                     account_address = excluded.account_address,
                     api_key = excluded.api_key,
                     sub_account = excluded.sub_account,
                     updated_at = excluded.updated_at""",
                (bot_id, account_address, api_key, sub_account),
            )
            conn.commit()
            conn.close()
            logger.info(f"Credentials saved for bot {bot_id}")
        except Exception as e:
            logger.warning(f"Failed to save credentials for bot {bot_id}: {e}")

    def load_bot_definitions(self, definitions: list[dict]):
        """Load bot definitions and create engine instances.

        Credentials priority: env vars > SQLite (dashboard-saved) > empty.
        """
        self._definitions = definitions

        for defn in definitions:
            bot_id = defn["id"]
            prefix = defn["env_prefix"]

            # Priority 1: environment variables
            account = os.environ.get(f"{prefix}_ACCOUNT_ADDRESS", "")
            api_key = os.environ.get(f"{prefix}_API_KEY", "")
            sub_account = os.environ.get(f"{prefix}_SUB_ACCOUNT", "")

            # Priority 2: SQLite (credentials saved via dashboard UI)
            if not account or not api_key:
                db_account, db_key, db_sub = self._load_credentials(bot_id)
                if not account and db_account:
                    account = db_account
                if not api_key and db_key:
                    api_key = db_key
                if not sub_account and db_sub:
                    sub_account = db_sub

            # Load persisted config if any
            config = self._load_config(bot_id)

            engine = BotEngine(
                bot_id=bot_id,
                name=defn["name"],
                pair_a=defn["pair_a"],
                pair_b=defn["pair_b"],
                direction=defn["direction"],
                account_address=account,
                api_key=api_key,
                sub_account=sub_account or None,
                config=config,
                on_trade_callback=self._on_trade,
            )

            # Set enabled pairs from exchange config, merging with persisted state
            exchange = defn.get("exchange", "")
            exchange_pairs = EXCHANGE_PAIRS.get(exchange, [])

            # Load persisted pair states (if any)
            saved_pairs = self._load_pairs(bot_id)
            if saved_pairs:
                # Merge: use saved enabled state, but keep default list as base
                saved_map = {p["symbol"]: p for p in saved_pairs}
                merged = []
                for ep in exchange_pairs:
                    sp = saved_map.get(ep["symbol"])
                    merged.append({
                        **ep,
                        "enabled": sp["enabled"] if sp else ep.get("enabled", True),
                    })
                self._bot_pairs[bot_id] = merged
            else:
                self._bot_pairs[bot_id] = [dict(p) for p in exchange_pairs]

            enabled_symbols = [p["symbol"] for p in self._bot_pairs[bot_id] if p.get("enabled", True)]
            engine.set_enabled_pairs(enabled_symbols)

            # Load persisted metrics
            saved_metrics = self._load_metrics(bot_id)
            if saved_metrics:
                engine.metrics = saved_metrics

            self._bots[bot_id] = engine

            has_creds = bool(account and api_key)
            logger.info(f"Bot {bot_id} ({defn['name']}) loaded — credentials={'YES' if has_creds else 'MISSING'} — {len(enabled_symbols)} pairs")

    def _load_pairs(self, bot_id: int) -> list[dict] | None:
        """Load persisted pair states from SQLite."""
        try:
            conn = self._db()
            row = conn.execute(
                "SELECT config_json FROM bot_state WHERE bot_id = ?", (bot_id,)
            ).fetchone()
            conn.close()
            if row and row[0]:
                data = json.loads(row[0])
                if isinstance(data, dict) and "pairs" in data:
                    return data["pairs"]
        except Exception:
            pass
        return None

    def _save_pairs(self, bot_id: int):
        """Save pair states alongside config in bot_state."""
        self._save_state(bot_id)

    def _load_config(self, bot_id: int) -> BotConfig:
        try:
            conn = self._db()
            row = conn.execute(
                "SELECT config_json FROM bot_state WHERE bot_id = ?", (bot_id,)
            ).fetchone()
            conn.close()
            if row and row[0]:
                return BotConfig.from_dict(json.loads(row[0]))
        except Exception:
            pass
        return BotConfig()

    def _load_metrics(self, bot_id: int) -> BotMetrics | None:
        try:
            conn = self._db()
            row = conn.execute(
                "SELECT metrics_json FROM bot_state WHERE bot_id = ?", (bot_id,)
            ).fetchone()
            conn.close()
            if row and row[0]:
                d = json.loads(row[0])
                m = BotMetrics()
                for k, v in d.items():
                    if hasattr(m, k) and v is not None:
                        setattr(m, k, v)
                return m
        except Exception:
            pass
        return None

    def _save_state(self, bot_id: int):
        bot = self._bots.get(bot_id)
        if not bot:
            return
        try:
            # Include pairs in config_json for persistence
            config_data = bot.config.to_dict()
            if bot_id in self._bot_pairs:
                config_data["pairs"] = self._bot_pairs[bot_id]

            conn = self._db()
            conn.execute(
                """INSERT INTO bot_state (bot_id, state, config_json, metrics_json, updated_at)
                   VALUES (?, ?, ?, ?, datetime('now'))
                   ON CONFLICT(bot_id) DO UPDATE SET
                     state = excluded.state,
                     config_json = excluded.config_json,
                     metrics_json = excluded.metrics_json,
                     updated_at = excluded.updated_at""",
                (
                    bot_id,
                    bot.state.value,
                    json.dumps(config_data),
                    json.dumps(bot.metrics.to_dict()),
                ),
            )
            conn.commit()
            conn.close()
        except Exception as e:
            logger.warning(f"Failed to save state for bot {bot_id}: {e}")

    def _on_trade(self, action: str, bot_id: int, trade_data: dict):
        """Callback from BotEngine when a trade opens, accumulates, or closes."""
        try:
            conn = self._db()
            if action == "open":
                # New position — insert trade + first fill
                cursor = conn.execute(
                    """INSERT INTO trades (bot_id, status, coin, direction, pair_a, pair_b,
                       side_a, side_b, size, entry_price_a, entry_price_b,
                       entry_spread, edge_at_entry, slippage_a, slippage_b, entry_time)
                       VALUES (?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        bot_id,
                        trade_data.get("coin"),
                        self._bots[bot_id].direction,
                        self._bots[bot_id].pair_a,
                        self._bots[bot_id].pair_b,
                        trade_data["side_a"],
                        trade_data["side_b"],
                        trade_data["size"],
                        trade_data["entry_price_a"],
                        trade_data["entry_price_b"],
                        trade_data.get("entry_spread", 0),
                        trade_data.get("edge_at_entry", 0),
                        trade_data.get("slippage_a", 0),
                        trade_data.get("slippage_b", 0),
                        trade_data.get("entry_time"),
                    ),
                )
                trade_id = cursor.lastrowid
                # Insert first fill
                conn.execute(
                    """INSERT INTO fills (trade_id, size, entry_price_a, entry_price_b,
                       slippage_a, slippage_b, edge_at_entry, entry_time)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        trade_id,
                        trade_data["size"],
                        trade_data["entry_price_a"],
                        trade_data["entry_price_b"],
                        trade_data.get("slippage_a", 0),
                        trade_data.get("slippage_b", 0),
                        trade_data.get("edge_at_entry", 0),
                        trade_data.get("entry_time"),
                    ),
                )

            elif action == "add_fill":
                # Accumulation — update existing trade size/entry, add fill record
                coin = trade_data.get("coin")
                fill = trade_data.get("fill", {})
                # Find the open trade for this bot+coin
                row = conn.execute(
                    "SELECT id FROM trades WHERE bot_id = ? AND coin = ? AND status = 'open' ORDER BY created_at DESC LIMIT 1",
                    (bot_id, coin),
                ).fetchone()
                if row:
                    trade_id = row[0]
                    conn.execute(
                        """UPDATE trades SET size = ?, entry_price_a = ?, entry_price_b = ?
                           WHERE id = ?""",
                        (
                            trade_data.get("total_size"),
                            trade_data.get("avg_entry_a"),
                            trade_data.get("avg_entry_b"),
                            trade_id,
                        ),
                    )
                    conn.execute(
                        """INSERT INTO fills (trade_id, size, entry_price_a, entry_price_b,
                           slippage_a, slippage_b, edge_at_entry, entry_time)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                        (
                            trade_id,
                            fill.get("size", 0),
                            fill.get("entry_price_a", 0),
                            fill.get("entry_price_b", 0),
                            fill.get("slippage_a", 0),
                            fill.get("slippage_b", 0),
                            fill.get("edge_at_entry", 0),
                            fill.get("entry_time"),
                        ),
                    )

            elif action == "partial_close":
                # Progressive close — update remaining size, accumulate PnL
                coin = trade_data.get("coin")
                remaining = trade_data.get("remaining_size", 0)
                row = conn.execute(
                    "SELECT id, pnl, fees FROM trades WHERE bot_id = ? AND coin = ? AND status = 'open' ORDER BY created_at DESC LIMIT 1",
                    (bot_id, coin),
                ).fetchone()
                if row:
                    trade_id, old_pnl, old_fees = row
                    conn.execute(
                        """UPDATE trades SET size = ?,
                           pnl = ?, fees = ?
                           WHERE id = ?""",
                        (
                            remaining,
                            (old_pnl or 0) + trade_data.get("pnl", 0),
                            (old_fees or 0) + trade_data.get("fees", 0),
                            trade_id,
                        ),
                    )

            elif action == "close":
                # Full close
                coin = trade_data.get("coin")
                conn.execute(
                    """UPDATE trades SET status = 'closed',
                       exit_price_a = ?, exit_price_b = ?,
                       pnl = ?, fees = ?, close_reason = ?, exit_time = ?
                       WHERE bot_id = ? AND coin = ? AND status = 'open'
                       ORDER BY created_at DESC LIMIT 1""",
                    (
                        trade_data.get("exit_price_a"),
                        trade_data.get("exit_price_b"),
                        trade_data.get("pnl"),
                        trade_data.get("fees"),
                        trade_data.get("close_reason"),
                        trade_data.get("exit_time"),
                        bot_id,
                        coin,
                    ),
                )

            conn.commit()
            conn.close()
        except Exception as e:
            logger.warning(f"Failed to persist trade for bot {bot_id}: {e}")

        # Also save updated metrics
        self._save_state(bot_id)

    # ── Actions ──

    async def execute_action(self, bot_id: int, action: str) -> str:
        bot = self._bots.get(bot_id)
        if not bot:
            raise ValueError(f"Bot {bot_id} not found")

        if action == "start":
            if not bot.account_address or not bot.api_key:
                raise ValueError(
                    f"Bot {bot_id} has no credentials. Set {self._definitions[bot_id-1]['env_prefix']}_ACCOUNT_ADDRESS and _API_KEY in .env"
                )
            await bot.start()
        elif action == "stop":
            await bot.stop()
        elif action == "liquidate":
            await bot.liquidate()
        elif action == "reset":
            await bot.reset()

        self._save_state(bot_id)
        return bot.state.value

    async def stop_all(self):
        for bot_id, bot in self._bots.items():
            if bot.state in (BotState.RUNNING, BotState.CONNECTING):
                try:
                    await bot.stop()
                    self._save_state(bot_id)
                except Exception as e:
                    logger.error(f"Failed to stop bot {bot_id}: {e}")

    def update_bot_config(self, bot_id: int, config_update: dict):
        bot = self._bots.get(bot_id)
        if not bot:
            raise ValueError(f"Bot {bot_id} not found")

        for k, v in config_update.items():
            if hasattr(bot.config, k):
                setattr(bot.config, k, type(getattr(bot.config, k))(v))

        # Also accept dashboard-format keys
        key_map = {
            "timer": "timeframe",
            "slip": "max_slippage_bps",
            "max_pos": "max_position_size",
            "max_lev": "max_leverage",
        }
        for dash_key, engine_key in key_map.items():
            if dash_key in config_update:
                setattr(bot.config, engine_key, type(getattr(bot.config, engine_key))(config_update[dash_key]))

        self._save_state(bot_id)

    def update_pairs(self, bot_id: int, pairs: list[dict]):
        """Update pair enabled/disabled state for a bot."""
        bot = self._bots.get(bot_id)
        if not bot:
            raise ValueError(f"Bot {bot_id} not found")

        self._bot_pairs[bot_id] = pairs
        enabled_symbols = [p["symbol"] for p in pairs if p.get("enabled", True)]
        bot.set_enabled_pairs(enabled_symbols)
        self._save_state(bot_id)
        logger.info(f"Bot {bot_id} pairs updated: {len(enabled_symbols)}/{len(pairs)} enabled")

    def get_trades(self, bot_id: int, limit: int = 50, offset: int = 0) -> list[dict]:
        try:
            conn = self._db()
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                "SELECT * FROM trades WHERE bot_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
                (bot_id, limit, offset),
            ).fetchall()
            conn.close()
            return [dict(r) for r in rows]
        except Exception:
            return []

    # ── Views for dashboard ──

    def get_all_bots_view(self) -> list[dict]:
        """Return all 6 bots in the format the dashboard expects."""
        bots = []
        for defn in self._definitions:
            bot_id = defn["id"]
            engine = self._bots.get(bot_id)

            bot_view = {
                "id": bot_id,
                "name": defn["name"],
                "exchange": defn["exchange"],
                "pair_b": defn["pair_b"].lower(),
                "direction": "long" if defn["direction"] == "long_a_short_b" else "short",
                "label": defn["name"],
                "state": engine.state.value if engine else "stopped",
                "wallet": (engine.account_address[:6] + "..." + engine.account_address[-4:]) if engine and engine.account_address else "",
                "sub_account": engine.sub_account or "" if engine else "",
                "collateral": engine.collateral if engine else {"usdc": 0, "usdh": 0, "total": 0},
                "ping_ms": 0,
                "fees_bps": 0.45,
                "metrics": engine.metrics.to_dict() if engine else BotMetrics().to_dict(),
                "config": self._engine_config_to_dashboard(engine.config) if engine else BotConfig().to_dict(),
                "api_key_masked": ("..." + engine.api_key[-4:]) if engine and engine.api_key and len(engine.api_key) > 4 else "",
                "pairs": self._bot_pairs.get(bot_id, EXCHANGE_PAIRS.get(defn["exchange"], [])),
                "tiers_enabled": True,
                "open_trades": engine.get_open_trades_view() if engine else [],
            }
            bots.append(bot_view)
        return bots

    def _engine_config_to_dashboard(self, config: BotConfig) -> dict:
        return {
            "max_pos": config.max_position_size,
            "max_global": 1000,
            "max_lev": config.max_leverage,
            "sl_bps": 0,
            "max_loss_bps": 500,
            "percentile": config.percentile,
            "buf": 0,
            "slip": config.max_slippage_bps,
            "timer": config.timeframe,
            "close_buffer_bps": config.close_buffer_bps,
        }

    async def refresh_balances(self):
        """Fetch balances for bots that have credentials but aren't running (stopped bots).
        Running bots refresh their own balances via _balance_loop.
        Only refetch if last fetch was >30s ago to avoid spamming the API.
        """
        now = time.time()
        tasks = []
        for engine in self._bots.values():
            if engine.account_address and engine.state == BotState.STOPPED:
                if now - engine._last_balance_fetch > 30:
                    tasks.append(engine._fetch_balances())
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    def get_global_stats(self) -> dict:
        total_pnl = 0
        total_fees = 0
        total_funding = 0
        total_volume = 0
        total_trades = 0
        combined_open = 0

        for engine in self._bots.values():
            m = engine.metrics
            total_pnl += m.pnl_net
            total_fees += m.fees
            total_funding += m.funding
            total_volume += m.volume
            total_trades += m.closed
            combined_open += m.open

        return {
            "combined_open": combined_open,
            "net_pnl": round(total_pnl, 6),
            "total_fees": round(total_fees, 6),
            "total_funding": round(total_funding, 6),
            "total_volume": round(total_volume, 2),
            "total_trades": total_trades,
            "routed": total_trades,
            "rejected": sum(e.metrics.errors for e in self._bots.values()),
        }
