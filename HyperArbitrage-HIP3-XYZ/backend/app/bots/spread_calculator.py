import time
from collections import deque
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

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


@dataclass(slots=True)
class SpreadSample:
    timestamp: float
    spread: Decimal
    mid_a: Decimal
    mid_b: Decimal


class SpreadCalculator:
    __slots__ = ("bot_id", "_samples", "_maxlen", "_batch_buffer", "_last_flush")

    def __init__(self, bot_id: int, maxlen: int = 10_000) -> None:
        self.bot_id = bot_id
        self._maxlen = maxlen
        self._samples: deque[SpreadSample] = deque(maxlen=maxlen)
        self._batch_buffer: list[SpreadSample] = []
        self._last_flush = time.monotonic()

    def add_sample(self, mid_a: Decimal, mid_b: Decimal) -> SpreadSample:
        if mid_a <= 0 or mid_b <= 0:
            raise ValueError("Mid prices must be positive")
        spread = ((mid_a - mid_b) / mid_a * Decimal("10000")).quantize(
            Decimal("0.00000001"), rounding=ROUND_HALF_UP
        )
        sample = SpreadSample(
            timestamp=time.time(),
            spread=spread,
            mid_a=mid_a,
            mid_b=mid_b,
        )
        self._samples.append(sample)
        self._batch_buffer.append(sample)
        return sample

    def load_from_db(self, rows: list[dict]) -> None:
        for row in rows:
            sample = SpreadSample(
                timestamp=row["timestamp"],
                spread=Decimal(str(row["spread"])),
                mid_a=Decimal(str(row["mid_a"])),
                mid_b=Decimal(str(row["mid_b"])),
            )
            self._samples.append(sample)
        logger.info("spreads_loaded_from_db", bot_id=self.bot_id, count=len(rows))

    def get_window_samples(self, timeframe: str) -> list[SpreadSample]:
        seconds = TIMEFRAME_SECONDS.get(timeframe)
        if seconds is None:
            return list(self._samples)
        cutoff = time.time() - seconds
        return [s for s in self._samples if s.timestamp >= cutoff]

    def compute_percentiles(self, timeframe: str = "24h") -> dict:
        samples = self.get_window_samples(timeframe)
        if len(samples) < 2:
            return {"p50": None, "p75": None, "p80": None, "p95": None, "count": len(samples)}

        spreads = np.array([float(s.spread) for s in samples])
        p50, p75, p80, p95 = np.percentile(spreads, [50, 75, 80, 95])

        return {
            "p50": Decimal(str(round(p50, 8))),
            "p75": Decimal(str(round(p75, 8))),
            "p80": Decimal(str(round(p80, 8))),
            "p95": Decimal(str(round(p95, 8))),
            "count": len(samples),
            "mean": Decimal(str(round(float(np.mean(spreads)), 8))),
            "stddev": Decimal(str(round(float(np.std(spreads)), 8))),
        }

    def compute_edge(
        self,
        current_spread: Decimal,
        target_percentile: Decimal,
        fees_roundtrip: Decimal,
        slippage_margin: Decimal,
    ) -> Decimal:
        edge = current_spread - (target_percentile + fees_roundtrip + slippage_margin)
        return edge.quantize(Decimal("0.00000001"), rounding=ROUND_HALF_UP)

    def flush_batch(self) -> list[SpreadSample]:
        batch = list(self._batch_buffer)
        self._batch_buffer.clear()
        self._last_flush = time.monotonic()
        return batch

    def should_flush(self) -> bool:
        return (time.monotonic() - self._last_flush) >= 5.0 and len(self._batch_buffer) > 0

    @property
    def latest(self) -> SpreadSample | None:
        return self._samples[-1] if self._samples else None

    @property
    def sample_count(self) -> int:
        return len(self._samples)
