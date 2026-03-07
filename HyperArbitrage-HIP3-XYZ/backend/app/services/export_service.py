import csv
import io
from datetime import datetime
from decimal import Decimal

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet

from app.models.trade import Trade


class ExportService:
    @staticmethod
    def trades_to_csv(trades: list[Trade]) -> str:
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow([
            "ID", "Bot ID", "Entry Time", "Exit Time", "Pair A", "Pair B",
            "Size", "Entry Price A", "Entry Price B", "Exit Price A", "Exit Price B",
            "Gross PnL", "Fees Paid", "Funding Paid", "Net PnL",
            "Slippage A", "Slippage B", "Entry Spread", "Exit Spread",
            "Edge at Entry", "Status", "Close Reason",
        ])

        for t in trades:
            writer.writerow([
                t.id, t.bot_id,
                t.entry_time.isoformat() if t.entry_time else "",
                t.exit_time.isoformat() if t.exit_time else "",
                t.pair_a, t.pair_b, str(t.size),
                str(t.entry_price_a), str(t.entry_price_b),
                str(t.exit_price_a or ""), str(t.exit_price_b or ""),
                str(t.gross_pnl or ""), str(t.fees_paid or ""),
                str(t.funding_paid or ""), str(t.net_pnl or ""),
                str(t.slippage_a or ""), str(t.slippage_b or ""),
                str(t.entry_spread or ""), str(t.exit_spread or ""),
                str(t.edge_at_entry or ""), t.status, t.close_reason or "",
            ])

        return output.getvalue()

    @staticmethod
    def trades_to_pdf(trades: list[Trade], bot_name: str = "") -> bytes:
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=landscape(A4), topMargin=15 * mm, bottomMargin=15 * mm)
        styles = getSampleStyleSheet()
        elements = []

        title = f"Trade Report — {bot_name}" if bot_name else "Trade Report"
        elements.append(Paragraph(title, styles["Title"]))
        elements.append(Spacer(1, 10 * mm))

        header = ["ID", "Entry", "Exit", "Pair", "Size", "Gross PnL", "Fees", "Net PnL", "Status", "Reason"]
        data = [header]

        for t in trades:
            data.append([
                str(t.id),
                t.entry_time.strftime("%Y-%m-%d %H:%M") if t.entry_time else "",
                t.exit_time.strftime("%Y-%m-%d %H:%M") if t.exit_time else "",
                f"{t.pair_a}/{t.pair_b}",
                f"{t.size:.4f}",
                f"{t.gross_pnl:.4f}" if t.gross_pnl else "",
                f"{t.fees_paid:.4f}" if t.fees_paid else "",
                f"{t.net_pnl:.4f}" if t.net_pnl else "",
                t.status,
                t.close_reason or "",
            ])

        table = Table(data, repeatRows=1)
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e1e2e")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTSIZE", (0, 0), (-1, -1), 7),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.whitesmoke, colors.white]),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]))

        elements.append(table)
        doc.build(elements)
        return buffer.getvalue()
