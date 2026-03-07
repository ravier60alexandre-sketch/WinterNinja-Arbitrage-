import asyncio
from dataclasses import dataclass, field
from decimal import Decimal

from app.core.exceptions import OneLegError
from app.core.logging import get_logger

logger = get_logger("bots.one_leg_guard")


@dataclass(slots=True)
class FillEvent:
    order_id: str
    asset: str
    side: str
    size: Decimal
    price: Decimal
    filled: bool


class OneLegGuard:
    __slots__ = ("bot_id", "_timeout_ms", "_lock", "_exchange", "_one_leg_count")

    def __init__(self, bot_id: int, timeout_ms: int, exchange: object) -> None:
        self.bot_id = bot_id
        self._timeout_ms = timeout_ms
        self._lock = asyncio.Lock()
        self._exchange = exchange
        self._one_leg_count = 0

    @property
    def one_leg_count(self) -> int:
        return self._one_leg_count

    async def monitor_fills(
        self,
        order_a_id: str,
        order_b_id: str,
        fill_events: asyncio.Queue,
    ) -> tuple[bool, str]:
        async with self._lock:
            filled_a = False
            filled_b = False
            timeout_s = self._timeout_ms / 1000.0

            try:
                deadline = asyncio.get_event_loop().time() + timeout_s

                while not (filled_a and filled_b):
                    remaining = deadline - asyncio.get_event_loop().time()
                    if remaining <= 0:
                        break

                    try:
                        event: FillEvent = await asyncio.wait_for(
                            fill_events.get(), timeout=remaining
                        )
                    except asyncio.TimeoutError:
                        break

                    if event.order_id == order_a_id and event.filled:
                        filled_a = True
                    elif event.order_id == order_b_id and event.filled:
                        filled_b = True

                if filled_a and filled_b:
                    logger.info("both_legs_filled", bot_id=self.bot_id)
                    return True, "success"

                if filled_a and not filled_b:
                    return await self._handle_one_leg(order_b_id, "b", order_a_id, "a")

                if filled_b and not filled_a:
                    return await self._handle_one_leg(order_a_id, "a", order_b_id, "b")

                await self._cancel_both(order_a_id, order_b_id)
                logger.info("no_fills_timeout", bot_id=self.bot_id)
                return False, "no_fill"

            except Exception as exc:
                logger.error("one_leg_guard_error", bot_id=self.bot_id, error=str(exc))
                raise OneLegError(
                    f"One-leg guard error: {exc}",
                    context={"bot_id": self.bot_id, "order_a": order_a_id, "order_b": order_b_id},
                ) from exc

    async def _handle_one_leg(
        self,
        unfilled_id: str,
        unfilled_leg: str,
        filled_id: str,
        filled_leg: str,
    ) -> tuple[bool, str]:
        self._one_leg_count += 1
        logger.warning(
            "one_leg_detected",
            bot_id=self.bot_id,
            filled_leg=filled_leg,
            unfilled_leg=unfilled_leg,
            total_one_leg_events=self._one_leg_count,
        )

        try:
            await self._exchange.cancel_order(unfilled_id)
        except Exception as exc:
            logger.error("cancel_unfilled_failed", bot_id=self.bot_id, order_id=unfilled_id, error=str(exc))

        try:
            await self._exchange.market_close(filled_id)
        except Exception as exc:
            logger.error("market_close_failed", bot_id=self.bot_id, order_id=filled_id, error=str(exc))

        return False, "one_leg"

    async def _cancel_both(self, order_a_id: str, order_b_id: str) -> None:
        tasks = [
            self._safe_cancel(order_a_id),
            self._safe_cancel(order_b_id),
        ]
        await asyncio.gather(*tasks)

    async def _safe_cancel(self, order_id: str) -> None:
        try:
            await self._exchange.cancel_order(order_id)
        except Exception as exc:
            logger.warning("cancel_order_failed", bot_id=self.bot_id, order_id=order_id, error=str(exc))
