import time
from decimal import Decimal

import pytest
from hypothesis import given, settings as h_settings
from hypothesis import strategies as st

from app.bots.spread_calculator import SpreadCalculator, SpreadSample


@pytest.fixture
def calc():
    return SpreadCalculator(bot_id=1, maxlen=10000)


def make_sample(spread: float, ts: float | None = None) -> dict:
    return {
        "timestamp": ts or time.time(),
        "spread": str(spread),
        "mid_a": "100.0",
        "mid_b": str(100.0 - spread / 100),
    }


class TestSpreadCalculator:
    def test_add_sample(self, calc):
        sample = calc.add_sample(Decimal("100.0"), Decimal("99.5"))
        assert sample is not None
        assert sample.spread > 0
        assert calc.sample_count == 1

    def test_compute_percentiles_empty(self, calc):
        result = calc.compute_percentiles()
        assert result["p50"] is None
        assert result["count"] == 0

    def test_compute_percentiles_with_data(self, calc):
        for i in range(100):
            calc.add_sample(
                Decimal("100.0"),
                Decimal(f"{99.0 + i * 0.01}"),
            )
        result = calc.compute_percentiles("24h")
        assert result["p50"] is not None
        assert result["p75"] is not None
        assert result["count"] == 100

    @given(
        spreads=st.lists(
            st.tuples(
                st.decimals(min_value=90, max_value=110, places=4, allow_nan=False, allow_infinity=False),
                st.decimals(min_value=85, max_value=105, places=4, allow_nan=False, allow_infinity=False),
            ),
            min_size=10,
            max_size=200,
        )
    )
    @h_settings(max_examples=50, deadline=5000)
    def test_percentile_monotonicity(self, spreads):
        calc = SpreadCalculator(bot_id=1)
        for mid_a, mid_b in spreads:
            if mid_a > 0 and mid_b > 0:
                calc.add_sample(mid_a, mid_b)

        if calc.sample_count < 2:
            return

        result = calc.compute_percentiles("24h")
        if result["p50"] is not None:
            assert result["p50"] <= result["p75"]
            assert result["p75"] <= result["p80"]
            assert result["p80"] <= result["p95"]

    @given(
        spreads=st.lists(
            st.tuples(
                st.decimals(min_value=50, max_value=200, places=4, allow_nan=False, allow_infinity=False),
                st.decimals(min_value=50, max_value=200, places=4, allow_nan=False, allow_infinity=False),
            ),
            min_size=5,
            max_size=100,
        )
    )
    @h_settings(max_examples=50, deadline=5000)
    def test_no_nan_inf_in_calculations(self, spreads):
        calc = SpreadCalculator(bot_id=1)
        for mid_a, mid_b in spreads:
            if mid_a > 0 and mid_b > 0:
                calc.add_sample(mid_a, mid_b)

        if calc.sample_count < 2:
            return

        result = calc.compute_percentiles("24h")
        for key in ("p50", "p75", "p80", "p95", "mean", "stddev"):
            val = result[key]
            if val is not None:
                f = float(val)
                assert f == f, f"{key} is NaN"
                assert abs(f) != float("inf"), f"{key} is Inf"

    def test_edge_positive_when_spread_above_threshold(self, calc):
        for _ in range(50):
            calc.add_sample(Decimal("100.0"), Decimal("99.0"))

        edge = calc.compute_edge(
            current_spread=Decimal("200"),
            target_percentile=Decimal("50"),
            fees_roundtrip=Decimal("5"),
            slippage_margin=Decimal("2"),
        )
        assert edge > 0

    def test_timeframe_sliding_window_drops_old_samples(self, calc):
        old_ts = time.time() - 7200
        calc._samples.append(SpreadSample(
            timestamp=old_ts,
            spread=Decimal("10.0"),
            mid_a=Decimal("100.0"),
            mid_b=Decimal("99.9"),
        ))

        recent = calc.get_window_samples("1h")
        assert len(recent) == 0

        calc.add_sample(Decimal("100.0"), Decimal("99.5"))
        recent = calc.get_window_samples("1h")
        assert len(recent) == 1

    def test_cold_start_load_from_db(self, calc):
        rows = [
            {"timestamp": time.time() - i, "spread": "5.0", "mid_a": "100.0", "mid_b": "99.95"}
            for i in range(100)
        ]
        calc.load_from_db(rows)
        assert calc.sample_count == 100

    def test_batch_flush(self, calc):
        for _ in range(10):
            calc.add_sample(Decimal("100.0"), Decimal("99.5"))
        batch = calc.flush_batch()
        assert len(batch) == 10
        assert len(calc.flush_batch()) == 0
