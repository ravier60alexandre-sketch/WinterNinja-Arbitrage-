from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class BotCreate(BaseModel):
    name: str = Field(max_length=50)
    pair_a: str = Field(max_length=20)
    pair_b: str = Field(max_length=20)
    direction: Literal["long_a_short_b", "short_a_long_b"]
    account_address: str = Field(max_length=66)
    api_key: str
    sub_account_address: str | None = None


class BotConfigUpdate(BaseModel):
    percentile: float | None = Field(default=None, ge=0.5, le=0.95)
    timeframe_hours: int | None = Field(default=None, ge=1)
    profit_margin_bps: float | None = Field(default=None, ge=0)
    max_slippage_ticks: int | None = Field(default=None, ge=1, le=10)
    max_position_size: float | None = None
    funding_rate_threshold: float | None = Field(default=None, ge=0)
    one_leg_protection: bool | None = None
    exit_mode: Literal["on_profit", "on_reverse"] | None = None
    min_edge_bps: float | None = Field(default=None, ge=0)


class BotConfigResponse(BaseModel):
    id: int
    bot_id: int
    percentile: float
    timeframe_hours: int
    profit_margin_bps: float
    max_slippage_ticks: int
    max_position_size: float | None
    funding_rate_threshold: float
    one_leg_protection: bool
    exit_mode: str
    min_edge_bps: float
    updated_at: datetime

    model_config = {"from_attributes": True}


class BotResponse(BaseModel):
    id: int
    name: str
    pair_a: str
    pair_b: str
    direction: str
    state: str
    account_address: str
    sub_account_address: str | None
    created_at: datetime
    updated_at: datetime
    config: BotConfigResponse | None = Field(default=None, validation_alias="configs")

    model_config = {"from_attributes": True}


class BotActionRequest(BaseModel):
    action: Literal["start", "stop", "liquidate", "reset"]


class BotListResponse(BaseModel):
    bots: list[BotResponse]
    total: int
