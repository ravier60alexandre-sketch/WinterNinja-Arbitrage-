"use client";

import Link from "next/link";
import { useOpenPositions } from "@/hooks/useMetrics";
import { cn, formatUSD, formatDecimal, formatTimestamp } from "@/lib/formatters";

export default function ActivePositions() {
  const { data, isLoading, isError } = useOpenPositions();

  if (isLoading) {
    return (
      <div className="rounded-xl border border-bg-border bg-bg-surface p-4">
        <h2 className="text-sm font-semibold text-text-primary mb-3">Active Positions</h2>
        <div className="flex items-center justify-center h-16">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent-indigo border-t-transparent" />
        </div>
      </div>
    );
  }

  const positions = data?.positions || [];

  return (
    <div className="rounded-xl border border-bg-border bg-bg-surface p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-text-primary">Active Positions</h2>
          {positions.length > 0 && (
            <span className="px-2 py-0.5 bg-accent-cyan/10 border border-accent-cyan/20 rounded-full text-[10px] font-bold text-accent-cyan">
              {positions.length}
            </span>
          )}
        </div>
      </div>

      {positions.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-xs text-text-secondary">No open positions</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-bg-border text-[10px] text-text-secondary uppercase tracking-wider">
                <th className="text-left py-2 pr-3">Bot</th>
                <th className="text-left py-2 pr-3">Pair</th>
                <th className="text-left py-2 pr-3">Direction</th>
                <th className="text-right py-2 pr-3">Size</th>
                <th className="text-right py-2 pr-3">Entry A</th>
                <th className="text-right py-2 pr-3">Entry B</th>
                <th className="text-right py-2 pr-3">Spread</th>
                <th className="text-right py-2 pr-3">Edge</th>
                <th className="text-left py-2">Opened</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((pos) => {
                const dirColor = pos.direction === "long_a_short_b"
                  ? "text-accent-red"
                  : "text-accent-green";
                const dirLabel = pos.direction === "long_a_short_b"
                  ? "Short"
                  : "Long";

                return (
                  <tr
                    key={pos.id}
                    className="border-b border-bg-border/50 hover:bg-bg-border/20 transition-colors"
                  >
                    <td className="py-2 pr-3">
                      <Link
                        href={`/dashboard/${pos.bot_id}`}
                        className="text-accent-indigo hover:text-accent-indigo/80 font-medium"
                      >
                        {pos.bot_name}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 font-mono text-text-primary">
                      {pos.pair_a} / {pos.pair_b}
                    </td>
                    <td className="py-2 pr-3">
                      <span className={cn("font-semibold", dirColor)}>{dirLabel}</span>
                    </td>
                    <td className="py-2 pr-3 text-right font-mono text-text-primary">
                      {formatDecimal(pos.size, 4)}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono text-text-secondary">
                      {formatUSD(pos.entry_price_a)}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono text-text-secondary">
                      {formatUSD(pos.entry_price_b)}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono text-accent-cyan">
                      {pos.entry_spread ? formatDecimal(pos.entry_spread, 6) : "—"}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono text-accent-indigo">
                      {pos.edge_at_entry ? `${formatDecimal(pos.edge_at_entry, 2)} bps` : "—"}
                    </td>
                    <td className="py-2 text-text-secondary">
                      {formatTimestamp(pos.entry_time)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
