"use client";

import { useSpreadStream } from "@/hooks/useSpreadStream";
import RealTimeChart from "@/components/shared/RealTimeChart";
import { COLORS } from "@/lib/constants";

interface SpreadChartProps {
  botId: number;
  historyData?: Array<{ timestamp: number; spread: number; edge?: number }>;
  feeThreshold?: number;
}

export default function SpreadChart({ botId, historyData = [], feeThreshold = 4 }: SpreadChartProps) {
  const liveSpread = useSpreadStream(botId);

  const dataKeys = [
    { key: "spread", color: COLORS.accent.cyan, name: "Spread" },
  ];

  const referenceLines = [
    { y: feeThreshold, color: COLORS.accent.amber, label: `Fee: ${feeThreshold} bps`, dashed: true },
    { y: 0, color: "#4a4a5a", label: "", dashed: false },
  ];

  if (liveSpread?.p50) {
    referenceLines.push({
      y: parseFloat(liveSpread.p50),
      color: COLORS.accent.indigo,
      label: `P50: ${parseFloat(liveSpread.p50).toFixed(1)}`,
      dashed: true,
    });
  }

  return (
    <div className="bg-bg-surface border border-bg-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-text-primary">Real-Time Spread</h3>
        {liveSpread && (
          <span className="font-mono text-sm text-accent-cyan">
            {parseFloat(liveSpread.spread).toFixed(2)} bps
          </span>
        )}
      </div>
      <RealTimeChart data={historyData} dataKeys={dataKeys} referenceLines={referenceLines} height={300} />

      {/* Legend */}
      <div className="mt-3 pt-2 border-t border-bg-border">
        <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-[10px] text-text-secondary">
          <div><span className="text-accent-cyan font-medium">Spread (cyan)</span> — Current spread between pair A and B in bps.</div>
          <div><span className="text-accent-amber font-medium">Fee line (dashed)</span> — Round-trip fee threshold. Above = profitable.</div>
          <div><span className="text-accent-indigo font-medium">P50 (dashed)</span> — Median spread. Mean-reversion center.</div>
        </div>
      </div>
    </div>
  );
}
