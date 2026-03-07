import asyncio
import json
import time

import orjson
import websockets

from app.config import settings
from app.core.logging import get_logger

logger = get_logger("services.hyperliquid_client")


class HyperliquidClient:
    __slots__ = (
        "bot_id", "_ws_url", "_http_url", "_ws", "_subscriptions",
        "_on_message", "_reconnect_attempt", "_max_reconnect_delay",
        "_consecutive_failures", "_circuit_open", "_running",
        "_ping_task", "_listen_task",
    )

    def __init__(self, bot_id: int, on_message: object = None) -> None:
        self.bot_id = bot_id
        self._ws_url = settings.HL_WS_URL
        self._http_url = settings.HL_HTTP_URL
        self._ws = None
        self._subscriptions: list[dict] = []
        self._on_message = on_message
        self._reconnect_attempt = 0
        self._max_reconnect_delay = 60
        self._consecutive_failures = 0
        self._circuit_open = False
        self._running = False
        self._ping_task = None
        self._listen_task = None

    async def connect(self) -> None:
        self._running = True
        while self._running:
            if self._circuit_open:
                logger.warning("circuit_breaker_open", bot_id=self.bot_id)
                await asyncio.sleep(300)
                self._circuit_open = False
                self._consecutive_failures = 0

            try:
                self._ws = await websockets.connect(
                    self._ws_url,
                    ping_interval=30,
                    ping_timeout=10,
                    max_size=10 * 1024 * 1024,
                )
                self._reconnect_attempt = 0
                self._consecutive_failures = 0
                logger.info("ws_connected", bot_id=self.bot_id)

                await self._resubscribe()
                self._ping_task = asyncio.create_task(self._ping_loop())
                await self._listen()

            except asyncio.CancelledError:
                break
            except Exception as exc:
                self._consecutive_failures += 1
                if self._consecutive_failures >= 5:
                    self._circuit_open = True
                    logger.error("circuit_breaker_triggered", bot_id=self.bot_id, failures=self._consecutive_failures)
                    continue

                self._reconnect_attempt += 1
                delay = min(2 ** self._reconnect_attempt, self._max_reconnect_delay)
                logger.warning(
                    "ws_reconnecting",
                    bot_id=self.bot_id,
                    attempt=self._reconnect_attempt,
                    delay=delay,
                    error=str(exc),
                )
                await asyncio.sleep(delay)

    async def _listen(self) -> None:
        try:
            async for message in self._ws:
                try:
                    data = orjson.loads(message)
                    if self._on_message:
                        await self._on_message(data)
                except (orjson.JSONDecodeError, ValueError):
                    pass
        except websockets.exceptions.ConnectionClosed:
            logger.warning("ws_connection_closed", bot_id=self.bot_id)

    async def _ping_loop(self) -> None:
        while self._running and self._ws:
            try:
                await asyncio.sleep(30)
                if self._ws and self._ws.open:
                    await self._ws.ping()
            except asyncio.CancelledError:
                break
            except Exception:
                break

    def subscribe(self, sub: dict) -> None:
        self._subscriptions.append(sub)

    async def _resubscribe(self) -> None:
        for sub in self._subscriptions:
            if self._ws and self._ws.open:
                await self._ws.send(orjson.dumps(sub).decode())

    async def close(self) -> None:
        self._running = False
        if self._ping_task:
            self._ping_task.cancel()
        if self._ws:
            await self._ws.close()
        logger.info("ws_closed", bot_id=self.bot_id)

    @property
    def is_connected(self) -> bool:
        return self._ws is not None and self._ws.open
