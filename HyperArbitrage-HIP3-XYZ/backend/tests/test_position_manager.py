from decimal import Decimal

import pytest

from app.bots.position_manager import PositionManager


@pytest.fixture
def pm_profit(mock_exchange):
    return PositionManager(bot_id=1, exchange=mock_exchange, exit_mode="on_profit")


@pytest.fixture
def pm_reverse(mock_exchange):
    return PositionManager(bot_id=1, exchange=mock_exchange, exit_mode="on_reverse")


class TestPositionManager:
    def test_exit_on_profit_mode(self, pm_profit):
        assert pm_profit.should_exit(
            net_pnl=Decimal("10"),
            fees_roundtrip=Decimal("3"),
            slippage_margin=Decimal("2"),
        ) is True

        assert pm_profit.should_exit(
            net_pnl=Decimal("2"),
            fees_roundtrip=Decimal("3"),
            slippage_margin=Decimal("2"),
        ) is False

    def test_exit_on_reverse_mode(self, pm_reverse):
        assert pm_reverse.should_exit(
            net_pnl=Decimal("10"),
            fees_roundtrip=Decimal("3"),
            slippage_margin=Decimal("2"),
            reverse_signal=False,
        ) is False

        assert pm_reverse.should_exit(
            net_pnl=Decimal("10"),
            fees_roundtrip=Decimal("3"),
            slippage_margin=Decimal("2"),
            reverse_signal=True,
        ) is True

    @pytest.mark.asyncio
    async def test_forced_close_after_retry_failure(self, mock_exchange):
        mock_exchange.place_order = pytest.importorskip("unittest.mock").AsyncMock(
            side_effect=Exception("Close failed")
        )
        mock_exchange.market_close = pytest.importorskip("unittest.mock").AsyncMock(return_value=True)

        pm = PositionManager(bot_id=1, exchange=mock_exchange, exit_mode="on_profit")
        result = await pm.close_position(
            asset_a="XYZ", side_a="sell", size_a=Decimal("10"),
            asset_b="CASH", side_b="buy", size_b=Decimal("10"),
        )
        assert result is True
        assert mock_exchange.market_close.call_count == 2

    def test_compute_net_pnl_long(self, pm_profit):
        pnl = pm_profit.compute_net_pnl(
            entry_price_a=Decimal("100"), entry_price_b=Decimal("99"),
            exit_price_a=Decimal("101"), exit_price_b=Decimal("98"),
            size=Decimal("10"),
            fees_paid=Decimal("0.5"),
            funding_paid=Decimal("0.1"),
            direction="long_a_short_b",
        )
        assert pnl == Decimal("19.40000000")

    def test_compute_net_pnl_short(self, pm_profit):
        pnl = pm_profit.compute_net_pnl(
            entry_price_a=Decimal("101"), entry_price_b=Decimal("98"),
            exit_price_a=Decimal("100"), exit_price_b=Decimal("99"),
            size=Decimal("10"),
            fees_paid=Decimal("0.5"),
            funding_paid=Decimal("0.1"),
            direction="short_a_long_b",
        )
        assert pnl == Decimal("19.40000000")
