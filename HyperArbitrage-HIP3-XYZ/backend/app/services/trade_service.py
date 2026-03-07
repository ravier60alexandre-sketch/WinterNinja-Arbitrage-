from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.trade import Trade, SpreadSnapshot

logger = get_logger("services.trade")


class TradeService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create_trade(
        self,
        bot_id: int,
        pair_a: str,
        pair_b: str,
        size: Decimal,
        entry_price_a: Decimal,
        entry_price_b: Decimal,
        entry_spread: Decimal,
        edge_at_entry: Decimal,
    ) -> Trade:
        trade = Trade(
            bot_id=bot_id,
            entry_time=datetime.now(UTC),
            pair_a=pair_a,
            pair_b=pair_b,
            size=size,
            entry_price_a=entry_price_a,
            entry_price_b=entry_price_b,
            entry_spread=entry_spread,
            edge_at_entry=edge_at_entry,
            status="open",
        )
        self._session.add(trade)
        await self._session.flush()
        logger.info("trade_created", bot_id=bot_id, trade_id=trade.id)
        return trade

    async def close_trade(
        self,
        trade_id: int,
        exit_price_a: Decimal,
        exit_price_b: Decimal,
        gross_pnl: Decimal,
        fees_paid: Decimal,
        funding_paid: Decimal,
        net_pnl: Decimal,
        slippage_a: Decimal,
        slippage_b: Decimal,
        exit_spread: Decimal,
        close_reason: str,
    ) -> Trade:
        result = await self._session.execute(select(Trade).where(Trade.id == trade_id))
        trade = result.scalar_one()

        trade.exit_time = datetime.now(UTC)
        trade.exit_price_a = exit_price_a
        trade.exit_price_b = exit_price_b
        trade.gross_pnl = gross_pnl
        trade.fees_paid = fees_paid
        trade.funding_paid = funding_paid
        trade.net_pnl = net_pnl
        trade.slippage_a = slippage_a
        trade.slippage_b = slippage_b
        trade.exit_spread = exit_spread
        trade.status = "closed"
        trade.close_reason = close_reason

        await self._session.flush()
        logger.info("trade_closed", trade_id=trade_id, close_reason=close_reason, net_pnl=str(net_pnl))
        return trade

    async def get_open_trades(self, bot_id: int) -> list[Trade]:
        result = await self._session.execute(
            select(Trade).where(and_(Trade.bot_id == bot_id, Trade.status == "open"))
        )
        return list(result.scalars().all())

    async def get_trades(
        self, bot_id: int, page: int = 1, page_size: int = 50
    ) -> tuple[list[Trade], int]:
        count_result = await self._session.execute(
            select(func.count()).select_from(Trade).where(Trade.bot_id == bot_id)
        )
        total = count_result.scalar()

        result = await self._session.execute(
            select(Trade)
            .where(Trade.bot_id == bot_id)
            .order_by(Trade.entry_time.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return list(result.scalars().all()), total

    async def bulk_insert_snapshots(self, snapshots: list[dict]) -> None:
        objects = [SpreadSnapshot(**s) for s in snapshots]
        self._session.add_all(objects)
        await self._session.flush()

    async def get_recent_snapshots(
        self, bot_id: int, limit: int = 10000
    ) -> list[SpreadSnapshot]:
        result = await self._session.execute(
            select(SpreadSnapshot)
            .where(SpreadSnapshot.bot_id == bot_id)
            .order_by(SpreadSnapshot.timestamp.desc())
            .limit(limit)
        )
        return list(reversed(result.scalars().all()))
