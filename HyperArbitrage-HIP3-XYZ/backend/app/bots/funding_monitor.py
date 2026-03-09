import asyncio
from decimal import ROUND_HALF_UP, Decimal

from app.core.exceptions import FundingBlockedError
from app.core.logging import get_logger

logger = get_logger("bots.funding_monitor")


class FundingMonitor:
    __slots__ = (
        "bot_id", "_hl_info", "_threshold",
        "_funding_rates", "_net_funding", "_blocked", "_update_interval",
    )

    def __init__(self, bot_id: int, hl_info: object, threshold: float = 0.5) -> None:
        self.bot_id = bot_id
        self._hl_info = hl_info
        self._threshold = Decimal(str(threshold))
        self._funding_rates: dict[str, Decimal] = {}
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
        return self._funding_rates.get("_last_a", Decimal("0"))

    @property
    def funding_b(self) -> Decimal:
        return self._funding_rates.get("_last_b", Decimal("0"))

    async def update(self, assets: list[str]) -> None:
        """Fetch funding rates for all tracked assets."""
        try:
            meta = await asyncio.to_thread(self._hl_info.meta)
            funding_map: dict[str, Decimal] = {}
            for asset_info in meta.get("universe", []):
                name = asset_info.get("name", "")
                funding = asset_info.get("funding", "0")
                funding_map[name] = Decimal(str(funding))

            self._funding_rates = funding_map

            # Check if ANY pair has unfavorable funding above threshold
            # Global block: if any asset has extreme funding, block all entries
            blocked = False
            for asset in assets:
                rate = funding_map.get(asset, Decimal("0"))
                if abs(rate) > self._threshold:
                    blocked = True
                    break

            self._blocked = blocked

            logger.info(
                "funding_updated",
                bot_id=self.bot_id,
                tracked_assets=len(assets),
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

    async def run_loop(
        self,
        assets: list[str] | str,
        stop_event: asyncio.Event,
        asset_b: str | None = None,
    ) -> None:
        """Run funding monitor loop.

        Supports both old signature (asset_a, asset_b, stop_event) for backward
        compat and new signature (assets_list, stop_event).
        """
        # Handle backward-compatible call: run_loop(asset_a, stop_event) won't work
        # but run_loop(asset_a, asset_b, stop_event) will via the old positional args
        if isinstance(assets, str):
            # Old-style call: run_loop("xyz:TSLA", stop_event_or_asset_b, ...)
            if isinstance(stop_event, str):
                # run_loop(asset_a, asset_b, stop_event)
                asset_list = [assets, stop_event]
                actual_stop_event = asset_b
            else:
                asset_list = [assets]
                actual_stop_event = stop_event
        else:
            asset_list = assets
            actual_stop_event = stop_event

        while not actual_stop_event.is_set():
            await self.update(asset_list)
            try:
                await asyncio.wait_for(actual_stop_event.wait(), timeout=self._update_interval)
            except asyncio.TimeoutError:
                pass
