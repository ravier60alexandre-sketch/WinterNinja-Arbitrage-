import math
import time
from collections import deque
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

import numpy as np

from app.core.logging import get_logger

logger = get_logger("bots.spread_calculator")

TIMEFRAME_SECONDS = {
    "1h": 3600,
    "6h": 21600,
    "12h": 43200,
    "24h": 86400,
    "7d": 604800,
}

_QUANT_8 = Decimal("0.00000001")


@dataclass(slots=True)
class SpreadSample:
    """Single spread observation with exchange mid-prices."""

    timestamp: float
    spread: Decimal
    mid_a: Decimal
    mid_b: Decimal


class SpreadCalculator:
    """Maintains a rolling window of spread samples and computes
    percentile-based entry thresholds.

    All prices and amounts use ``decimal.Decimal`` with ``ROUND_HALF_UP``.
    Percentile calculations use numpy but never return NaN or Inf.
    """

    __slots__ = ("bot_id", "_samples", "_maxlen", "_batch_buffer", "_last_flush")

    def __init__(self, bot_id: int, maxlen: int = 10_000) -> None:
        self.bot_id = bot_id
        self._maxlen = maxlen
        self._samples: deque[SpreadSample] = deque(maxlen=maxlen)
        self._batch_buffer: list[SpreadSample] = []
        self._last_flush: float = time.monotonic()

    # ------------------------------------------------------------------
    # Sample ingestion
    # ------------------------------------------------------------------

    def add_sample(
        self,
        mid_a: Decimal,
        mid_b: Decimal,
        spread: Decimal | None = None,
        timestamp: float | None = None,
    ) -> SpreadSample:
        """Record a new spread observation.

        If *spread* is not provided, it is computed as
        ``(mid_a - mid_b) / mid_b * 10000`` (basis points).
        *mid_a* / *mid_b* must be positive.
        """
        if mid_a <= 0 or mid_b <= 0:
            raise ValueError("Mid prices must be positive")

        if spread is None:
            spread = ((mid_a - mid_b) / mid_b * Decimal("10000")).quantize(
                _QUANT_8, rounding=ROUND_HALF_UP
            )
        else:
            spread = spread.quantize(_QUANT_8, rounding=ROUND_HALF_UP)

        ts = timestamp if timestamp is not None else time.time()

        sample = SpreadSample(
            timestamp=ts,
            spread=spread,
            mid_a=mid_a,
            mid_b=mid_b,
        )
        self._samples.append(sample)
        self._batch_buffer.append(sample)
        return sample

    # ------------------------------------------------------------------
    # Warm startup from DB
    # ------------------------------------------------------------------

    def load_from_snapshots(self, snapshots: list[dict[str, Any]]) -> None:
        """Populate the ring-buffer from persisted snapshot rows.

        Each dict must contain keys: timestamp, spread, mid_a, mid_b.
        """
        for row in snapshots:
            sample = SpreadSample(
                timestamp=float(row["timestamp"]),
                spread=Decimal(str(row["spread"])),
                mid_a=Decimal(str(row["mid_a"])),
                mid_b=Decimal(str(row["mid_b"])),
            )
            self._samples.append(sample)
        logger.info(
            "spreads_loaded_from_snapshots",
            bot_id=self.bot_id,
            count=len(snapshots),
        )

    # ------------------------------------------------------------------
    # Sliding-window helpers
    # ------------------------------------------------------------------

    def get_samples_in_window(self, hours: float) -> list[SpreadSample]:
        """Return samples within the last *hours* hours."""
        cutoff = time.time() - (hours * 3600.0)
        return [s for s in self._samples if s.timestamp >= cutoff]

    def _get_window_samples(self, timeframe: str) -> list[SpreadSample]:
        """Return samples for a named timeframe key (1h / 6h / ...)."""
        seconds = TIMEFRAME_SECONDS.get(timeframe)
        if seconds is None:
            return list(self._samples)
        cutoff = time.time() - seconds
        return [s for s in self._samples if s.timestamp >= cutoff]

    # ------------------------------------------------------------------
    # Percentile computation
    # ------------------------------------------------------------------

    def compute_percentiles(self, timeframe: str = "24h") -> dict[str, Any]:
        """Return P50 / P75 / P80 / P95 and basic stats for *timeframe*.

        Returns ``None`` values when fewer than 2 samples are available.
        Never returns NaN or Inf.
        """
        samples = self._get_window_samples(timeframe)
        count = len(samples)

        if count < 2:
            return {
                "p50": None,
                "p75": None,
                "p80": None,
                "p95": None,
                "count": count,
                "mean": None,
                "stddev": None,
            }

        spreads = np.array([float(s.spread) for s in samples], dtype=np.float64)

        p50_f, p75_f, p80_f, p95_f = np.percentile(spreads, [50, 75, 80, 95])
        mean_f = float(np.mean(spreads))
        std_f = float(np.std(spreads))

        def _safe_decimal(val: float) -> Decimal:
            if math.isnan(val) or math.isinf(val):
                return Decimal("0")
            return Decimal(str(round(val, 8)))

        return {
            "p50": _safe_decimal(p50_f),
            "p75": _safe_decimal(p75_f),
            "p80": _safe_decimal(p80_f),
            "p95": _safe_decimal(p95_f),
            "count": count,
            "mean": _safe_decimal(mean_f),
            "stddev": _safe_decimal(std_f),
        }

    # ------------------------------------------------------------------
    # Edge calculation
    # ------------------------------------------------------------------

    def compute_edge(
        self,
        current_spread: Decimal,
        target_percentile: Decimal,
        fees_roundtrip: Decimal,
        slippage_margin: Decimal,
    ) -> Decimal:
        """Compute the excess edge over costs.

        ``edge = current_spread - (target_percentile + fees_roundtrip + slippage_margin)``
        """
        edge = current_spread - (target_percentile + fees_roundtrip + slippage_margin)
        return edge.quantize(_QUANT_8, rounding=ROUND_HALF_UP)

    # ------------------------------------------------------------------
    # Batch persistence
    # ------------------------------------------------------------------

    def flush(self) -> list[SpreadSample]:
        """Return accumulated samples and clear the batch buffer."""
        batch = list(self._batch_buffer)
        self._batch_buffer.clear()
        self._last_flush = time.monotonic()
        return batch

    # Alias for backwards compatibility
    flush_batch = flush

    def should_flush(self, interval_seconds: float = 5.0) -> bool:
        """Return True when enough time has elapsed and there are buffered samples."""
        return (
            time.monotonic() - self._last_flush >= interval_seconds
            and len(self._batch_buffer) > 0
        )

    def to_snapshot_data(self) -> list[dict[str, Any]]:
        """Serialize all samples for DB persistence."""
        return [
            {
                "timestamp": s.timestamp,
                "spread": str(s.spread),
                "mid_a": str(s.mid_a),
                "mid_b": str(s.mid_b),
            }
            for s in self._samples
        ]

    # ------------------------------------------------------------------
    # Convenience properties
    # ------------------------------------------------------------------

    @property
    def latest(self) -> SpreadSample | None:
        return self._samples[-1] if self._samples else None

    @property
    def sample_count(self) -> int:
        return len(self._samples)
