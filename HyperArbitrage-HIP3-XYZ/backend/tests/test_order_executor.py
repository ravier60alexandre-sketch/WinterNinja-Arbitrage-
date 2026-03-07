import asyncio
from decimal import Decimal
from unittest.mock import AsyncMock

import pytest

from app.bots.order_executor import OrderExecutor, OrderResult
from app.core.exceptions import OrderExecutionError, SlippageExceededError


@pytest.fixture
def executor(mock_exchange):
    ex = OrderExecutor(bot_id=1, exchange=mock_exchange, max_retries=3)
    ex.set_tick_size("XYZ", Decimal("0.01"))
    ex.set_tick_size("CASH", Decimal("0.01"))
    return ex


class TestOrderExecutor:
    @pytest.mark.asyncio
    async def test_bulk_order_success(self, executor):
        result_a, result_b = await executor.execute_pair(
            asset_a="XYZ", side_a="buy", size_a=Decimal("10"), mid_a=Decimal("100.0"),
            asset_b="CASH", side_b="sell", size_b=Decimal("10"), mid_b=Decimal("99.5"),
        )
        assert result_a.filled or result_b.filled

    @pytest.mark.asyncio
    async def test_slippage_exceeded_blocks_order(self, executor):
        with pytest.raises(SlippageExceededError):
            executor.check_slippage(Decimal("15.0"), Decimal("5.0"))

    @pytest.mark.asyncio
    async def test_partial_fill_triggers_one_leg_guard(self, executor, mock_exchange):
        mock_exchange.place_order = AsyncMock(return_value={
            "response": {"data": {"statuses": [{"filled": None}]}}
        })

        result_a, result_b = await executor.execute_pair(
            asset_a="XYZ", side_a="buy", size_a=Decimal("10"), mid_a=Decimal("100.0"),
            asset_b="CASH", side_b="sell", size_b=Decimal("10"), mid_b=Decimal("99.5"),
        )
        assert not result_a.filled

    @pytest.mark.asyncio
    async def test_retry_on_network_error(self, executor, mock_exchange):
        call_count = 0
        async def side_effect(**kwargs):
            nonlocal call_count
            call_count += 1
            if call_count <= 2:
                raise ConnectionError("Network error")
            return {
                "response": {"data": {"statuses": [{
                    "filled": {"oid": "ok", "avgPx": "100.0", "totalSz": "10"}
                }]}}
            }

        mock_exchange.place_order = AsyncMock(side_effect=side_effect)
        result = await executor._place_with_retry("XYZ", "buy", Decimal("10"), Decimal("100.0"))
        assert call_count == 3

    @pytest.mark.asyncio
    async def test_no_retry_on_business_error(self, executor, mock_exchange):
        mock_exchange.place_order = AsyncMock(side_effect=ValueError("Insufficient margin"))

        with pytest.raises(OrderExecutionError):
            await executor._place_with_retry("XYZ", "buy", Decimal("10"), Decimal("100.0"))

    def test_compute_slippage_buy(self, executor):
        slippage = executor._compute_slippage(Decimal("100"), Decimal("100.05"), "buy")
        assert slippage > 0

    def test_compute_slippage_sell(self, executor):
        slippage = executor._compute_slippage(Decimal("100"), Decimal("99.95"), "sell")
        assert slippage > 0
