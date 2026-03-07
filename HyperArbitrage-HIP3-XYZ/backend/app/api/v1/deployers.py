from fastapi import APIRouter, Depends
from sqlalchemy import select, distinct
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.models.deployer import DeployerStats
from app.schemas.metrics import DeployerStatsResponse

router = APIRouter(prefix="/deployers", tags=["deployers"])


@router.get("/", response_model=list[DeployerStatsResponse])
async def get_deployer_stats(session: AsyncSession = Depends(get_session)):
    deployers_result = await session.execute(select(distinct(DeployerStats.deployer)))
    deployer_names = [row[0] for row in deployers_result.all()]

    results = []
    for name in deployer_names:
        latest = await session.execute(
            select(DeployerStats)
            .where(DeployerStats.deployer == name)
            .order_by(DeployerStats.timestamp.desc())
            .limit(1)
        )
        stat = latest.scalar_one_or_none()
        if stat:
            results.append(DeployerStatsResponse.model_validate(stat))

    return results


@router.get("/{deployer}", response_model=list[DeployerStatsResponse])
async def get_deployer_history(
    deployer: str,
    limit: int = 100,
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(DeployerStats)
        .where(DeployerStats.deployer == deployer)
        .order_by(DeployerStats.timestamp.desc())
        .limit(limit)
    )
    stats = result.scalars().all()
    return [DeployerStatsResponse.model_validate(s) for s in reversed(stats)]
