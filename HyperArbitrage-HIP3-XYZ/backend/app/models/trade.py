from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Trade(Base):
    __tablename__ = "trades"
    __table_args__ = (
        Index("ix_trades_bot_entry", "bot_id", text("entry_time DESC")),
        Index(
            "ix_trades_bot_open",
            "bot_id",
            "status",
            postgresql_where=text("status = 'open'"),
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    bot_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("bots.id"), nullable=False
    )
    entry_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    exit_time: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    pair_a: Mapped[str] = mapped_column(String(20), nullable=False)
    pair_b: Mapped[str] = mapped_column(String(20), nullable=False)
    size: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False)
    entry_price_a: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False)
    entry_price_b: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False)
    exit_price_a: Mapped[Decimal | None] = mapped_column(
        Numeric(20, 8), nullable=True
    )
    exit_price_b: Mapped[Decimal | None] = mapped_column(
        Numeric(20, 8), nullable=True
    )
    gross_pnl: Mapped[Decimal | None] = mapped_column(Numeric(20, 8), nullable=True)
    fees_paid: Mapped[Decimal | None] = mapped_column(Numeric(20, 8), nullable=True)
    funding_paid: Mapped[Decimal] = mapped_column(
        Numeric(20, 8), server_default="0"
    )
    net_pnl: Mapped[Decimal | None] = mapped_column(Numeric(20, 8), nullable=True)
    slippage_a: Mapped[Decimal | None] = mapped_column(Numeric(20, 8), nullable=True)
    slippage_b: Mapped[Decimal | None] = mapped_column(Numeric(20, 8), nullable=True)
    entry_spread: Mapped[Decimal | None] = mapped_column(
        Numeric(20, 8), nullable=True
    )
    exit_spread: Mapped[Decimal | None] = mapped_column(
        Numeric(20, 8), nullable=True
    )
    edge_at_entry: Mapped[Decimal | None] = mapped_column(
        Numeric(20, 8), nullable=True
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="open"
    )
    close_reason: Mapped[str | None] = mapped_column(String(50), nullable=True)

    bot: Mapped["Bot"] = relationship("Bot", back_populates="trades")  # noqa: F821
