"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import { COLORS } from "@/lib/constants";

interface AggregatedChartsProps {
  botPnlData: Array<{ name: string; pnl: number }>;
}

export default function AggregatedCharts({ botPnlData }: AggregatedChartsProps) {
  return (
    <div className="bg-bg-surface border border-bg-border rounded-xl p-4">
      <h3 className="text-sm font-semibold text-text-primary mb-3">PnL by Bot</h3>
      <div className="h-[250px]">
        {botPnlData.length === 0 ? (
          <div className="flex items-center justify-center h-full text-text-secondary text-sm">
            No data
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={botPnlData}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.bg.border} />
              <XAxis dataKey="name" stroke="#4a4a5a" tick={{ fontSize: 10, fill: COLORS.text.secondary }} />
              <YAxis stroke="#4a4a5a" tick={{ fontSize: 10, fill: COLORS.text.secondary }} />
              <Tooltip
                contentStyle={{ backgroundColor: COLORS.bg.surface, border: `1px solid ${COLORS.bg.border}`, borderRadius: 8 }}
                labelStyle={{ color: COLORS.text.secondary }}
              />
              <Bar
                dataKey="pnl"
                name="Net PnL"
                fill={COLORS.accent.indigo}
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
