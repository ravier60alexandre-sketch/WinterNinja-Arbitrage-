from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.metrics import BotMetrics
from app.models.trade import Trade

logger = get_logger("services.metrics")


class MetricsService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_daily_metrics(self, bot_id: int, day: date | None = None) -> BotMetrics | None:
        target_date = day or date.today()
        result = await self._session.execute(
            select(BotMetrics).where(
                and_(BotMetrics.bot_id == bot_id, BotMetrics.date == target_date)
            )
        )
        return result.scalar_one_or_none()

    async def compute_and_save_metrics(self, bot_id: int, day: date | None = None) -> BotMetrics:
        target_date = day or date.today()

        result = await self._session.execute(
            select(Trade).where(
                and_(
                    Trade.bot_id == bot_id,
                    Trade.status == "closed",
                    func.date(Trade.exit_time) == target_date,
                )
            )
        )
        trades = list(result.scalars().all())

        total_trades = len(trades)
        winning_trades = sum(1 for t in trades if t.net_pnl and t.net_pnl > 0)
        total_volume = sum(t.size for t in trades) if trades else Decimal("0")
        total_fees = sum(t.fees_paid or Decimal("0") for t in trades)
        total_funding = sum(t.funding_paid or Decimal("0") for t in trades)
        gross_pnl = sum(t.gross_pnl or Decimal("0") for t in trades)
        net_pnl = sum(t.net_pnl or Decimal("0") for t in trades)

        slippages = [t.slippage_a or Decimal("0") for t in trades] + [t.slippage_b or Decimal("0") for t in trades]
        avg_slippage = (sum(slippages) / len(slippages)) if slippages else Decimal("0")

        cumulative = Decimal("0")
        max_dd = Decimal("0")
        peak = Decimal("0")
        for t in sorted(trades, key=lambda x: x.exit_time or datetime.min.replace(tzinfo=UTC)):
            cumulative += t.net_pnl or Decimal("0")
            if cumulative > peak:
                peak = cumulative
            dd = peak - cumulative
            if dd > max_dd:
                max_dd = dd

        existing = await self.get_daily_metrics(bot_id, target_date)
        if existing:
            existing.total_trades = total_trades
            existing.winning_trades = winning_trades
            existing.total_volume = total_volume
            existing.total_fees_paid = total_fees
            existing.total_funding = total_funding
            existing.gross_pnl = gross_pnl
            existing.net_pnl = net_pnl
            existing.avg_slippage = avg_slippage
            existing.max_drawdown = max_dd
            metrics = existing
        else:
            metrics = BotMetrics(
                bot_id=bot_id,
                date=target_date,
                total_trades=total_trades,
                winning_trades=winning_trades,
                total_volume=total_volume,
                total_fees_paid=total_fees,
                total_funding=total_funding,
                gross_pnl=gross_pnl,
                net_pnl=net_pnl,
                avg_slippage=avg_slippage,
                max_drawdown=max_dd,
            )
            self._session.add(metrics)

        await self._session.flush()
        return metrics

    async def get_aggregated(self) -> dict:
        result = await self._session.execute(
            select(
                func.sum(BotMetrics.net_pnl).label("total_pnl"),
                func.sum(BotMetrics.total_fees_paid).label("total_fees"),
                func.sum(BotMetrics.total_volume).label("total_volume"),
                func.sum(BotMetrics.total_trades).label("total_trades"),
                func.sum(BotMetrics.winning_trades).label("winning_trades"),
                func.sum(BotMetrics.one_leg_events).label("total_one_leg"),
                func.avg(BotMetrics.avg_slippage).label("avg_slippage"),
                func.max(BotMetrics.max_drawdown).label("max_drawdown"),
            )
        )
        row = result.one()
        total_trades = row.total_trades or 0
        winning = row.winning_trades or 0
        return {
            "total_pnl": row.total_pnl or Decimal("0"),
            "total_fees": row.total_fees or Decimal("0"),
            "total_volume": row.total_volume or Decimal("0"),
            "total_trades": total_trades,
            "winning_trades": winning,
            "win_rate": (winning / total_trades * 100) if total_trades > 0 else 0.0,
            "total_one_leg_events": row.total_one_leg or 0,
            "avg_slippage": row.avg_slippage or Decimal("0"),
            "max_drawdown": row.max_drawdown or Decimal("0"),
        }
