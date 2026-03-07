"use client";

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import { COLORS } from "@/lib/constants";
import { formatTimeShort } from "@/lib/formatters";

interface PnlDataPoint {
  timestamp: number;
  cumulative_pnl: number;
}

interface PnlChartProps {
  data: PnlDataPoint[];
}

function PnlTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const val = payload[0].value;
  return (
    <div className="bg-bg-surface border border-bg-border rounded-lg p-2 shadow-xl">
      <p className="text-xs text-text-secondary font-mono">
        {new Date(payload[0].payload.timestamp).toLocaleString()}
      </p>
      <p className={`font-mono text-sm ${val >= 0 ? "text-accent-green" : "text-accent-red"}`}>
        ${val.toFixed(4)}
      </p>
    </div>
  );
}

export default function PnlChart({ data }: PnlChartProps) {
  const isPositive = data.length > 0 && data[data.length - 1].cumulative_pnl >= 0;

  return (
    <div className="bg-bg-surface border border-bg-border rounded-xl p-4">
      <h3 className="text-sm font-semibold text-text-primary mb-3">Cumulative PnL</h3>
      <div className="h-[250px]">
        {data.length === 0 ? (
          <div className="flex items-center justify-center h-full text-text-secondary text-sm">
            No trade data yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.bg.border} />
              <XAxis
                dataKey="timestamp"
                tickFormatter={(v) => formatTimeShort(new Date(v).toISOString())}
                stroke="#4a4a5a"
                tick={{ fontSize: 10, fill: COLORS.text.secondary }}
              />
              <YAxis stroke="#4a4a5a" tick={{ fontSize: 10, fill: COLORS.text.secondary }} />
              <Tooltip content={<PnlTooltip />} />
              <Area
                type="monotone"
                dataKey="cumulative_pnl"
                stroke={isPositive ? COLORS.accent.green : COLORS.accent.red}
                fill={isPositive ? COLORS.accent.green : COLORS.accent.red}
                fillOpacity={0.1}
                strokeWidth={1.5}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
