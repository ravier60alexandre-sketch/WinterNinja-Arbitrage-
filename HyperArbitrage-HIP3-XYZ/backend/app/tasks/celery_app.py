from celery import Celery

from app.config import settings

celery_app = Celery(
    "hyperarbitrage",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=300,
    worker_max_tasks_per_child=1000,
    beat_schedule={
        "compute-daily-metrics": {
            "task": "app.tasks.periodic.compute_all_metrics",
            "schedule": 300.0,
        },
        "cleanup-old-snapshots": {
            "task": "app.tasks.periodic.cleanup_old_snapshots",
            "schedule": 86400.0,
        },
        "update-deployer-stats": {
            "task": "app.tasks.periodic.update_deployer_stats",
            "schedule": 60.0,
        },
    },
)
