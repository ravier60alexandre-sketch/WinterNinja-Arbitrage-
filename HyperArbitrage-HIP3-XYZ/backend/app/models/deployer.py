from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Index, Integer, Numeric, String, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class DeployerStat(Base):
    __tablename__ = "deployer_stats"
    __table_args__ = (
        Index("ix_deployer_stats_deployer_ts", "deployer", text("timestamp DESC")),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    deployer: Mapped[str] = mapped_column(String(10), nullable=False)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    total_volume: Mapped[Decimal | None] = mapped_column(
        Numeric(20, 8), nullable=True
    )
    open_interest: Mapped[Decimal | None] = mapped_column(
        Numeric(20, 8), nullable=True
    )
    funding_rate: Mapped[Decimal | None] = mapped_column(
        Numeric(20, 8), nullable=True
    )
    mark_price: Mapped[Decimal | None] = mapped_column(
        Numeric(20, 8), nullable=True
    )
