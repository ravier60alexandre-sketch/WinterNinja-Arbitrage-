"""Wallet balance & live positions endpoint.

Queries the Hyperliquid Info API for each bot's trading address
and returns account value, margin, and open positions on the exchange.
"""
from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.bots.bot_manager import bot_manager
from app.core.database import get_session
from app.core.logging import get_logger
from app.models.bot import Bot
from app.services.trade_service import TradeService

logger = get_logger("api.wallet")

router = APIRouter(prefix="/wallet", tags=["wallet"])


async def _fetch_user_state(hl_info, address: str) -> dict | None:
    """Query clearinghouse state for a single address."""
    if hl_info is None:
        return None
    try:
        return await asyncio.to_thread(hl_info.user_state, address)
    except Exception as exc:
        logger.warning("user_state_failed", address=address[:10], error=str(exc))
        return None


@router.get("/balances")
async def get_wallet_balances(session: AsyncSession = Depends(get_session)):
    """Return wallet balance and live exchange positions for every bot."""
    result = await session.execute(select(Bot))
    bots = result.scalars().all()

    responses: list[dict] = []

    for bot_model in bots:
        instance = bot_manager.get_bot(bot_model.id)
        trading_address = bot_model.sub_account_address or bot_model.account_address

        wallet_data: dict = {
            "bot_id": bot_model.id,
            "bot_name": bot_model.name,
            "address": trading_address,
            "account_value": None,
            "total_raw_usd": None,
            "total_margin_used": None,
            "withdrawable": None,
            "exchange_positions": [],
        }

        if instance is None:
            responses.append(wallet_data)
            continue

        hl_info = getattr(instance, "_hl_info", None)
        state = await _fetch_user_state(hl_info, trading_address)

        if state and "marginSummary" in state:
            ms = state["marginSummary"]
            wallet_data["account_value"] = ms.get("accountValue")
            wallet_data["total_raw_usd"] = ms.get("totalRawUsd")
            wallet_data["total_margin_used"] = ms.get("totalMarginUsed")
            wallet_data["withdrawable"] = ms.get("withdrawable")

        if state and "assetPositions" in state:
            for pos in state["assetPositions"]:
                p = pos.get("position", pos)
                wallet_data["exchange_positions"].append({
                    "coin": p.get("coin"),
                    "size": p.get("szi"),
                    "entry_px": p.get("entryPx"),
                    "mark_px": p.get("positionValue"),
                    "unrealized_pnl": p.get("unrealizedPnl"),
                    "leverage": p.get("leverage", {}).get("value") if isinstance(p.get("leverage"), dict) else p.get("leverage"),
                    "margin_used": p.get("marginUsed"),
                    "liquidation_px": p.get("liquidationPx"),
                })

        responses.append(wallet_data)

    return {"wallets": responses}


@router.get("/open-positions")
async def get_all_open_positions(session: AsyncSession = Depends(get_session)):
    """Return all open trades across all bots (from our DB)."""
    svc = TradeService(session)
    result = await session.execute(select(Bot))
    bots = result.scalars().all()

    all_open = []
    for bot_model in bots:
        trades = await svc.get_open_trades(bot_model.id)
        for t in trades:
            all_open.append({
                "id": t.id,
                "bot_id": t.bot_id,
                "bot_name": bot_model.name,
                "pair_a": t.pair_a,
                "pair_b": t.pair_b,
                "size": str(t.size),
                "entry_price_a": str(t.entry_price_a),
                "entry_price_b": str(t.entry_price_b),
                "entry_spread": str(t.entry_spread) if t.entry_spread else None,
                "edge_at_entry": str(t.edge_at_entry) if t.edge_at_entry else None,
                "entry_time": t.entry_time.isoformat() if t.entry_time else None,
                "direction": bot_model.direction,
            })

    return {"positions": all_open, "total": len(all_open)}


@router.get("/recent-trades")
async def get_recent_trades(
    limit: int = 20,
    session: AsyncSession = Depends(get_session),
):
    """Return the N most recent closed trades across all bots."""
    from sqlalchemy import desc
    from app.models.trade import Trade as TradeModel

    stmt = (
        select(TradeModel, Bot.name)
        .join(Bot, TradeModel.bot_id == Bot.id)
        .where(TradeModel.status == "closed")
        .order_by(desc(TradeModel.exit_time))
        .limit(min(limit, 100))
    )
    rows = await session.execute(stmt)
    results = rows.all()

    trades = []
    for trade, bot_name in results:
        trades.append({
            "id": trade.id,
            "bot_id": trade.bot_id,
            "bot_name": bot_name,
            "pair_a": trade.pair_a,
            "pair_b": trade.pair_b,
            "size": str(trade.size),
            "entry_time": trade.entry_time.isoformat() if trade.entry_time else None,
            "exit_time": trade.exit_time.isoformat() if trade.exit_time else None,
            "net_pnl": str(trade.net_pnl) if trade.net_pnl else None,
            "fees_paid": str(trade.fees_paid) if trade.fees_paid else None,
            "close_reason": trade.close_reason,
            "slippage_a": str(trade.slippage_a) if trade.slippage_a else None,
            "slippage_b": str(trade.slippage_b) if trade.slippage_b else None,
        })

    return {"trades": trades}
