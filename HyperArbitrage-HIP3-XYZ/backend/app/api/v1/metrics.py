from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.schemas.metrics import AggregatedMetrics, BotMetricsResponse
from app.services.metrics_service import MetricsService

router = APIRouter(prefix="/metrics", tags=["metrics"])


@router.get("/{bot_id}", response_model=BotMetricsResponse | None)
async def get_bot_metrics(
    bot_id: int,
    day: date | None = Query(None),
    session: AsyncSession = Depends(get_session),
):
    svc = MetricsService(session)
    metrics = await svc.get_daily_metrics(bot_id, day)
    if metrics is None:
        return None

    total = metrics.total_trades or 0
    winning = metrics.winning_trades or 0
    win_rate = (winning / total * 100) if total > 0 else 0.0

    resp = BotMetricsResponse.model_validate(metrics)
    resp.win_rate = win_rate
    return resp


@router.get("/", response_model=AggregatedMetrics)
async def get_aggregated_metrics(session: AsyncSession = Depends(get_session)):
    svc = MetricsService(session)
    data = await svc.get_aggregated()
    return AggregatedMetrics(**data)
