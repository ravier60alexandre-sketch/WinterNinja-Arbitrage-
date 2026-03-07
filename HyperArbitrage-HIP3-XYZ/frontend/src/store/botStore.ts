import { create } from "zustand";
import type { Bot, BotState } from "@/lib/types";

interface BotStoreState {
  bots: Bot[];
  setBots: (bots: Bot[]) => void;
  updateBotState: (botId: number, state: BotState) => void;
  getBotById: (id: number) => Bot | undefined;
}

export const useBotStore = create<BotStoreState>((set, get) => ({
  bots: [],
  setBots: (bots) => set({ bots }),
  updateBotState: (botId, state) =>
    set((s) => ({
      bots: s.bots.map((b) => (b.id === botId ? { ...b, state } : b)),
    })),
  getBotById: (id) => get().bots.find((b) => b.id === id),
}));
