import asyncio
from decimal import ROUND_HALF_UP, Decimal

from app.core.exceptions import FundingBlockedError
from app.core.logging import get_logger

logger = get_logger("bots.funding_monitor")


class FundingMonitor:
    __slots__ = (
        "bot_id", "_hl_info", "_threshold", "_funding_a", "_funding_b",
        "_net_funding", "_blocked", "_update_interval",
    )

    def __init__(self, bot_id: int, hl_info: object, threshold: float = 0.5) -> None:
        self.bot_id = bot_id
        self._hl_info = hl_info
        self._threshold = Decimal(str(threshold))
        self._funding_a = Decimal("0")
        self._funding_b = Decimal("0")
        self._net_funding = Decimal("0")
        self._blocked = False
        self._update_interval = 60

    @property
    def is_blocked(self) -> bool:
        return self._blocked

    @property
    def net_funding(self) -> Decimal:
        return self._net_funding

    @property
    def funding_a(self) -> Decimal:
        return self._funding_a

    @property
    def funding_b(self) -> Decimal:
        return self._funding_b

    async def update(self, asset_a: str, asset_b: str) -> None:
        try:
            meta_a = self._hl_info.meta()
            funding_rates = {}
            for asset_info in meta_a.get("universe", []):
                name = asset_info.get("name", "")
                funding = asset_info.get("funding", "0")
                funding_rates[name] = Decimal(str(funding))

            self._funding_a = funding_rates.get(asset_a, Decimal("0"))
            self._funding_b = funding_rates.get(asset_b, Decimal("0"))
            self._net_funding = self._funding_a - self._funding_b

            self._blocked = (
                self._net_funding < 0
                and abs(self._net_funding) > self._threshold
            )

            logger.info(
                "funding_updated",
                bot_id=self.bot_id,
                funding_a=str(self._funding_a),
                funding_b=str(self._funding_b),
                net_funding=str(self._net_funding),
                blocked=self._blocked,
            )

        except Exception as exc:
            logger.warning("funding_update_failed", bot_id=self.bot_id, error=str(exc))

    def check_entry_allowed(self, edge: Decimal, position_size: Decimal) -> bool:
        if not self._blocked:
            return True

        funding_cost = abs(self._net_funding) * position_size
        edge_value = edge * self._threshold

        if funding_cost > edge_value:
            logger.info(
                "funding_blocked_entry",
                bot_id=self.bot_id,
                funding_cost=str(funding_cost),
                edge_value=str(edge_value),
            )
            return False

        return True

    def is_alert_level(self) -> bool:
        threshold_8h = Decimal("0.001")
        return abs(self._net_funding) > threshold_8h

    async def run_loop(self, asset_a: str, asset_b: str, stop_event: asyncio.Event) -> None:
        while not stop_event.is_set():
            await self.update(asset_a, asset_b)
            try:
                await asyncio.wait_for(stop_event.wait(), timeout=self._update_interval)
            except asyncio.TimeoutError:
                pass
