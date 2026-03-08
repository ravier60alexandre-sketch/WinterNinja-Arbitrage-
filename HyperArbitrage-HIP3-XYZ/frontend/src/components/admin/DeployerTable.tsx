"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchDeployerStats } from "@/lib/api";
import { formatDecimal } from "@/lib/formatters";

export default function DeployerTable() {
  const { data: stats, error } = useQuery({
    queryKey: ["deployer-stats"],
    queryFn: fetchDeployerStats,
    refetchInterval: 60000,
    retry: 1,
    retryDelay: 5000,
  });

  if (error) {
    return (
      <div className="text-xs text-text-secondary text-center py-8">
        Deployer data unavailable. Backend offline.
      </div>
    );
  }

  if (!stats || stats.length === 0) return <div className="text-xs text-text-secondary text-center py-8">No deployer data</div>;

  return (
    <div className="bg-bg-surface border border-bg-border rounded-xl p-4">
      <h3 className="text-sm font-semibold text-text-primary mb-3">Deployer Comparison</h3>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-bg-border">
            <th className="text-left py-2 px-2 text-text-secondary">Deployer</th>
            <th className="text-right py-2 px-2 text-text-secondary">Mark Price</th>
            <th className="text-right py-2 px-2 text-text-secondary">Funding Rate</th>
            <th className="text-right py-2 px-2 text-text-secondary">Volume</th>
            <th className="text-right py-2 px-2 text-text-secondary">OI</th>
          </tr>
        </thead>
        <tbody>
          {stats.map((s) => (
            <tr key={s.deployer} className="border-b border-bg-border/30 hover:bg-bg-border/20">
              <td className="py-2 px-2 font-semibold text-text-primary">{s.deployer}</td>
              <td className="py-2 px-2 text-right font-mono text-text-primary">{formatDecimal(s.mark_price)}</td>
              <td className="py-2 px-2 text-right font-mono text-accent-cyan">{formatDecimal(s.funding_rate, 6)}</td>
              <td className="py-2 px-2 text-right font-mono text-text-primary">{formatDecimal(s.total_volume)}</td>
              <td className="py-2 px-2 text-right font-mono text-text-primary">{formatDecimal(s.open_interest)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Legend */}
      <div className="mt-3 pt-2 border-t border-bg-border">
        <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-[10px] text-text-secondary">
          <div><span className="text-text-primary font-medium">Mark Price</span> — Current mark price from Hyperliquid.</div>
          <div><span className="text-accent-cyan font-medium">Funding Rate</span> — Current funding rate per 8h period.</div>
          <div><span className="text-text-primary font-medium">Volume</span> — Total trading volume on this deployer.</div>
          <div><span className="text-text-primary font-medium">OI</span> — Open interest on this deployer.</div>
        </div>
      </div>
    </div>
  );
}
