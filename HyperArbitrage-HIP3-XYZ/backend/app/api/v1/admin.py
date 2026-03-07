from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.bots.bot_manager import bot_manager
from app.models.bot import Bot
from app.schemas.bot import BotResponse
from app.services.metrics_service import MetricsService

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/overview")
async def admin_overview(session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(Bot))
    bots = result.scalars().all()

    states = bot_manager.get_all_states()
    svc = MetricsService(session)
    aggregated = await svc.get_aggregated()

    bot_summaries = []
    for bot in bots:
        bot_summaries.append({
            "id": bot.id,
            "name": bot.name,
            "pair_a": bot.pair_a,
            "pair_b": bot.pair_b,
            "direction": bot.direction,
            "state": states.get(bot.id, bot.state),
        })

    return {
        "bots": bot_summaries,
        "aggregated": aggregated,
    }


@router.post("/stop-all")
async def stop_all_bots():
    await bot_manager.stop_all()
    return {"status": "ok", "message": "All bots stopped"}


@router.get("/states")
async def get_all_states():
    return bot_manager.get_all_states()
