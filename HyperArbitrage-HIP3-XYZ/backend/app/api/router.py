from fastapi import APIRouter

from app.api.v1.bots import router as bots_router
from app.api.v1.trades import router as trades_router
from app.api.v1.metrics import router as metrics_router
from app.api.v1.deployers import router as deployers_router
from app.api.v1.admin import router as admin_router
from app.api.v1.wallet import router as wallet_router

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(bots_router)
api_router.include_router(trades_router)
api_router.include_router(metrics_router)
api_router.include_router(deployers_router)
api_router.include_router(admin_router)
api_router.include_router(wallet_router)
