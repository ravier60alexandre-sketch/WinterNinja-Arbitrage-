import asyncio
from decimal import ROUND_HALF_UP, Decimal

from app.core.logging import get_logger

logger = get_logger("bots.position_manager")


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

    async def close_position(
        self,
        asset_a: str,
        side_a: str,
        size_a: Decimal,
        asset_b: str,
        side_b: str,
        size_b: Decimal,
    ) -> bool:
        for attempt in range(self._max_close_retries):
            try:
                results = await asyncio.gather(
                    self._exchange.place_order(
                        asset=asset_a,
                        is_buy=(side_a == "buy"),
                        sz=float(size_a),
                        limit_px=0,
                        order_type={"limit": {"tif": "Ioc"}},
                        reduce_only=True,
                    ),
                    self._exchange.place_order(
                        asset=asset_b,
                        is_buy=(side_b == "buy"),
                        sz=float(size_b),
                        limit_px=0,
                        order_type={"limit": {"tif": "Ioc"}},
                        reduce_only=True,
                    ),
                )
                logger.info(
                    "position_closed",
                    bot_id=self.bot_id,
                    attempt=attempt + 1,
                    asset_a=asset_a,
                    asset_b=asset_b,
                )
                return True

            except Exception as exc:
                logger.warning(
                    "close_position_retry",
                    bot_id=self.bot_id,
                    attempt=attempt + 1,
                    error=str(exc),
                )
                if attempt < self._max_close_retries - 1:
                    await asyncio.sleep(0.2 * (attempt + 1))

        logger.error("close_position_failed_forcing_market", bot_id=self.bot_id)
        return await self._force_market_close(asset_a, side_a, size_a, asset_b, side_b, size_b)

    async def _force_market_close(
        self,
        asset_a: str,
        side_a: str,
        size_a: Decimal,
        asset_b: str,
        side_b: str,
        size_b: Decimal,
    ) -> bool:
        try:
            await asyncio.gather(
                self._exchange.market_close(asset_a),
                self._exchange.market_close(asset_b),
            )
            logger.info("forced_market_close_success", bot_id=self.bot_id)
            return True
        except Exception as exc:
            logger.critical(
                "forced_market_close_failed",
                bot_id=self.bot_id,
                error=str(exc),
            )
            return False

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
