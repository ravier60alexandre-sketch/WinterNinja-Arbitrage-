from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel


class SpreadUpdateData(BaseModel):
    spread: Decimal
    mid_a: Decimal
    mid_b: Decimal
    edge: Decimal | None
    p50: Decimal | None
    p75: Decimal | None
    p80: Decimal | None
    p95: Decimal | None


class TradeExecutedData(BaseModel):
    trade_id: int
    pair_a: str
    pair_b: str
    size: Decimal
    entry_price_a: Decimal
    entry_price_b: Decimal
    entry_spread: Decimal
    edge_at_entry: Decimal


class BotStateChangeData(BaseModel):
    old_state: str
    new_state: str
    reason: str | None


class MetricsUpdateData(BaseModel):
    net_pnl: Decimal
    total_trades: int
    win_rate: float
    one_leg_events: int


class LogEventData(BaseModel):
    level: str
    logger: str
    event: str
    details: dict | None = None


class FundingUpdateData(BaseModel):
    funding_rate_a: Decimal
    funding_rate_b: Decimal
    net_funding: Decimal
    blocked: bool


class WSEvent(BaseModel):
    type: Literal[
        "spread_update",
        "trade_executed",
        "bot_state_change",
        "metrics_update",
        "log_event",
        "funding_update",
    ]
    bot_id: int
    timestamp: datetime
    data: (
        SpreadUpdateData
        | TradeExecutedData
        | BotStateChangeData
        | MetricsUpdateData
        | LogEventData
        | FundingUpdateData
    )
