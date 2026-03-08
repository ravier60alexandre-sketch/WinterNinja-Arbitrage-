"use client";

import { useAggregatedMetrics } from "@/hooks/useMetrics";
import { formatUSD, formatPercent, pnlColor } from "@/lib/formatters";

const EMPTY_CARDS = [
  { label: "Total PnL", value: "$0.00", color: "text-text-secondary" },
  { label: "Total Fees", value: "$0.00", color: "text-text-secondary" },
  { label: "Total Volume", value: "$0.00", color: "text-text-secondary" },
  { label: "Total Trades", value: "0", color: "text-text-secondary" },
  { label: "Win Rate", value: "0%", color: "text-text-secondary" },
  { label: "One-Leg Events", value: "0", color: "text-text-secondary" },
];

export default function GlobalOverview() {
  const { data, isLoading, error } = useAggregatedMetrics();

  const cards = data
    ? [
        { label: "Total PnL", value: formatUSD(data.total_pnl), color: pnlColor(data.total_pnl) },
        { label: "Total Fees", value: formatUSD(data.total_fees), color: "text-accent-amber" },
        { label: "Total Volume", value: formatUSD(data.total_volume), color: "text-text-primary" },
        { label: "Total Trades", value: data.total_trades.toString(), color: "text-text-primary" },
        { label: "Win Rate", value: formatPercent(data.win_rate), color: data.win_rate > 50 ? "text-accent-green" : "text-accent-red" },
        { label: "One-Leg Events", value: data.total_one_leg_events.toString(), color: data.total_one_leg_events > 0 ? "text-accent-amber" : "text-text-secondary" },
      ]
    : EMPTY_CARDS;

  return (
    <div className="space-y-2">
      {error && (
        <div className="rounded-lg border border-accent-amber/30 bg-accent-amber/10 px-4 py-2">
          <p className="text-xs text-accent-amber">Backend unreachable. Start the server to see live data.</p>
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {cards.map((card) => (
          <div key={card.label} className={`bg-bg-surface border border-bg-border rounded-xl p-4 ${isLoading && !data ? "animate-pulse" : ""}`}>
            <p className="text-[10px] text-text-secondary uppercase tracking-wider mb-1">{card.label}</p>
            <p className={`font-mono text-xl font-semibold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
