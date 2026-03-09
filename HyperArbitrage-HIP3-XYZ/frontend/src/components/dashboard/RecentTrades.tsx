"use client";

import Link from "next/link";
import { useRecentTrades } from "@/hooks/useMetrics";
import { cn, formatUSD, formatTimestamp, pnlColor } from "@/lib/formatters";

const CLOSE_REASON_COLORS: Record<string, string> = {
  on_profit: "text-accent-green bg-accent-green/10 border-accent-green/20",
  on_reverse: "text-accent-amber bg-accent-amber/10 border-accent-amber/20",
  forced: "text-accent-red bg-accent-red/10 border-accent-red/20",
  one_leg: "text-orange-400 bg-orange-400/10 border-orange-400/20",
};

export default function RecentTrades() {
  const { data, isLoading } = useRecentTrades(20);

  if (isLoading) {
    return (
      <div className="rounded-xl border border-bg-border bg-bg-surface p-4">
        <h2 className="text-sm font-semibold text-text-primary mb-3">Recent Trades</h2>
        <div className="flex items-center justify-center h-16">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent-indigo border-t-transparent" />
        </div>
      </div>
    );
  }

  const trades = data?.trades || [];

  return (
    <div className="rounded-xl border border-bg-border bg-bg-surface p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-text-primary">Recent Trades</h2>
        <span className="text-[10px] text-text-secondary">Last {trades.length} trades</span>
      </div>

      {trades.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-xs text-text-secondary">No trades yet</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-bg-border text-[10px] text-text-secondary uppercase tracking-wider">
                <th className="text-left py-2 pr-3">Bot</th>
                <th className="text-left py-2 pr-3">Pair</th>
                <th className="text-right py-2 pr-3">Size</th>
                <th className="text-right py-2 pr-3">Net PnL</th>
                <th className="text-right py-2 pr-3">Fees</th>
                <th className="text-left py-2 pr-3">Reason</th>
                <th className="text-left py-2 pr-3">Entry</th>
                <th className="text-left py-2">Exit</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => (
                <tr
                  key={t.id}
                  className="border-b border-bg-border/50 hover:bg-bg-border/20 transition-colors"
                >
                  <td className="py-2 pr-3">
                    <Link
                      href={`/dashboard/${t.bot_id}`}
                      className="text-accent-indigo hover:text-accent-indigo/80 font-medium"
                    >
                      {t.bot_name}
                    </Link>
                  </td>
                  <td className="py-2 pr-3 font-mono text-text-primary">
                    {t.pair_a} / {t.pair_b}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono text-text-primary">
                    {parseFloat(t.size).toFixed(4)}
                  </td>
                  <td className={cn("py-2 pr-3 text-right font-mono font-semibold", pnlColor(t.net_pnl))}>
                    {formatUSD(t.net_pnl)}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono text-accent-amber">
                    {formatUSD(t.fees_paid)}
                  </td>
                  <td className="py-2 pr-3">
                    {t.close_reason && (
                      <span className={cn(
                        "px-1.5 py-0.5 rounded text-[9px] font-medium border",
                        CLOSE_REASON_COLORS[t.close_reason] || "text-text-secondary bg-bg-border"
                      )}>
                        {t.close_reason}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-text-secondary">
                    {formatTimestamp(t.entry_time)}
                  </td>
                  <td className="py-2 text-text-secondary">
                    {formatTimestamp(t.exit_time)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
