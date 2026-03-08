from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class BotMetric(Base):
    __tablename__ = "bot_metrics"
    __table_args__ = (
        UniqueConstraint("bot_id", "date", name="uq_bot_metrics_bot_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    bot_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("bots.id"), nullable=False
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)
    total_trades: Mapped[int] = mapped_column(Integer, server_default="0")
    winning_trades: Mapped[int] = mapped_column(Integer, server_default="0")
    total_volume: Mapped[Decimal] = mapped_column(
        Numeric(20, 8), server_default="0"
    )
    total_fees_paid: Mapped[Decimal] = mapped_column(
        Numeric(20, 8), server_default="0"
    )
    total_funding: Mapped[Decimal] = mapped_column(
        Numeric(20, 8), server_default="0"
    )
    gross_pnl: Mapped[Decimal] = mapped_column(Numeric(20, 8), server_default="0")
    net_pnl: Mapped[Decimal] = mapped_column(Numeric(20, 8), server_default="0")
    avg_slippage: Mapped[Decimal] = mapped_column(
        Numeric(20, 8), server_default="0"
    )
    max_drawdown: Mapped[Decimal] = mapped_column(
        Numeric(20, 8), server_default="0"
    )
    one_leg_events: Mapped[int] = mapped_column(Integer, server_default="0")

    bot: Mapped["Bot"] = relationship("Bot", back_populates="metrics")  # noqa: F821


class SpreadSnapshot(Base):
    __tablename__ = "spread_snapshots"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    bot_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("bots.id"), nullable=False
    )
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    spread: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False)
    mid_a: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False)
    mid_b: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False)
    edge: Mapped[Decimal | None] = mapped_column(Numeric(20, 8), nullable=True)
    p50: Mapped[Decimal | None] = mapped_column(Numeric(20, 8), nullable=True)
    p75: Mapped[Decimal | None] = mapped_column(Numeric(20, 8), nullable=True)
    p80: Mapped[Decimal | None] = mapped_column(Numeric(20, 8), nullable=True)
    p95: Mapped[Decimal | None] = mapped_column(Numeric(20, 8), nullable=True)
