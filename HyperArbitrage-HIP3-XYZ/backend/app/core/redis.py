import redis.asyncio as aioredis

from app.config import settings
from app.core.logging import get_logger

logger = get_logger("core.redis")

_pool: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis:
    global _pool
    if _pool is None:
        _pool = aioredis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
            max_connections=20,
        )
    return _pool


async def close_redis() -> None:
    global _pool
    if _pool is not None:
        await _pool.aclose()
        _pool = None


async def redis_get(key: str) -> str | None:
    try:
        r = await get_redis()
        return await r.get(key)
    except Exception as exc:
        logger.warning("redis_get_failed", key=key, error=str(exc))
        return None


async def redis_set(key: str, value: str, ttl: int = 60) -> bool:
    try:
        r = await get_redis()
        await r.set(key, value, ex=ttl)
        return True
    except Exception as exc:
        logger.warning("redis_set_failed", key=key, error=str(exc))
        return False


async def redis_delete(key: str) -> bool:
    try:
        r = await get_redis()
        await r.delete(key)
        return True
    except Exception as exc:
        logger.warning("redis_delete_failed", key=key, error=str(exc))
        return False


async def redis_publish(channel: str, message: str) -> None:
    try:
        r = await get_redis()
        await r.publish(channel, message)
    except Exception as exc:
        logger.warning("redis_publish_failed", channel=channel, error=str(exc))
