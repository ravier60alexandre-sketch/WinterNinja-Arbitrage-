import asyncio

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.bots.base_bot import BotState
from app.bots.bot_instance import BotInstance
from app.core.logging import get_logger
from app.core.security import decrypt_api_key
from app.models.bot import Bot, BotConfig

logger = get_logger("bots.bot_manager")


class BotManager:
    def __init__(self) -> None:
        self._bots: dict[int, BotInstance] = {}
        self._lock = asyncio.Lock()

    @property
    def bots(self) -> dict[int, BotInstance]:
        return dict(self._bots)

    def get_bot(self, bot_id: int) -> BotInstance | None:
        return self._bots.get(bot_id)

    async def load_bots(self, session: AsyncSession) -> None:
        result = await session.execute(select(Bot))
        bots = result.scalars().all()

        for bot_model in bots:
            config_result = await session.execute(
                select(BotConfig).where(BotConfig.bot_id == bot_model.id)
            )
            config_model = config_result.scalar_one_or_none()
            config = {}
            if config_model:
                config = {
                    "percentile": config_model.percentile,
                    "timeframe_hours": config_model.timeframe_hours,
                    "profit_margin_bps": config_model.profit_margin_bps,
                    "max_slippage_ticks": config_model.max_slippage_ticks,
                    "max_position_size": float(config_model.max_position_size) if config_model.max_position_size else None,
                    "funding_threshold": config_model.funding_rate_threshold,
                    "one_leg_protection": config_model.one_leg_protection,
                    "exit_mode": config_model.exit_mode,
                    "min_edge_bps": config_model.min_edge_bps,
                }

            instance = BotInstance(
                bot_id=bot_model.id,
                name=bot_model.name,
                pair_a=bot_model.pair_a,
                pair_b=bot_model.pair_b,
                direction=bot_model.direction,
                account_address=bot_model.account_address,
                exchange=None,
                hl_info=None,
                config=config,
            )

            self._bots[bot_model.id] = instance
            logger.info("bot_loaded", bot_id=bot_model.id, name=bot_model.name, state=bot_model.state)

    async def start_bot(self, bot_id: int) -> None:
        async with self._lock:
            bot = self._bots.get(bot_id)
            if bot is None:
                raise ValueError(f"Bot {bot_id} not found")
            await bot.start()
            logger.info("bot_started", bot_id=bot_id)

    async def stop_bot(self, bot_id: int) -> None:
        async with self._lock:
            bot = self._bots.get(bot_id)
            if bot is None:
                raise ValueError(f"Bot {bot_id} not found")
            await bot.stop()
            logger.info("bot_stopped", bot_id=bot_id)

    async def liquidate_bot(self, bot_id: int) -> None:
        async with self._lock:
            bot = self._bots.get(bot_id)
            if bot is None:
                raise ValueError(f"Bot {bot_id} not found")
            await bot.liquidate()
            logger.info("bot_liquidating", bot_id=bot_id)

    async def reset_bot(self, bot_id: int) -> None:
        async with self._lock:
            bot = self._bots.get(bot_id)
            if bot is None:
                raise ValueError(f"Bot {bot_id} not found")
            await bot.reset()
            logger.info("bot_reset", bot_id=bot_id)

    async def stop_all(self) -> None:
        async with self._lock:
            for bot_id, bot in self._bots.items():
                if bot.is_active():
                    try:
                        await bot.stop()
                    except Exception as exc:
                        logger.error("stop_bot_failed", bot_id=bot_id, error=str(exc))

    def get_all_states(self) -> dict[int, str]:
        return {bot_id: bot.state.value for bot_id, bot in self._bots.items()}


bot_manager = BotManager()
