import time
from decimal import ROUND_HALF_UP, Decimal

import orjson

from app.core.logging import get_logger
from app.core.redis import redis_get, redis_set

logger = get_logger("bots.fee_calculator")

_fee_cache: dict[str, tuple[float, Decimal]] = {}
FEE_REFRESH_INTERVAL = 60.0


class FeeCalculator:
    __slots__ = ("bot_id", "_hl_info", "_last_known_fees")

    def __init__(self, bot_id: int, hl_info: object) -> None:
        self.bot_id = bot_id
        self._hl_info = hl_info
        self._last_known_fees: dict[str, Decimal] = {}

    async def get_taker_fee(self, asset: str, account_address: str) -> Decimal:
        cache_key = f"fees:{self.bot_id}:{asset}"

        cached = await redis_get(cache_key)
        if cached is not None:
            fee = Decimal(cached)
            self._last_known_fees[asset] = fee
            return fee

        mem_key = f"{self.bot_id}:{asset}"
        if mem_key in _fee_cache:
            ts, fee = _fee_cache[mem_key]
            if time.time() - ts < FEE_REFRESH_INTERVAL:
                return fee

        try:
            user_fees = self._hl_info.user_fees(account_address)
            taker_rate = Decimal(str(user_fees.get("taker", "0.00035")))
            hip3_fee = (taker_rate * 2).quantize(Decimal("0.00000001"), rounding=ROUND_HALF_UP)

            _fee_cache[mem_key] = (time.time(), hip3_fee)
            self._last_known_fees[asset] = hip3_fee
            await redis_set(cache_key, str(hip3_fee), ttl=60)

            logger.info("fee_updated", bot_id=self.bot_id, asset=asset, taker_fee=str(hip3_fee))
            return hip3_fee

        except Exception as exc:
            logger.warning("fee_fetch_failed", bot_id=self.bot_id, asset=asset, error=str(exc))
            if asset in self._last_known_fees:
                return self._last_known_fees[asset]
            return Decimal("0.0007")

    async def compute_roundtrip_fees(
        self,
        asset_a: str,
        asset_b: str,
        account_address: str,
    ) -> Decimal:
        fee_a = await self.get_taker_fee(asset_a, account_address)
        fee_b = await self.get_taker_fee(asset_b, account_address)
        roundtrip = ((fee_a + fee_b) * 2).quantize(Decimal("0.00000001"), rounding=ROUND_HALF_UP)
        return roundtrip

    def fees_in_bps(self, fees_roundtrip: Decimal) -> Decimal:
        return (fees_roundtrip * Decimal("10000")).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
