import asyncio
from decimal import ROUND_HALF_UP, Decimal

from app.core.logging import get_logger

logger = get_logger("bots.position_manager")

# Default slippage for market_close (5%)
_MARKET_CLOSE_SLIPPAGE = 0.05


class PositionManager:
    __slots__ = ("bot_id", "_exchange", "_exit_mode", "_max_close_retries")

    def __init__(self, bot_id: int, exchange: object, exit_mode: str = "on_profit") -> None:
        self.bot_id = bot_id
        self._exchange = exchange
        self._exit_mode = exit_mode
        self._max_close_retries = 3

    @property
    def exit_mode(self) -> str:
        return self._exit_mode

    @exit_mode.setter
    def exit_mode(self, mode: str) -> None:
        if mode not in ("on_profit", "on_reverse"):
            raise ValueError(f"Invalid exit mode: {mode}")
        self._exit_mode = mode

    def should_exit(
        self,
        net_pnl: Decimal,
        fees_roundtrip: Decimal,
        slippage_margin: Decimal,
        reverse_signal: bool = False,
    ) -> bool:
        if self._exit_mode == "on_profit":
            threshold = fees_roundtrip + slippage_margin
            if net_pnl > threshold:
                logger.info(
                    "exit_on_profit",
                    bot_id=self.bot_id,
                    net_pnl=str(net_pnl),
                    threshold=str(threshold),
                )
                return True
            return False

        if self._exit_mode == "on_reverse":
            if reverse_signal:
                logger.info("exit_on_reverse_signal", bot_id=self.bot_id, net_pnl=str(net_pnl))
                return True
            return False

        return False

    # ------------------------------------------------------------------
    # Single-leg close helper
    # ------------------------------------------------------------------

    async def _close_one_leg(self, asset: str, size: float | None = None) -> bool:
        """Try to close a single leg. Returns True on success."""
        try:
            if size is not None:
                await asyncio.to_thread(
                    self._exchange.market_close,
                    asset, size, None, _MARKET_CLOSE_SLIPPAGE,
                )
            else:
                # No size = close everything for this coin
                await asyncio.to_thread(self._exchange.market_close, asset)
            return True
        except Exception as exc:
            logger.warning("close_leg_failed", bot_id=self.bot_id, asset=asset, error=str(exc))
            return False

    # ------------------------------------------------------------------
    # Close position with per-leg orphan protection
    # ------------------------------------------------------------------

    async def close_position(
        self,
        asset_a: str,
        side_a: str,
        size_a: Decimal,
        asset_b: str,
        side_b: str,
        size_b: Decimal,
    ) -> bool:
        """Close both legs with individual tracking per leg.

        If one leg closes but the other fails, we keep retrying only
        the failing leg instead of re-closing both.  After all retries
        are exhausted we force-close whatever is still open.
        """
        closed_a = False
        closed_b = False

        for attempt in range(self._max_close_retries):
            # Only attempt legs that are still open
            tasks: dict[str, asyncio.Task] = {}
            if not closed_a:
                tasks["a"] = asyncio.ensure_future(
                    self._close_one_leg(asset_a, float(size_a))
                )
            if not closed_b:
                tasks["b"] = asyncio.ensure_future(
                    self._close_one_leg(asset_b, float(size_b))
                )

            if not tasks:
                break

            results = await asyncio.gather(*tasks.values(), return_exceptions=True)

            for key, result in zip(tasks.keys(), results):
                if result is True:
                    if key == "a":
                        closed_a = True
                    else:
                        closed_b = True

            if closed_a and closed_b:
                logger.info(
                    "position_closed",
                    bot_id=self.bot_id,
                    attempt=attempt + 1,
                    asset_a=asset_a,
                    asset_b=asset_b,
                )
                return True

            # Log which leg is orphaned
            orphan = asset_b if closed_a and not closed_b else (
                asset_a if closed_b and not closed_a else "both"
            )
            logger.warning(
                "close_orphan_leg",
                bot_id=self.bot_id,
                attempt=attempt + 1,
                orphan=orphan,
                closed_a=closed_a,
                closed_b=closed_b,
            )

            if attempt < self._max_close_retries - 1:
                await asyncio.sleep(0.2 * (attempt + 1))

        # Force-close anything still open
        if not closed_a or not closed_b:
            logger.error(
                "close_position_forcing_remaining",
                bot_id=self.bot_id,
                force_a=not closed_a,
                force_b=not closed_b,
            )
            return await self._force_remaining(
                asset_a if not closed_a else None,
                asset_b if not closed_b else None,
            )

        return True

    async def _force_remaining(
        self,
        asset_a: str | None,
        asset_b: str | None,
    ) -> bool:
        """Force market-close only the legs that are still open."""
        success = True
        tasks = []
        if asset_a:
            tasks.append(("a", self._close_one_leg(asset_a)))
        if asset_b:
            tasks.append(("b", self._close_one_leg(asset_b)))

        if not tasks:
            return True

        results = await asyncio.gather(*[t[1] for t in tasks], return_exceptions=True)
        for (leg, _), result in zip(tasks, results):
            if result is not True:
                logger.critical(
                    "forced_market_close_failed",
                    bot_id=self.bot_id,
                    leg=leg,
                    error=str(result),
                )
                success = False
            else:
                logger.info("forced_market_close_success", bot_id=self.bot_id, leg=leg)

        return success

    def compute_net_pnl(
        self,
        entry_price_a: Decimal,
        entry_price_b: Decimal,
        exit_price_a: Decimal,
        exit_price_b: Decimal,
        size: Decimal,
        fees_paid: Decimal,
        funding_paid: Decimal,
        direction: str,
    ) -> Decimal:
        if direction == "long_a_short_b":
            pnl_a = (exit_price_a - entry_price_a) * size
            pnl_b = (entry_price_b - exit_price_b) * size
        else:
            pnl_a = (entry_price_a - exit_price_a) * size
            pnl_b = (exit_price_b - entry_price_b) * size

        gross = (pnl_a + pnl_b).quantize(Decimal("0.00000001"), rounding=ROUND_HALF_UP)
        net = (gross - fees_paid - funding_paid).quantize(Decimal("0.00000001"), rounding=ROUND_HALF_UP)
        return net
