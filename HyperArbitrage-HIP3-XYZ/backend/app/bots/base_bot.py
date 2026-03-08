import asyncio
from datetime import UTC, datetime
from enum import Enum
from typing import Any, Callable, Coroutine

from app.core.logging import get_logger

logger = get_logger("bots.base")


class BotState(str, Enum):
    """All possible states in the bot lifecycle."""

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

StateCallback = Callable[[int, BotState, BotState, str], Coroutine[Any, Any, None]]


class BaseBot:
    """Abstract base class for all arbitrage bots.

    Manages the state machine lifecycle:
        IDLE -> CONNECTING -> RUNNING -> PAUSED -> LIQUIDATING -> STOPPED

    Subclasses must implement ``start()``, ``stop()``, and ``tick()``.
    """

    __slots__ = (
        "bot_id",
        "name",
        "config",
        "_state",
        "_lock",
        "_state_callback",
        "created_at",
        "updated_at",
    )

    def __init__(self, bot_id: int, name: str = "", config: dict | None = None) -> None:
        self.bot_id = bot_id
        self.name: str = name
        self.config: dict = config or {}
        self._state = BotState.IDLE
        self._lock = asyncio.Lock()
        self._state_callback: StateCallback | None = None
        self.created_at: datetime = datetime.now(UTC)
        self.updated_at: datetime = datetime.now(UTC)

    # ------------------------------------------------------------------
    # State property
    # ------------------------------------------------------------------

    @property
    def state(self) -> BotState:
        return self._state

    # ------------------------------------------------------------------
    # Callback registration
    # ------------------------------------------------------------------

    def set_state_callback(self, callback: StateCallback) -> None:
        """Register a callback invoked on every state transition.

        Signature::

            async def callback(bot_id, old_state, new_state, reason) -> None
        """
        self._state_callback = callback

    # ------------------------------------------------------------------
    # State transitions
    # ------------------------------------------------------------------

    async def transition_state(self, new_state: BotState, reason: str = "") -> None:
        """Atomically transition to *new_state*.

        Logs the transition, updates the ``updated_at`` timestamp, and invokes
        the registered WebSocket callback (if any).

        Raises ``ValueError`` when the transition is not permitted.
        """
        async with self._lock:
            allowed = VALID_TRANSITIONS.get(self._state, set())
            if new_state not in allowed:
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
            self.updated_at = datetime.now(UTC)

            logger.info(
                "state_transition",
                bot_id=self.bot_id,
                old_state=old_state.value,
                new_state=new_state.value,
                reason=reason,
            )

            if self._state_callback is not None:
                try:
                    await self._state_callback(
                        self.bot_id, old_state, new_state, reason
                    )
                except Exception as exc:
                    logger.error(
                        "state_callback_error",
                        bot_id=self.bot_id,
                        error=str(exc),
                    )

    # Alias used by BotInstance
    async def transition(self, new_state: BotState, reason: str = "") -> None:
        await self.transition_state(new_state, reason)

    # ------------------------------------------------------------------
    # Convenience helpers
    # ------------------------------------------------------------------

    def is_active(self) -> bool:
        """Return ``True`` when the bot is in RUNNING or LIQUIDATING state."""
        return self._state in (BotState.RUNNING, BotState.LIQUIDATING)

    # ------------------------------------------------------------------
    # Abstract interface -- subclasses MUST override
    # ------------------------------------------------------------------

    async def start(self) -> None:
        raise NotImplementedError("Subclasses must implement start()")

    async def stop(self) -> None:
        raise NotImplementedError("Subclasses must implement stop()")

    async def tick(self) -> None:
        raise NotImplementedError("Subclasses must implement tick()")
