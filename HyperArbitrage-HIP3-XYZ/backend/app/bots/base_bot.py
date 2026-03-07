import asyncio
from enum import Enum
from typing import Any

from app.core.logging import get_logger

logger = get_logger("bots.base")


class BotState(str, Enum):
    IDLE = "IDLE"
    CONNECTING = "CONNECTING"
    RUNNING = "RUNNING"
    PAUSED = "PAUSED"
    LIQUIDATING = "LIQUIDATING"
    STOPPED = "STOPPED"


VALID_TRANSITIONS: dict[BotState, set[BotState]] = {
    BotState.IDLE: {BotState.CONNECTING},
    BotState.CONNECTING: {BotState.RUNNING, BotState.STOPPED},
    BotState.RUNNING: {BotState.PAUSED, BotState.LIQUIDATING, BotState.STOPPED},
    BotState.PAUSED: {BotState.RUNNING, BotState.STOPPED, BotState.LIQUIDATING},
    BotState.LIQUIDATING: {BotState.STOPPED},
    BotState.STOPPED: {BotState.IDLE},
}


class BaseBot:
    __slots__ = ("bot_id", "name", "_state", "_lock", "_state_callback")

    def __init__(self, bot_id: int, name: str) -> None:
        self.bot_id = bot_id
        self.name = name
        self._state = BotState.IDLE
        self._lock = asyncio.Lock()
        self._state_callback: Any = None

    @property
    def state(self) -> BotState:
        return self._state

    def set_state_callback(self, callback: Any) -> None:
        self._state_callback = callback

    async def transition(self, new_state: BotState, reason: str = "") -> None:
        async with self._lock:
            if new_state not in VALID_TRANSITIONS.get(self._state, set()):
                logger.warning(
                    "invalid_state_transition",
                    bot_id=self.bot_id,
                    current=self._state.value,
                    requested=new_state.value,
                )
                raise ValueError(
                    f"Invalid transition: {self._state.value} -> {new_state.value}"
                )
            old_state = self._state
            self._state = new_state
            logger.info(
                "state_transition",
                bot_id=self.bot_id,
                old_state=old_state.value,
                new_state=new_state.value,
                reason=reason,
            )
            if self._state_callback:
                await self._state_callback(self.bot_id, old_state, new_state, reason)

    def is_active(self) -> bool:
        return self._state in (BotState.RUNNING, BotState.LIQUIDATING)
