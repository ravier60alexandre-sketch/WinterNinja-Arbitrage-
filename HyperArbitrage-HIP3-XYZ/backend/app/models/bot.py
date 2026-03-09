from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Bot(Base):
    __tablename__ = "bots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    pair_a: Mapped[str] = mapped_column(String(20), nullable=False)
    pair_b: Mapped[str] = mapped_column(String(20), nullable=False)
    direction: Mapped[str] = mapped_column(String(20), nullable=False)
    state: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="IDLE"
    )
    account_address: Mapped[str] = mapped_column(String(66), nullable=False)
    api_key_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    sub_account_address: Mapped[str | None] = mapped_column(
        String(66), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    configs: Mapped[BotConfig | None] = relationship(
        "BotConfig",
        back_populates="bot",
        uselist=False,
        cascade="all, delete-orphan",
    )
    trades: Mapped[list[Trade]] = relationship(
        "Trade", back_populates="bot", lazy="selectin"
    )
    metrics: Mapped[list[BotMetric]] = relationship(
        "BotMetric", back_populates="bot", lazy="selectin"
    )


class BotConfig(Base):
    __tablename__ = "bot_configs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    bot_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("bots.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    percentile: Mapped[float] = mapped_column(
        Float, nullable=False, server_default="0.75"
    )
    timeframe_hours: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="6"
    )
    profit_margin_bps: Mapped[float] = mapped_column(
        Float, nullable=False, server_default="5"
    )
    max_slippage_ticks: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="2"
    )
    max_position_size: Mapped[float | None] = mapped_column(
        Numeric(20, 8), nullable=True
    )
    funding_rate_threshold: Mapped[float] = mapped_column(
        Float, nullable=False, server_default="0.5"
    )
    one_leg_protection: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="true"
    )
    exit_mode: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="on_profit"
    )
    min_edge_bps: Mapped[float] = mapped_column(
        Float, nullable=False, server_default="2"
    )
    disabled_pairs: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    bot: Mapped[Bot] = relationship("Bot", back_populates="configs")
