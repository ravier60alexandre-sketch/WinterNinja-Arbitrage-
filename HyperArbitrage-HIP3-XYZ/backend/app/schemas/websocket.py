from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field


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
    status: str


class BotStateChangeData(BaseModel):
    old_state: str
    new_state: str
    reason: str | None


class MetricsUpdateData(BaseModel):
    net_pnl: Decimal
    total_trades: int
    winning_trades: int
    win_rate: float
    one_leg_events: int
    max_drawdown: Decimal


class LogEventData(BaseModel):
    level: str
    message: str
    context: dict | None = None


class FundingUpdateData(BaseModel):
    funding_rate_a: Decimal
    funding_rate_b: Decimal
    net_funding: Decimal
    blocked: bool


class SpreadUpdateEvent(BaseModel):
    type: Literal["spread_update"] = "spread_update"
    bot_id: int
    timestamp: datetime
    data: SpreadUpdateData


class TradeExecutedEvent(BaseModel):
    type: Literal["trade_executed"] = "trade_executed"
    bot_id: int
    timestamp: datetime
    data: TradeExecutedData


class BotStateChangeEvent(BaseModel):
    type: Literal["bot_state_change"] = "bot_state_change"
    bot_id: int
    timestamp: datetime
    data: BotStateChangeData


class MetricsUpdateEvent(BaseModel):
    type: Literal["metrics_update"] = "metrics_update"
    bot_id: int
    timestamp: datetime
    data: MetricsUpdateData


class LogEvent(BaseModel):
    type: Literal["log_event"] = "log_event"
    bot_id: int
    timestamp: datetime
    data: LogEventData


class FundingUpdateEvent(BaseModel):
    type: Literal["funding_update"] = "funding_update"
    bot_id: int
    timestamp: datetime
    data: FundingUpdateData


WSEvent = Annotated[
    Union[
        SpreadUpdateEvent,
        TradeExecutedEvent,
        BotStateChangeEvent,
        MetricsUpdateEvent,
        LogEvent,
        FundingUpdateEvent,
    ],
    Field(discriminator="type"),
]
