"""
BotManager — manages all 6 bot instances, persists state to SQLite,
reads credentials from environment variables.
"""
import json
import logging
import os
import sqlite3
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

    def _db(self) -> sqlite3.Connection:
        return sqlite3.connect(str(self._db_path))

    def load_bot_definitions(self, definitions: list[dict]):
        """Load bot definitions and create engine instances for those with credentials."""
        self._definitions = definitions

        for defn in definitions:
            bot_id = defn["id"]
            prefix = defn["env_prefix"]

            account = os.environ.get(f"{prefix}_ACCOUNT_ADDRESS", "")
            api_key = os.environ.get(f"{prefix}_API_KEY", "")
            sub_account = os.environ.get(f"{prefix}_SUB_ACCOUNT", "")

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

            # Set enabled pairs from exchange config
            exchange = defn.get("exchange", "")
            exchange_pairs = EXCHANGE_PAIRS.get(exchange, [])
            enabled_symbols = [p["symbol"] for p in exchange_pairs if p.get("enabled", True)]
            engine.set_enabled_pairs(enabled_symbols)

            # Load persisted metrics
            saved_metrics = self._load_metrics(bot_id)
            if saved_metrics:
                engine.metrics = saved_metrics

            self._bots[bot_id] = engine

            has_creds = bool(account and api_key)
            logger.info(f"Bot {bot_id} ({defn['name']}) loaded — credentials={'YES' if has_creds else 'MISSING'} — {len(enabled_symbols)} pairs")

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
                    json.dumps(bot.config.to_dict()),
                    json.dumps(bot.metrics.to_dict()),
                ),
            )
            conn.commit()
            conn.close()
        except Exception as e:
            logger.warning(f"Failed to save state for bot {bot_id}: {e}")

    def _on_trade(self, action: str, bot_id: int, trade_data: dict):
        """Callback from BotEngine when a trade opens or closes."""
        try:
            conn = self._db()
            if action == "open":
                conn.execute(
                    """INSERT INTO trades (bot_id, status, direction, pair_a, pair_b,
                       side_a, side_b, size, entry_price_a, entry_price_b,
                       entry_spread, edge_at_entry, slippage_a, slippage_b, entry_time)
                       VALUES (?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        bot_id,
                        self._bots[bot_id].direction,
                        self._bots[bot_id].pair_a,
                        self._bots[bot_id].pair_b,
                        trade_data["side_a"],
                        trade_data["side_b"],
                        trade_data["size"],
                        trade_data["entry_price_a"],
                        trade_data["entry_price_b"],
                        trade_data["entry_spread"],
                        trade_data["edge_at_entry"],
                        trade_data["slippage_a"],
                        trade_data["slippage_b"],
                        trade_data["entry_time"],
                    ),
                )
            elif action == "close":
                conn.execute(
                    """UPDATE trades SET status = 'closed',
                       exit_price_a = ?, exit_price_b = ?,
                       pnl = ?, fees = ?, close_reason = ?, exit_time = ?
                       WHERE bot_id = ? AND status = 'open'
                       ORDER BY created_at DESC LIMIT 1""",
                    (
                        trade_data.get("exit_price_a"),
                        trade_data.get("exit_price_b"),
                        trade_data.get("pnl"),
                        trade_data.get("fees"),
                        trade_data.get("close_reason"),
                        trade_data.get("exit_time"),
                        bot_id,
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
                "collateral": {"usdc": 0, "usdh": 0, "total": 0},
                "ping_ms": 0,
                "fees_bps": 0.45,
                "metrics": engine.metrics.to_dict() if engine else BotMetrics().to_dict(),
                "config": self._engine_config_to_dashboard(engine.config) if engine else BotConfig().to_dict(),
                "api_key_masked": ("..." + engine.api_key[-4:]) if engine and engine.api_key and len(engine.api_key) > 4 else "",
                "pairs": EXCHANGE_PAIRS.get(defn["exchange"], []),
                "tiers_enabled": True,
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
            "zmr": False,
            "close_fee_rt_buffer": False,
        }

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
