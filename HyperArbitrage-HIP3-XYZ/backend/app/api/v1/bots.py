from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.database import get_session
from app.core.security import encrypt_api_key
from app.models.bot import Bot, BotConfig
from app.schemas.bot import (
    BotActionRequest, BotConfigResponse, BotConfigUpdate, BotCreate,
    BotListResponse, BotResponse,
)
from app.bots.bot_manager import bot_manager

router = APIRouter(prefix="/bots", tags=["bots"])
limiter = Limiter(key_func=get_remote_address)


@router.get("/", response_model=BotListResponse)
async def list_bots(session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(Bot))
    bots = result.scalars().all()
    return BotListResponse(
        bots=[BotResponse.model_validate(b) for b in bots],
        total=len(bots),
    )


@router.get("/{bot_id}", response_model=BotResponse)
async def get_bot(bot_id: int, session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(Bot).where(Bot.id == bot_id))
    bot = result.scalar_one_or_none()
    if bot is None:
        raise HTTPException(status_code=404, detail="Bot not found")
    return BotResponse.model_validate(bot)


@router.post("/", response_model=BotResponse, status_code=201)
async def create_bot(body: BotCreate, session: AsyncSession = Depends(get_session)):
    bot = Bot(
        name=body.name,
        pair_a=body.pair_a,
        pair_b=body.pair_b,
        direction=body.direction,
        account_address=body.account_address,
        api_key_encrypted=encrypt_api_key(body.api_key),
        sub_account_address=body.sub_account_address,
    )
    session.add(bot)
    await session.flush()

    config = BotConfig(bot_id=bot.id)
    session.add(config)
    await session.flush()

    return BotResponse.model_validate(bot)


@router.post("/{bot_id}/action")
async def bot_action(bot_id: int, body: BotActionRequest, session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(Bot).where(Bot.id == bot_id))
    bot = result.scalar_one_or_none()
    if bot is None:
        raise HTTPException(status_code=404, detail="Bot not found")

    action_map = {
        "start": bot_manager.start_bot,
        "stop": bot_manager.stop_bot,
        "liquidate": bot_manager.liquidate_bot,
        "reset": bot_manager.reset_bot,
    }

    handler = action_map.get(body.action)
    if handler is None:
        raise HTTPException(status_code=400, detail=f"Unknown action: {body.action}")

    try:
        await handler(bot_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    await session.refresh(bot)
    instance = bot_manager.get_bot(bot_id)
    if instance:
        bot.state = instance.state.value
        await session.flush()

    return {"status": "ok", "bot_id": bot_id, "state": bot.state}


@router.patch("/{bot_id}/config", response_model=BotConfigResponse)
async def update_config(
    bot_id: int, body: BotConfigUpdate, session: AsyncSession = Depends(get_session)
):
    result = await session.execute(
        select(BotConfig).where(BotConfig.bot_id == bot_id)
    )
    config = result.scalar_one_or_none()
    if config is None:
        raise HTTPException(status_code=404, detail="Bot config not found")

    updates = body.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(config, key, value)

    await session.flush()

    instance = bot_manager.get_bot(bot_id)
    if instance:
        instance.update_config(updates)

    return BotConfigResponse.model_validate(config)
