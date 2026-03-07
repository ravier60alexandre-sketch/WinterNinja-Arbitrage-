import asyncio
import time
from decimal import ROUND_HALF_UP, Decimal
from dataclasses import dataclass

from app.core.exceptions import OrderExecutionError, SlippageExceededError
from app.core.logging import get_logger

logger = get_logger("bots.order_executor")


@dataclass(slots=True)
class OrderResult:
    order_id: str
    asset: str
    side: str
    size: Decimal
    price: Decimal
    filled: bool
    latency_ns: int
    slippage: Decimal


class OrderExecutor:
    __slots__ = ("bot_id", "_exchange", "_max_retries", "_tick_sizes")

    def __init__(self, bot_id: int, exchange: object, max_retries: int = 3) -> None:
        self.bot_id = bot_id
        self._exchange = exchange
        self._max_retries = max_retries
        self._tick_sizes: dict[str, Decimal] = {}

    def set_tick_size(self, asset: str, tick_size: Decimal) -> None:
        self._tick_sizes[asset] = tick_size

    def _compute_aggressive_price(
        self, mid: Decimal, side: str, max_slippage_ticks: int, asset: str
    ) -> Decimal:
        tick = self._tick_sizes.get(asset, Decimal("0.01"))
        offset = tick * max_slippage_ticks
        if side == "buy":
            return (mid + offset).quantize(tick, rounding=ROUND_HALF_UP)
        return (mid - offset).quantize(tick, rounding=ROUND_HALF_UP)

    async def execute_pair(
        self,
        asset_a: str,
        side_a: str,
        size_a: Decimal,
        mid_a: Decimal,
        asset_b: str,
        side_b: str,
        size_b: Decimal,
        mid_b: Decimal,
        max_slippage_ticks: int = 2,
    ) -> tuple[OrderResult, OrderResult]:
        price_a = self._compute_aggressive_price(mid_a, side_a, max_slippage_ticks, asset_a)
        price_b = self._compute_aggressive_price(mid_b, side_b, max_slippage_ticks, asset_b)

        start_ns = time.perf_counter_ns()

        result_a, result_b = await asyncio.gather(
            self._place_with_retry(asset_a, side_a, size_a, price_a),
            self._place_with_retry(asset_b, side_b, size_b, price_b),
        )

        elapsed_ns = time.perf_counter_ns() - start_ns

        slippage_a = self._compute_slippage(mid_a, result_a.price, side_a)
        slippage_b = self._compute_slippage(mid_b, result_b.price, side_b)

        result_a.latency_ns = elapsed_ns
        result_a.slippage = slippage_a
        result_b.latency_ns = elapsed_ns
        result_b.slippage = slippage_b

        logger.info(
            "pair_order_executed",
            bot_id=self.bot_id,
            asset_a=asset_a,
            asset_b=asset_b,
            latency_ms=elapsed_ns / 1_000_000,
            slippage_a=str(slippage_a),
            slippage_b=str(slippage_b),
        )

        return result_a, result_b

    async def _place_with_retry(
        self, asset: str, side: str, size: Decimal, price: Decimal
    ) -> OrderResult:
        last_exc = None
        for attempt in range(self._max_retries):
            try:
                start_ns = time.perf_counter_ns()
                result = await self._exchange.place_order(
                    asset=asset,
                    is_buy=(side == "buy"),
                    sz=float(size),
                    limit_px=float(price),
                    order_type={"limit": {"tif": "Ioc"}},
                )

                order_id = str(result.get("response", {}).get("data", {}).get("statuses", [{}])[0].get("resting", {}).get("oid", ""))
                filled = result.get("response", {}).get("data", {}).get("statuses", [{}])[0].get("filled", None) is not None

                if not order_id and filled:
                    order_id = str(result.get("response", {}).get("data", {}).get("statuses", [{}])[0].get("filled", {}).get("oid", ""))

                fill_price = Decimal(str(
                    result.get("response", {}).get("data", {}).get("statuses", [{}])[0].get("filled", {}).get("avgPx", price)
                ))

                return OrderResult(
                    order_id=order_id or f"unknown_{asset}_{attempt}",
                    asset=asset,
                    side=side,
                    size=size,
                    price=fill_price,
                    filled=filled,
                    latency_ns=time.perf_counter_ns() - start_ns,
                    slippage=Decimal("0"),
                )

            except (ConnectionError, TimeoutError, OSError) as exc:
                last_exc = exc
                delay = 0.1 * (2 ** attempt)
                logger.warning(
                    "order_retry",
                    bot_id=self.bot_id,
                    asset=asset,
                    attempt=attempt + 1,
                    delay=delay,
                    error=str(exc),
                )
                await asyncio.sleep(delay)

            except Exception as exc:
                raise OrderExecutionError(
                    f"Business error placing order: {exc}",
                    context={"bot_id": self.bot_id, "asset": asset, "side": side},
                ) from exc

        raise OrderExecutionError(
            f"Max retries ({self._max_retries}) exceeded for {asset}",
            context={"bot_id": self.bot_id, "asset": asset, "last_error": str(last_exc)},
        )

    def _compute_slippage(self, mid: Decimal, fill_price: Decimal, side: str) -> Decimal:
        if mid == 0:
            return Decimal("0")
        if side == "buy":
            slippage = ((fill_price - mid) / mid * Decimal("10000")).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )
        else:
            slippage = ((mid - fill_price) / mid * Decimal("10000")).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )
        return slippage

    def check_slippage(self, slippage: Decimal, max_bps: Decimal) -> None:
        if slippage > max_bps:
            raise SlippageExceededError(
                f"Slippage {slippage} bps exceeds max {max_bps} bps",
                context={"bot_id": self.bot_id, "slippage": str(slippage), "max": str(max_bps)},
            )
