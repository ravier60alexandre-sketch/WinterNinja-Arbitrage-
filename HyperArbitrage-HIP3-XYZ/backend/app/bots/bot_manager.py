import asyncio

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.bots.base_bot import BotState
from app.bots.bot_instance import BotInstance
from app.config import settings
from app.core.logging import get_logger
from app.core.security import decrypt_api_key
from app.models.bot import Bot, BotConfig

logger = get_logger("bots.bot_manager")


def _create_hl_exchange(api_key_decrypted: str, is_mainnet: bool):
    """Create a Hyperliquid Exchange instance for a bot."""
    try:
        from hyperliquid.exchange import Exchange
        from hyperliquid.utils import constants
        base_url = constants.MAINNET_API_URL if is_mainnet else constants.TESTNET_API_URL
        return Exchange(wallet=api_key_decrypted, base_url=base_url)
    except ImportError:
        logger.warning("hyperliquid_sdk_not_available", msg="Using None exchange — install hyperliquid-python-sdk")
        return None


def _create_hl_info(is_mainnet: bool):
    """Create a Hyperliquid Info instance for reading market data."""
    try:
        from hyperliquid.info import Info
        from hyperliquid.utils import constants
        base_url = constants.MAINNET_API_URL if is_mainnet else constants.TESTNET_API_URL
        return Info(base_url=base_url)
    except ImportError:
        logger.warning("hyperliquid_sdk_not_available", msg="Using None info — install hyperliquid-python-sdk")
        return None


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

            is_mainnet = settings.HL_MAINNET
            api_key_decrypted = decrypt_api_key(bot_model.api_key_encrypted)
            exchange = _create_hl_exchange(api_key_decrypted, is_mainnet)
            hl_info = _create_hl_info(is_mainnet)

            instance = BotInstance(
                bot_id=bot_model.id,
                name=bot_model.name,
                pair_a=bot_model.pair_a,
                pair_b=bot_model.pair_b,
                direction=bot_model.direction,
                account_address=bot_model.account_address,
                exchange=exchange,
                hl_info=hl_info,
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
