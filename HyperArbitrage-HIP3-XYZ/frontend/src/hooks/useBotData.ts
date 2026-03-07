"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchBot, fetchBots, botAction, updateBotConfig } from "@/lib/api";
import type { BotAction, BotConfig } from "@/lib/types";
import { useBotStore } from "@/store/botStore";
import { useEffect } from "react";

export function useBots() {
  const setBots = useBotStore((s) => s.setBots);

  const query = useQuery({
    queryKey: ["bots"],
    queryFn: fetchBots,
    refetchInterval: 5000,
    staleTime: 2000,
  });

  useEffect(() => {
    if (query.data?.bots) {
      setBots(query.data.bots);
    }
  }, [query.data, setBots]);

  return query;
}

export function useBot(botId: number) {
  return useQuery({
    queryKey: ["bot", botId],
    queryFn: () => fetchBot(botId),
    refetchInterval: 3000,
    staleTime: 1000,
  });
}

export function useBotAction(botId: number) {
  const queryClient = useQueryClient();
  const updateBotState = useBotStore((s) => s.updateBotState);

  return useMutation({
    mutationFn: (action: BotAction) => botAction(botId, action),
    onMutate: async (action) => {
      const stateMap: Record<BotAction, string> = {
        start: "CONNECTING",
        stop: "PAUSED",
        liquidate: "LIQUIDATING",
        reset: "IDLE",
      };
      updateBotState(botId, stateMap[action] as any);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["bot", botId] });
      queryClient.invalidateQueries({ queryKey: ["bots"] });
    },
  });
}

export function useBotConfigUpdate(botId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (config: Partial<BotConfig>) => updateBotConfig(botId, config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bot", botId] });
    },
  });
}
