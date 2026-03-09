import asyncio
from contextlib import asynccontextmanager

import uvloop
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import ORJSONResponse

from app.api.router import api_router
from app.api.ws.manager import create_socketio_app
from app.config import settings
from app.core.database import close_db, init_db
from app.core.logging import setup_logging
from app.core.redis import close_redis
from app.bots.bot_manager import bot_manager

asyncio.set_event_loop_policy(uvloop.EventLoopPolicy())

setup_logging()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    # Load deployer perps registry before loading bots (HiP-3 support)
    await bot_manager.load_deployer_registry()
    yield
    await bot_manager.stop_all()
    await close_redis()
    await close_db()


app = FastAPI(
    title="HyperArbitrage HIP-3 XYZ",
    version="1.0.0",
    default_response_class=ORJSONResponse,
    lifespan=lifespan,
    docs_url="/api/docs" if settings.APP_ENV == "development" else None,
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.NEXT_PUBLIC_API_URL] if settings.APP_ENV == "production" else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/health")
async def health_check():
    return {"status": "ok"}


application = create_socketio_app(app)
