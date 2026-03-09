"""
Lightweight FastAPI backend for HyperArbitrage bot execution.
No PostgreSQL, no Redis, no JWT — just SQLite + in-memory bot management.
"""
import asyncio
import json
import logging
import os
import signal
import sqlite3
from collections import deque
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

# Load .env or .env.bots from project root
_root = Path(__file__).resolve().parent.parent
for _env_name in (".env", ".env.bots"):
    _env_path = _root / _env_name
    if _env_path.exists():
        load_dotenv(_env_path)
        break

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from bot_manager import BotManager
from bot_defs import BOT_DEFINITIONS

# ── Log ring buffer for dashboard ──
LOG_BUFFER: deque[dict] = deque(maxlen=500)


class DashboardLogHandler(logging.Handler):
    """Captures log messages into the ring buffer for the dashboard."""
    def emit(self, record):
        try:
            LOG_BUFFER.append({
                "ts": datetime.now(timezone.utc).isoformat(),
                "level": record.levelname,
                "logger": record.name,
                "msg": self.format(record),
            })
        except Exception:
            pass


# Install handler on bot loggers
_dash_handler = DashboardLogHandler()
_dash_handler.setLevel(logging.DEBUG)
_dash_handler.setFormatter(logging.Formatter("%(message)s"))

# Also add a StreamHandler so logs appear in PM2 stdout
_stream_handler = logging.StreamHandler()
_stream_handler.setLevel(logging.DEBUG)
_stream_handler.setFormatter(logging.Formatter("%(asctime)s %(name)s %(levelname)s %(message)s"))

for _logger_name in ("bot_engine", "bot_manager", "deployer_perps"):
    _lg = logging.getLogger(_logger_name)
    _lg.setLevel(logging.DEBUG)
    _lg.addHandler(_dash_handler)
    _lg.addHandler(_stream_handler)

DATA_DIR = _root / "data"
DB_PATH = DATA_DIR / "bots.db"


def init_db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("""
        CREATE TABLE IF NOT EXISTS trades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bot_id INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'open',
            direction TEXT,
            pair_a TEXT,
            pair_b TEXT,
            side_a TEXT,
            side_b TEXT,
            size REAL,
            entry_price_a REAL,
            entry_price_b REAL,
            exit_price_a REAL,
            exit_price_b REAL,
            entry_spread REAL,
            exit_spread REAL,
            edge_at_entry REAL,
            slippage_a REAL,
            slippage_b REAL,
            fees REAL DEFAULT 0,
            funding REAL DEFAULT 0,
            pnl REAL DEFAULT 0,
            close_reason TEXT,
            entry_time TEXT,
            exit_time TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS bot_state (
            bot_id INTEGER PRIMARY KEY,
            state TEXT NOT NULL DEFAULT 'stopped',
            config_json TEXT,
            metrics_json TEXT,
            updated_at TEXT DEFAULT (datetime('now'))
        )
    """)
    conn.commit()
    conn.close()


manager = BotManager(DB_PATH)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    manager.load_bot_definitions(BOT_DEFINITIONS)
    yield
    await manager.stop_all()


