import asyncio
import time
from collections import defaultdict

import socketio

from app.core.logging import get_logger

logger = get_logger("api.ws.manager")

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",
    ping_interval=30,
    ping_timeout=10,
    max_http_buffer_size=1024 * 1024,
    logger=False,
    engineio_logger=False,
)

_connection_counts: dict[str, int] = defaultdict(int)
MAX_CONNECTIONS_PER_IP = 5

_last_broadcast: dict[str, float] = {}
MIN_BROADCAST_INTERVAL = 0.2


@sio.event
async def connect(sid, environ, auth):
    ip = environ.get("REMOTE_ADDR", "unknown")
    if _connection_counts[ip] >= MAX_CONNECTIONS_PER_IP:
        logger.warning("ws_connection_rejected", ip=ip, reason="max_connections")
        raise socketio.exceptions.ConnectionRefusedError("Too many connections")

    _connection_counts[ip] += 1
    logger.info("ws_client_connected", sid=sid, ip=ip)


@sio.event
async def disconnect(sid):
    rooms = sio.rooms(sid)
    logger.info("ws_client_disconnected", sid=sid)


@sio.event
async def join_bot(sid, data):
    bot_id = data.get("bot_id")
    if bot_id is not None:
        room = f"bot:{bot_id}"
        await sio.enter_room(sid, room)
        logger.info("ws_joined_room", sid=sid, room=room)


@sio.event
async def join_admin(sid, data):
    await sio.enter_room(sid, "admin")
    logger.info("ws_joined_admin", sid=sid)


@sio.event
async def leave_bot(sid, data):
    bot_id = data.get("bot_id")
    if bot_id is not None:
        room = f"bot:{bot_id}"
        await sio.leave_room(sid, room)


async def broadcast_to_bot(bot_id: int, event_type: str, data: dict) -> None:
    key = f"bot:{bot_id}:{event_type}"
    now = time.monotonic()
    if now - _last_broadcast.get(key, 0) < MIN_BROADCAST_INTERVAL:
        return
    _last_broadcast[key] = now

    await sio.emit(
        event_type,
        {"bot_id": bot_id, "data": data},
        room=f"bot:{bot_id}",
    )


async def broadcast_to_admin(event_type: str, data: dict) -> None:
    key = f"admin:{event_type}"
    now = time.monotonic()
    if now - _last_broadcast.get(key, 0) < MIN_BROADCAST_INTERVAL:
        return
    _last_broadcast[key] = now

    await sio.emit(event_type, data, room="admin")


def create_socketio_app(app):
    return socketio.ASGIApp(sio, other_app=app)
