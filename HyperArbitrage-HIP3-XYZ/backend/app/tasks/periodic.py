import asyncio
from datetime import UTC, datetime, timedelta, date

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.tasks.celery_app import celery_app
from app.core.database import async_session_factory
from app.core.logging import get_logger
from app.models.trade import SpreadSnapshot
from app.models.deployer import DeployerStats
from app.services.metrics_service import MetricsService

logger = get_logger("tasks.periodic")


def run_async(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery_app.task(name="app.tasks.periodic.compute_all_metrics")
def compute_all_metrics():
    async def _run():
        async with async_session_factory() as session:
            from app.models.bot import Bot
            from sqlalchemy import select

            result = await session.execute(select(Bot.id))
            bot_ids = [row[0] for row in result.all()]

            svc = MetricsService(session)
            for bot_id in bot_ids:
                try:
                    await svc.compute_and_save_metrics(bot_id)
                except Exception as exc:
                    logger.error("metrics_compute_failed", bot_id=bot_id, error=str(exc))

            await session.commit()
            logger.info("all_metrics_computed", bot_count=len(bot_ids))

    run_async(_run())


@celery_app.task(name="app.tasks.periodic.cleanup_old_snapshots")
def cleanup_old_snapshots(retention_days: int = 7):
    async def _run():
        cutoff = datetime.now(UTC) - timedelta(days=retention_days)
        async with async_session_factory() as session:
            result = await session.execute(
                delete(SpreadSnapshot).where(SpreadSnapshot.timestamp < cutoff)
            )
            await session.commit()
            logger.info("snapshots_cleaned", deleted=result.rowcount, retention_days=retention_days)

    run_async(_run())


@celery_app.task(name="app.tasks.periodic.update_deployer_stats")
def update_deployer_stats():
    async def _run():
        import httpx
        from app.config import settings
        from decimal import Decimal

        deployers = [settings.PAIR_XYZ, settings.PAIR_CASH, settings.PAIR_KM, settings.PAIR_FLX]

        async with async_session_factory() as session:
            try:
                async with httpx.AsyncClient(timeout=10) as client:
                    response = await client.post(
                        f"{settings.HL_HTTP_URL}/info",
                        json={"type": "meta"},
                    )
                    meta = response.json()

                universe = {a["name"]: a for a in meta.get("universe", [])}

                for deployer in deployers:
                    asset_info = universe.get(deployer, {})
                    stat = DeployerStats(
                        deployer=deployer,
                        funding_rate=Decimal(str(asset_info.get("funding", "0"))) if asset_info else None,
                        mark_price=Decimal(str(asset_info.get("markPx", "0"))) if asset_info else None,
                    )
                    session.add(stat)

                await session.commit()
                logger.info("deployer_stats_updated", count=len(deployers))

            except Exception as exc:
                logger.warning("deployer_stats_update_failed", error=str(exc))

    run_async(_run())
