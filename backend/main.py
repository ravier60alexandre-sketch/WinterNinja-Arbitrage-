"""
Lightweight FastAPI backend for HyperArbitrage bot execution.
No PostgreSQL, no Redis, no JWT — just SQLite + in-memory bot management.
"""
import asyncio
import json
import os
import signal
import sqlite3
from contextlib import asynccontextmanager
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


# ── GET /health ──
@app.get("/health")
async def health():
    return {"status": "ok", "bots_loaded": len(manager._bots)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False, log_level="info")
