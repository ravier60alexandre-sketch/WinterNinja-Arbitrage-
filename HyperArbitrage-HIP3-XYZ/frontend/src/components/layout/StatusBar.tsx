"use client";

import { useAggregatedMetrics } from "@/hooks/useMetrics";
import { formatUSD } from "@/lib/formatters";
import { pnlColor } from "@/lib/formatters";

export default function StatusBar() {
  const { data } = useAggregatedMetrics();

  if (!data) return null;

  return (
    <div className="h-8 border-t border-bg-border bg-bg-surface flex items-center px-6 gap-6 text-[10px]">
      <span className="text-text-secondary">
        PnL: <span className={`font-mono ${pnlColor(data.total_pnl)}`}>{formatUSD(data.total_pnl)}</span>
      </span>
      <span className="text-text-secondary">
        Trades: <span className="font-mono text-text-primary">{data.total_trades}</span>
      </span>
      <span className="text-text-secondary">
        Win Rate: <span className="font-mono text-text-primary">{data.win_rate.toFixed(1)}%</span>
      </span>
      <span className="text-text-secondary">
        Volume: <span className="font-mono text-text-primary">{formatUSD(data.total_volume)}</span>
      </span>
      <span className="text-text-secondary">
        One-Leg: <span className="font-mono text-accent-amber">{data.total_one_leg_events}</span>
      </span>
    </div>
  );
}