app = FastAPI(title="HyperArbitrage Bot Engine", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── GET /api/v1/bots — list all bots with state + metrics ──
@app.get("/api/v1/bots")
async def list_bots():
    bots = manager.get_all_bots_view()
    global_stats = manager.get_global_stats()
    return {"bots": bots, "global_stats": global_stats}


# ── POST /api/v1/bots/{bot_id}/action — start/stop/liquidate/reset ──
@app.post("/api/v1/bots/{bot_id}/action")
async def bot_action(bot_id: int, body: dict):
    action = body.get("action")
    if action not in ("start", "stop", "liquidate", "reset"):
        return {"error": f"Invalid action: {action}"}, 400

    try:
        result = await manager.execute_action(bot_id, action)
        return {"ok": True, "bot_id": bot_id, "action": action, "state": result}
    except Exception as e:
        return {"error": str(e)}


# ── PATCH /api/v1/bots/{bot_id}/config — update bot config ──
@app.patch("/api/v1/bots/{bot_id}/config")
async def update_config(bot_id: int, body: dict):
    try:
        manager.update_bot_config(bot_id, body)
        return {"ok": True, "bot_id": bot_id}
    except Exception as e:
        return {"error": str(e)}


# ── GET /api/v1/bots/{bot_id}/trades — trade history ──
@app.get("/api/v1/bots/{bot_id}/trades")
async def get_trades(bot_id: int, limit: int = 50, offset: int = 0):
    trades = manager.get_trades(bot_id, limit, offset)
    return {"trades": trades, "bot_id": bot_id}


# ── GET /api/v1/logs — recent log entries ──
@app.get("/api/v1/logs")
async def get_logs(limit: int = 100, level: str = ""):
    logs = list(LOG_BUFFER)
    if level:
        logs = [l for l in logs if l["level"] == level.upper()]
    return {"logs": logs[-limit:]}


# ── GET /api/v1/bots/{bot_id}/diag — diagnostic info for a bot ──
@app.get("/api/v1/bots/{bot_id}/diag")
async def bot_diagnostics(bot_id: int):
    bot = manager._bots.get(bot_id)
    if not bot:
        return {"error": f"Bot {bot_id} not found"}

    import time
    now = time.time()
    books_info = {}
    for coin in bot._enabled_pairs:
        sym_a = bot._hip3_symbol(bot._prefix_a, coin)
        sym_b = bot._hip3_symbol(bot._prefix_b, coin)
        book_a = bot._books.get(sym_a, {})
        book_b = bot._books.get(sym_b, {})
        books_info[coin] = {
            "a_symbol": sym_a,
            "b_symbol": sym_b,
            "a_has_data": bool(book_a.get("bids") or book_a.get("asks")),
            "b_has_data": bool(book_b.get("bids") or book_b.get("asks")),
            "a_best_bid": book_a["bids"][0][0] if book_a.get("bids") else None,
            "a_best_ask": book_a["asks"][0][0] if book_a.get("asks") else None,
            "b_best_bid": book_b["bids"][0][0] if book_b.get("bids") else None,
            "b_best_ask": book_b["asks"][0][0] if book_b.get("asks") else None,
        }
        # Compute current edge if data exists
        metrics = bot._compute_vwap_spread(coin)
        if metrics and not metrics.get("fast_rejected"):
            books_info[coin]["edge_long_bps"] = round(metrics.get("net_edge_long_bps", 0), 2)
            books_info[coin]["edge_short_bps"] = round(metrics.get("net_edge_short_bps", 0), 2)
            books_info[coin]["mid_a"] = round(metrics["mid_a"], 6)
            books_info[coin]["mid_b"] = round(metrics["mid_b"], 6)

    return {
        "bot_id": bot_id,
        "state": bot.state.value,
        "direction": bot.direction,
        "prefix_a": bot._prefix_a,
        "prefix_b": bot._prefix_b,
        "enabled_pairs": bot._enabled_pairs,
        "tick_count": bot._tick_count,
        "ws_messages_received": bot._books_received,
        "books_populated": len(bot._books),
        "books_expected": len(bot._enabled_pairs) * 2,
        "last_ws_data_ago_s": round(now - bot._last_ws_data, 1) if bot._last_ws_data > 0 else None,
        "best_edge_seen": round(bot._best_edge_seen, 2),
        "best_edge_coin": bot._best_edge_coin,
        "min_edge_bps": bot.config.min_edge_bps,
        "has_position": bot._has_position,
        "samples_per_coin": {coin: len(bot._samples.get(coin, [])) for coin in bot._enabled_pairs},
        "books": books_info,
    }


# ── GET /health ──
@app.get("/health")
async def health():
    return {"status": "ok", "bots_loaded": len(manager._bots)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False, log_level="info")
