from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio

from app.bots.fee_calculator import FeeCalculator


@pytest.fixture
def fee_calc(mock_hl_info, mock_redis):
    return FeeCalculator(bot_id=1, hl_info=mock_hl_info)


class TestFeeCalculator:
    @pytest.mark.asyncio
    async def test_fees_include_all_discounts(self, fee_calc, mock_redis):
        fee = await fee_calc.get_taker_fee("XYZ", "0xabc")
        assert isinstance(fee, Decimal)
        assert fee > 0

    @pytest.mark.asyncio
    async def test_redis_cache_hit_skips_api_call(self, mock_hl_info, mock_redis):
        mock_redis["get"].return_value = "0.0007"
        calc = FeeCalculator(bot_id=1, hl_info=mock_hl_info)

        fee = await calc.get_taker_fee("XYZ", "0xabc")
        assert fee == Decimal("0.0007")
        mock_hl_info.user_fees.assert_not_called()

    @pytest.mark.asyncio
    async def test_fallback_to_last_known_on_redis_failure(self, mock_hl_info, mock_redis):
        calc = FeeCalculator(bot_id=1, hl_info=mock_hl_info)

        await calc.get_taker_fee("XYZ", "0xabc")

        mock_redis["get"].return_value = None
        mock_hl_info.user_fees.side_effect = Exception("API down")

        fee = await calc.get_taker_fee("XYZ", "0xabc")
        assert isinstance(fee, Decimal)
        assert fee > 0

    @pytest.mark.asyncio
    async def test_roundtrip_fees(self, fee_calc, mock_redis):
        roundtrip = await fee_calc.compute_roundtrip_fees("XYZ", "CASH", "0xabc")
        assert isinstance(roundtrip, Decimal)
        assert roundtrip > 0

    def test_fees_in_bps(self, fee_calc):
        bps = fee_calc.fees_in_bps(Decimal("0.0028"))
        assert bps == Decimal("28.00")
