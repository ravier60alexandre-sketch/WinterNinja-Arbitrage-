"use client";

import { useRef, useEffect, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import { COLORS } from "@/lib/constants";
import { formatTimeShort } from "@/lib/formatters";

interface DataPoint {
  timestamp: number;
  [key: string]: number;
}

interface RealTimeChartProps {
  data: DataPoint[];
  dataKeys: Array<{ key: string; color: string; name: string }>;
  referenceLines?: Array<{ y: number; color: string; label: string; dashed?: boolean }>;
  height?: number;
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-bg-surface border border-bg-border rounded-lg p-3 shadow-xl">
      <p className="text-xs text-text-secondary font-mono mb-1">
        {new Date(label).toLocaleString()}
      </p>
      {payload.map((entry: any, i: number) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-text-secondary">{entry.name}:</span>
          <span className="font-mono text-text-primary">{entry.value?.toFixed(2)} bps</span>
        </div>
      ))}
    </div>
  );
}

export default function RealTimeChart({ data, dataKeys, referenceLines, height = 300 }: RealTimeChartProps) {
  return (
    <div style={{ height }}>
      {data.length === 0 ? (
        <div className="flex items-center justify-center h-full text-text-secondary text-sm">
          Waiting for data...
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.bg.border} />
            <XAxis
              dataKey="timestamp"
              tickFormatter={(v) => formatTimeShort(new Date(v).toISOString())}
              stroke="#4a4a5a"
              tick={{ fontSize: 10, fill: COLORS.text.secondary }}
              type="number"
              domain={["dataMin", "dataMax"]}
              scale="time"
            />
            <YAxis
              stroke="#4a4a5a"
              tick={{ fontSize: 10, fill: COLORS.text.secondary }}
              tickFormatter={(v) => v.toFixed(1)}
            />
            <Tooltip content={<ChartTooltip />} />

            {referenceLines?.map((ref, i) => (
              <ReferenceLine
                key={i}
                y={ref.y}
                stroke={ref.color}
                strokeDasharray={ref.dashed ? "6 4" : undefined}
                label={{ value: ref.label, position: "right", fill: ref.color, fontSize: 10 }}
              />
            ))}

            {dataKeys.map((dk) => (
              <Line
                key={dk.key}
                type="monotone"
                dataKey={dk.key}
                name={dk.name}
                stroke={dk.color}
                dot={false}
                strokeWidth={1.5}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
