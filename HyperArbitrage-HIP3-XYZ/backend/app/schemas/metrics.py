from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel


class MetricsResponse(BaseModel):
    id: int
    bot_id: int
    date: date
    total_trades: int
    winning_trades: int
    total_volume: Decimal
    total_fees_paid: Decimal
    total_funding: Decimal
    gross_pnl: Decimal
    net_pnl: Decimal
    avg_slippage: Decimal
    max_drawdown: Decimal
    one_leg_events: int

    model_config = {"from_attributes": True}


class AggregatedMetrics(BaseModel):
    total_pnl: Decimal
    total_fees: Decimal
    total_volume: Decimal
    total_trades: int
    winning_trades: int
    win_rate: float
    total_one_leg_events: int
    avg_slippage: Decimal
    max_drawdown: Decimal


class DeployerStatsResponse(BaseModel):
    id: int
    deployer: str
    timestamp: datetime
    total_volume: Decimal | None
    open_interest: Decimal | None
    funding_rate: Decimal | None
    mark_price: Decimal | None

    model_config = {"from_attributes": True}


class SpreadSnapshotResponse(BaseModel):
    id: int
    bot_id: int
    timestamp: datetime
    spread: Decimal
    mid_a: Decimal
    mid_b: Decimal
    edge: Decimal | None
    p50: Decimal | None
    p75: Decimal | None
    p80: Decimal | None
    p95: Decimal | None

    model_config = {"from_attributes": True}
