from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel


class TradeResponse(BaseModel):
    id: int
    bot_id: int
    entry_time: datetime
    exit_time: datetime | None
    pair_a: str
    pair_b: str
    size: Decimal
    entry_price_a: Decimal
    entry_price_b: Decimal
    exit_price_a: Decimal | None
    exit_price_b: Decimal | None
    gross_pnl: Decimal | None
    fees_paid: Decimal | None
    funding_paid: Decimal
    net_pnl: Decimal | None
    slippage_a: Decimal | None
    slippage_b: Decimal | None
    entry_spread: Decimal | None
    exit_spread: Decimal | None
    edge_at_entry: Decimal | None
    status: str
    close_reason: str | None

    model_config = {"from_attributes": True}


class TradeListResponse(BaseModel):
    trades: list[TradeResponse]
    total: int
    page: int
    page_size: int


class SpreadSnapshotResponse(BaseModel):
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
