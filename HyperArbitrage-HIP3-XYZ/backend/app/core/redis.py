from typing import Any

import redis.asyncio as aioredis

from app.config import settings
from app.core.logging import get_logger

logger = get_logger("core.redis")


def get_redis() -> aioredis.Redis:
    return aioredis.from_url(
        settings.redis_url,
        encoding="utf-8",
        decode_responses=True,
        max_connections=20,
    )


class RedisManager:
    def __init__(self) -> None:
        self._pool: aioredis.ConnectionPool | None = None
        self._client: aioredis.Redis | None = None

    async def connect(self) -> None:
        try:
            self._pool = aioredis.ConnectionPool.from_url(
                settings.redis_url,
                encoding="utf-8",
                decode_responses=True,
                max_connections=20,
            )
            self._client = aioredis.Redis(connection_pool=self._pool)
            await self._client.ping()
            logger.info("redis_connected", url=settings.REDIS_HOST)
        except Exception as exc:
            logger.warning("redis_connect_failed", error=str(exc))
            self._client = None
            self._pool = None

    async def disconnect(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None
        if self._pool is not None:
            await self._pool.disconnect()
            self._pool = None
        logger.info("redis_disconnected")

    async def get(self, key: str) -> str | None:
        if self._client is None:
            logger.warning("redis_get_no_connection", key=key)
            return None
        try:
            return await self._client.get(key)
        except Exception as exc:
            logger.warning("redis_get_failed", key=key, error=str(exc))
            return None

    async def set(
        self, key: str, value: Any, ttl: int | None = 60
    ) -> bool:
        if self._client is None:
            logger.warning("redis_set_no_connection", key=key)
            return False
        try:
            if ttl is not None:
                await self._client.set(key, value, ex=ttl)
            else:
                await self._client.set(key, value)
            return True
        except Exception as exc:
            logger.warning("redis_set_failed", key=key, error=str(exc))
            return False

    async def delete(self, key: str) -> bool:
        if self._client is None:
            logger.warning("redis_delete_no_connection", key=key)
            return False
        try:
            await self._client.delete(key)
            return True
        except Exception as exc:
            logger.warning("redis_delete_failed", key=key, error=str(exc))
            return False

    async def publish(self, channel: str, message: str) -> bool:
        if self._client is None:
            logger.warning("redis_publish_no_connection", channel=channel)
            return False
        try:
            await self._client.publish(channel, message)
            return True
        except Exception as exc:
            logger.warning("redis_publish_failed", channel=channel, error=str(exc))
            return False

    @property
    def client(self) -> aioredis.Redis | None:
        return self._client


redis_manager = RedisManager()


async def redis_get(key: str) -> str | None:
    return await redis_manager.get(key)


async def redis_set(key: str, value: Any, ttl: int | None = 60) -> bool:
    return await redis_manager.set(key, value, ttl=ttl)
