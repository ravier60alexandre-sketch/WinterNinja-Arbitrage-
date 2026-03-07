"use client";

import { useState } from "react";
import { useTrades } from "@/hooks/useMetrics";
import { formatTimestamp, formatDecimal, pnlColor, cn } from "@/lib/formatters";
import ExportButton from "@/components/shared/ExportButton";

interface TradeHistoryProps {
  botId: number;
}

const COLUMNS = [
  { key: "id", label: "#", align: "left" as const },
  { key: "entry_time", label: "Entry", align: "left" as const },
  { key: "exit_time", label: "Exit", align: "left" as const },
  { key: "size", label: "Size", align: "right" as const },
  { key: "entry_spread", label: "Entry Spread", align: "right" as const },
  { key: "exit_spread", label: "Exit Spread", align: "right" as const },
  { key: "slippage_a", label: "Slip A", align: "right" as const },
  { key: "slippage_b", label: "Slip B", align: "right" as const },
  { key: "fees_paid", label: "Fees", align: "right" as const },
  { key: "funding_paid", label: "Funding", align: "right" as const },
  { key: "net_pnl", label: "Net PnL", align: "right" as const },
  { key: "close_reason", label: "Reason", align: "left" as const },
];

export default function TradeHistory({ botId }: TradeHistoryProps) {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useTrades(botId, page, 50);

  const trades = data?.trades ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 50);

  return (
    <div className="bg-bg-surface border border-bg-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-text-primary">
          Trade History <span className="text-text-secondary font-normal">({total})</span>
        </h3>
        <ExportButton botId={botId} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-bg-border">
              {COLUMNS.map((col) => (
                <th key={col.key} className={`py-2 px-2 font-medium text-text-secondary text-${col.align}`}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={COLUMNS.length} className="py-8 text-center text-text-secondary">Loading...</td></tr>
            ) : trades.length === 0 ? (
              <tr><td colSpan={COLUMNS.length} className="py-8 text-center text-text-secondary">No trades yet</td></tr>
            ) : (
              trades.map((trade) => (
                <tr key={trade.id} className="border-b border-bg-border/30 hover:bg-bg-border/20">
                  <td className="py-2 px-2 font-mono text-text-secondary">{trade.id}</td>
                  <td className="py-2 px-2 font-mono text-text-primary">{formatTimestamp(trade.entry_time)}</td>
                  <td className="py-2 px-2 font-mono text-text-primary">{formatTimestamp(trade.exit_time)}</td>
                  <td className="py-2 px-2 font-mono text-right text-text-primary">{formatDecimal(trade.size)}</td>
                  <td className="py-2 px-2 font-mono text-right">{formatDecimal(trade.entry_spread, 2)}</td>
                  <td className="py-2 px-2 font-mono text-right">{formatDecimal(trade.exit_spread, 2)}</td>
                  <td className="py-2 px-2 font-mono text-right">{formatDecimal(trade.slippage_a, 2)}</td>
                  <td className="py-2 px-2 font-mono text-right">{formatDecimal(trade.slippage_b, 2)}</td>
                  <td className="py-2 px-2 font-mono text-right text-accent-amber">{formatDecimal(trade.fees_paid)}</td>
                  <td className="py-2 px-2 font-mono text-right">{formatDecimal(trade.funding_paid)}</td>
                  <td className={cn("py-2 px-2 font-mono text-right font-semibold", pnlColor(trade.net_pnl))}>
                    {formatDecimal(trade.net_pnl)}
                  </td>
                  <td className="py-2 px-2 text-text-secondary">{trade.close_reason || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-bg-border">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1 text-xs border border-bg-border rounded disabled:opacity-30 hover:bg-bg-border transition-colors"
          >
            Previous
          </button>
          <span className="text-xs text-text-secondary">Page {page} / {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1 text-xs border border-bg-border rounded disabled:opacity-30 hover:bg-bg-border transition-colors"
          >
            Next
          </button>
        </div>
      )}

      {/* Legend */}
      <div className="mt-3 pt-2 border-t border-bg-border">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-0.5 text-[10px] text-text-secondary">
          <div><span className="text-text-primary font-medium">Entry/Exit Spread</span> — Spread in bps at the time of entry/exit.</div>
          <div><span className="text-text-primary font-medium">Slip A/B</span> — Realized slippage in bps for each leg.</div>
          <div><span className="text-accent-amber font-medium">Fees</span> — Total taker fees for both legs (entry + exit).</div>
          <div><span className="text-text-primary font-medium">Funding</span> — Net funding paid/received while position was open.</div>
          <div><span className="text-accent-green font-medium">Net PnL</span> — Gross PnL minus fees and funding. Green = profit.</div>
          <div><span className="text-text-primary font-medium">Reason</span> — Why the trade closed: on_profit, on_reverse, forced, or one_leg.</div>
        </div>
      </div>
    </div>
  );
}
