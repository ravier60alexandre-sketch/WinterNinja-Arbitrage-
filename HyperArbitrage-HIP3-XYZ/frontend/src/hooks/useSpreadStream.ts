"use client";

import { useMetricsStore } from "@/store/metricsStore";

export function useSpreadStream(botId: number) {
  const spread = useMetricsStore((s) => s.spreads[botId]);
  return spread ?? null;
}
