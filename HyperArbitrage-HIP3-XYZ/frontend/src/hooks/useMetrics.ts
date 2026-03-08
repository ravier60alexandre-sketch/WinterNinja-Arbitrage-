"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchBotMetrics, fetchAggregatedMetrics, fetchTrades } from "@/lib/api";

export function useBotMetrics(botId: number) {
  return useQuery({
    queryKey: ["metrics", botId],
    queryFn: () => fetchBotMetrics(botId),
    refetchInterval: 10000,
    staleTime: 5000,
    retry: 1,
    retryDelay: 5000,
  });
}

export function useAggregatedMetrics() {
  return useQuery({
    queryKey: ["aggregated-metrics"],
    queryFn: fetchAggregatedMetrics,
    refetchInterval: 10000,
    staleTime: 5000,
    retry: 1,
    retryDelay: 5000,
  });
}

export function useTrades(botId: number, page = 1, pageSize = 50) {
  return useQuery({
    queryKey: ["trades", botId, page, pageSize],
    queryFn: () => fetchTrades(botId, page, pageSize),
    staleTime: 3000,
    retry: 1,
    retryDelay: 5000,
  });
}
