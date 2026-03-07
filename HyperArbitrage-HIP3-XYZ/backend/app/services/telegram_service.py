import httpx

from app.config import settings
from app.core.logging import get_logger

logger = get_logger("services.telegram")

LEVEL_PRIORITY = {"DEBUG": 0, "INFO": 1, "WARNING": 2, "ERROR": 3, "CRITICAL": 4}


class TelegramService:
    def __init__(self) -> None:
        self._token = settings.TELEGRAM_BOT_TOKEN
        self._chat_id = settings.TELEGRAM_CHAT_ID
        self._min_level = LEVEL_PRIORITY.get(settings.TELEGRAM_ALERT_LEVEL, 3)
        self._enabled = bool(self._token and self._chat_id)

    @property
    def is_enabled(self) -> bool:
        return self._enabled

    async def send_alert(self, level: str, message: str, bot_id: int | None = None) -> bool:
        if not self._enabled:
            return False

        level_priority = LEVEL_PRIORITY.get(level.upper(), 0)
        if level_priority < self._min_level:
            return False

        emoji = {"WARNING": "⚠️", "ERROR": "🔴", "CRITICAL": "🚨"}.get(level.upper(), "ℹ️")
        bot_prefix = f"Bot #{bot_id} " if bot_id else ""
        text = f"{emoji} {bot_prefix}[{level.upper()}]\n{message}"

        url = f"https://api.telegram.org/bot{self._token}/sendMessage"

        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.post(
                    url,
                    json={"chat_id": self._chat_id, "text": text, "parse_mode": "HTML"},
                )
                if response.status_code == 200:
                    logger.info("telegram_sent", level=level, bot_id=bot_id)
                    return True
                logger.warning("telegram_failed", status=response.status_code, body=response.text)
                return False
        except Exception as exc:
            logger.error("telegram_error", error=str(exc))
            return False

    async def send_trade_notification(
        self, bot_id: int, pair: str, direction: str, pnl: str, close_reason: str
    ) -> bool:
        message = (
            f"<b>Trade Closed</b>\n"
            f"Pair: {pair}\n"
            f"Direction: {direction}\n"
            f"Net PnL: {pnl}\n"
            f"Reason: {close_reason}"
        )
        return await self.send_alert("INFO", message, bot_id=bot_id)

    async def send_one_leg_alert(self, bot_id: int, details: str) -> bool:
        message = f"<b>ONE-LEG EVENT</b>\n{details}"
        return await self.send_alert("CRITICAL", message, bot_id=bot_id)


telegram_service = TelegramService()
