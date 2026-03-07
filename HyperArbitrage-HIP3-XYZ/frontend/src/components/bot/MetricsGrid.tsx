"use client";

import { useBotMetrics } from "@/hooks/useMetrics";
import { formatUSD, formatDecimal, formatPercent, pnlColor } from "@/lib/formatters";

interface MetricsGridProps {
  botId: number;
}

function Card({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-bg-surface border border-bg-border rounded-xl p-4">
      <p className="text-[10px] text-text-secondary uppercase tracking-wider mb-1">{label}</p>
      <p className={`font-mono text-xl font-semibold ${color || "text-text-primary"}`}>{value}</p>
    </div>
  );
}

export default function MetricsGrid({ botId }: MetricsGridProps) {
  const { data: metrics } = useBotMetrics(botId);

  if (!metrics) {
    return (
      <div className="grid grid-cols-3 lg:grid-cols-5 gap-3">
        {Array.from({ length: 10 }).map((_, i) => (
          <Card key={i} label="—" value="—" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 lg:grid-cols-5 gap-3">
        <Card label="Net PnL (today)" value={formatUSD(metrics.net_pnl)} color={pnlColor(metrics.net_pnl)} />
        <Card label="Fees Paid" value={formatUSD(metrics.total_fees_paid)} color="text-accent-amber" />
        <Card label="Funding" value={formatUSD(metrics.total_funding)} color={pnlColor(metrics.total_funding)} />
        <Card label="Volume 24h" value={formatUSD(metrics.total_volume)} />
        <Card label="Win Rate" value={formatPercent(metrics.win_rate)} color={metrics.win_rate > 50 ? "text-accent-green" : "text-accent-red"} />
        <Card label="Avg Slippage" value={`${formatDecimal(metrics.avg_slippage, 2)} bps`} />
        <Card label="Total Trades" value={metrics.total_trades.toString()} />
        <Card label="Winning Trades" value={metrics.winning_trades.toString()} color="text-accent-green" />
        <Card label="Max Drawdown" value={formatUSD(metrics.max_drawdown)} color="text-accent-red" />
        <Card label="One-Leg Events" value={metrics.one_leg_events.toString()} color={metrics.one_leg_events > 0 ? "text-accent-amber" : "text-text-secondary"} />
      </div>

      {/* Legend */}
      <div className="bg-bg-surface border border-bg-border rounded-xl p-3">
        <p className="text-[10px] text-text-secondary uppercase tracking-wider font-semibold mb-1">Metrics Legend</p>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-0.5 text-[10px] text-text-secondary">
          <div><span className="text-text-primary font-medium">Net PnL</span> — Profit/loss after fees and funding for today.</div>
          <div><span className="text-text-primary font-medium">Fees Paid</span> — Total taker fees paid across all trades today.</div>
          <div><span className="text-text-primary font-medium">Funding</span> — Net funding received or paid on open positions.</div>
          <div><span className="text-text-primary font-medium">Win Rate</span> — % of closed trades with positive net PnL.</div>
          <div><span className="text-text-primary font-medium">Avg Slippage</span> — Average execution slippage in bps across both legs.</div>
          <div><span className="text-accent-amber font-medium">One-Leg Events</span> — Times only one side of a pair trade filled (dangerous).</div>
        </div>
      </div>
    </div>
  );
}
