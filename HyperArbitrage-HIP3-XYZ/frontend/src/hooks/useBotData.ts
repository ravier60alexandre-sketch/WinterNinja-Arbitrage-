"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { botAction, updateBotConfig, createBot } from "@/lib/api";
import type { BotAction, BotConfig, BotCreatePayload } from "@/lib/types";
import { useBotStore } from "@/store/botStore";

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
    },
  });
}

export function useCreateBot() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: BotCreatePayload) => createBot(payload),
    onSuccess: () => {
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
