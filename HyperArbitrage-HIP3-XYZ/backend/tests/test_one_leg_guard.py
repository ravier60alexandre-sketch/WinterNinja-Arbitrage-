import asyncio
from decimal import Decimal

import pytest

from app.bots.one_leg_guard import FillEvent, OneLegGuard


@pytest.fixture
def guard(mock_exchange):
    return OneLegGuard(bot_id=1, timeout_ms=200, exchange=mock_exchange)


class TestOneLegGuard:
    @pytest.mark.asyncio
    async def test_both_legs_filled_before_timeout(self, guard):
        queue = asyncio.Queue()
        await queue.put(FillEvent("ord_a", "XYZ", "buy", Decimal("10"), Decimal("100"), True))
        await queue.put(FillEvent("ord_b", "CASH", "sell", Decimal("10"), Decimal("99"), True))

        success, reason = await guard.monitor_fills("ord_a", "ord_b", queue)
        assert success is True
        assert reason == "success"
        assert guard.one_leg_count == 0

    @pytest.mark.asyncio
    async def test_one_leg_filled_timeout(self, guard, mock_exchange):
        queue = asyncio.Queue()
        await queue.put(FillEvent("ord_a", "XYZ", "buy", Decimal("10"), Decimal("100"), True))

        success, reason = await guard.monitor_fills("ord_a", "ord_b", queue)
        assert success is False
        assert reason == "one_leg"
        assert guard.one_leg_count == 1
        mock_exchange.cancel_order.assert_called_once_with("ord_b")
        mock_exchange.market_close.assert_called_once_with("ord_a")

    @pytest.mark.asyncio
    async def test_no_fill_timeout(self, guard, mock_exchange):
        queue = asyncio.Queue()

        success, reason = await guard.monitor_fills("ord_a", "ord_b", queue)
        assert success is False
        assert reason == "no_fill"
        assert guard.one_leg_count == 0
        assert mock_exchange.cancel_order.call_count == 2

    @pytest.mark.asyncio
    async def test_concurrent_fills_race_condition(self, guard):
        queue = asyncio.Queue()

        async def delayed_fills():
            await asyncio.sleep(0.01)
            await queue.put(FillEvent("ord_a", "XYZ", "buy", Decimal("10"), Decimal("100"), True))
            await asyncio.sleep(0.01)
            await queue.put(FillEvent("ord_b", "CASH", "sell", Decimal("10"), Decimal("99"), True))

        task = asyncio.create_task(delayed_fills())
        success, reason = await guard.monitor_fills("ord_a", "ord_b", queue)
        await task

        assert success is True
        assert reason == "success"
