import asyncio
from dataclasses import dataclass
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
        asset_a: str = "",
        asset_b: str = "",
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
                    return await self._handle_one_leg(
                        order_b_id, "b", asset_b,
                        order_a_id, "a", asset_a,
                    )

                if filled_b and not filled_a:
                    return await self._handle_one_leg(
                        order_a_id, "a", asset_a,
                        order_b_id, "b", asset_b,
                    )

                await self._cancel_both(order_a_id, asset_a, order_b_id, asset_b)
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
        unfilled_oid: str,
        unfilled_leg: str,
        unfilled_asset: str,
        filled_oid: str,
        filled_leg: str,
        filled_asset: str,
    ) -> tuple[bool, str]:
        self._one_leg_count += 1
        logger.warning(
            "one_leg_detected",
            bot_id=self.bot_id,
            filled_leg=filled_leg,
            unfilled_leg=unfilled_leg,
            total_one_leg_events=self._one_leg_count,
        )

        # Cancel the unfilled order — SDK cancel(name, oid) is synchronous
        try:
            oid_int = int(unfilled_oid) if unfilled_oid.isdigit() else 0
            if oid_int and unfilled_asset:
                await asyncio.to_thread(self._exchange.cancel, unfilled_asset, oid_int)
        except Exception as exc:
            logger.error("cancel_unfilled_failed", bot_id=self.bot_id, order_id=unfilled_oid, error=str(exc))

        # Close the filled leg via market_close(coin) — synchronous
        try:
            if filled_asset:
                await asyncio.to_thread(self._exchange.market_close, filled_asset)
        except Exception as exc:
            logger.error("market_close_failed", bot_id=self.bot_id, asset=filled_asset, error=str(exc))

        return False, "one_leg"

    async def _cancel_both(
        self,
        order_a_id: str, asset_a: str,
        order_b_id: str, asset_b: str,
    ) -> None:
        tasks = [
            self._safe_cancel(order_a_id, asset_a),
            self._safe_cancel(order_b_id, asset_b),
        ]
        await asyncio.gather(*tasks)

    async def _safe_cancel(self, order_id: str, asset: str) -> None:
        try:
            oid_int = int(order_id) if order_id.isdigit() else 0
            if oid_int and asset:
                await asyncio.to_thread(self._exchange.cancel, asset, oid_int)
        except Exception as exc:
            logger.warning("cancel_order_failed", bot_id=self.bot_id, order_id=order_id, error=str(exc))
