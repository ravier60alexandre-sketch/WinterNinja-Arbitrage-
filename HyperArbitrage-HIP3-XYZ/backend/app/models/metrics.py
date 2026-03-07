from datetime import date
from decimal import Decimal

from sqlalchemy import Date, ForeignKey, Integer, Numeric, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class BotMetrics(Base):
    __tablename__ = "bot_metrics"
    __table_args__ = (
        UniqueConstraint("bot_id", "date", name="uq_bot_metrics_bot_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    bot_id: Mapped[int] = mapped_column(Integer, ForeignKey("bots.id"), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    total_trades: Mapped[int] = mapped_column(Integer, server_default="0")
    winning_trades: Mapped[int] = mapped_column(Integer, server_default="0")
    total_volume: Mapped[Decimal] = mapped_column(Numeric(20, 8), server_default="0")
    total_fees_paid: Mapped[Decimal] = mapped_column(Numeric(20, 8), server_default="0")
    total_funding: Mapped[Decimal] = mapped_column(Numeric(20, 8), server_default="0")
    gross_pnl: Mapped[Decimal] = mapped_column(Numeric(20, 8), server_default="0")
    net_pnl: Mapped[Decimal] = mapped_column(Numeric(20, 8), server_default="0")
    avg_slippage: Mapped[Decimal] = mapped_column(Numeric(20, 8), server_default="0")
    max_drawdown: Mapped[Decimal] = mapped_column(Numeric(20, 8), server_default="0")
    one_leg_events: Mapped[int] = mapped_column(Integer, server_default="0")
