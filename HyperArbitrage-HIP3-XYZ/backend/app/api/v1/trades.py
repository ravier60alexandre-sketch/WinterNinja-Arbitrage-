from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.schemas.trade import TradeListResponse, TradeResponse
from app.services.trade_service import TradeService
from app.services.export_service import ExportService

router = APIRouter(prefix="/trades", tags=["trades"])


@router.get("/{bot_id}", response_model=TradeListResponse)
async def get_trades(
    bot_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    session: AsyncSession = Depends(get_session),
):
    svc = TradeService(session)
    trades, total = await svc.get_trades(bot_id, page, page_size)
    return TradeListResponse(
        trades=[TradeResponse.model_validate(t) for t in trades],
        total=total,
        page=page,
        per_page=page_size,
    )


@router.get("/{bot_id}/open", response_model=list[TradeResponse])
async def get_open_trades(bot_id: int, session: AsyncSession = Depends(get_session)):
    svc = TradeService(session)
    trades = await svc.get_open_trades(bot_id)
    return [TradeResponse.model_validate(t) for t in trades]


@router.get("/{bot_id}/export/csv")
async def export_csv(bot_id: int, session: AsyncSession = Depends(get_session)):
    svc = TradeService(session)
    trades, _ = await svc.get_trades(bot_id, page=1, page_size=10000)
    csv_content = ExportService.trades_to_csv(trades)
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=trades_bot_{bot_id}.csv"},
    )


@router.get("/{bot_id}/export/pdf")
async def export_pdf(bot_id: int, session: AsyncSession = Depends(get_session)):
    svc = TradeService(session)
    trades, _ = await svc.get_trades(bot_id, page=1, page_size=10000)
    pdf_bytes = ExportService.trades_to_pdf(trades, bot_name=f"Bot #{bot_id}")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=trades_bot_{bot_id}.pdf"},
    )
