import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { BotState, Direction } from "@/lib/types";

export interface BotSlot {
  id: number;
  name: string;
  deployer: string;          // CASH | KM | FLX
  direction: Direction;
  directionLabel: string;    // "XYZ Short" | "XYZ Long"
  state: BotState;
  apiKey: string | null;
  walletAddress: string | null;
  subAccountAddress: string | null;
  connected: boolean;
}

const DEFAULT_BOTS: BotSlot[] = [
  { id: 1, name: "Bot 1 — XYZ Short vs CASH", deployer: "CASH", direction: "long_a_short_b", directionLabel: "XYZ Short", state: "IDLE", apiKey: null, walletAddress: null, subAccountAddress: null, connected: false },
  { id: 2, name: "Bot 2 — XYZ Short vs KM",   deployer: "KM",   direction: "long_a_short_b", directionLabel: "XYZ Short", state: "IDLE", apiKey: null, walletAddress: null, subAccountAddress: null, connected: false },
  { id: 3, name: "Bot 3 — XYZ Short vs FLX",  deployer: "FLX",  direction: "long_a_short_b", directionLabel: "XYZ Short", state: "IDLE", apiKey: null, walletAddress: null, subAccountAddress: null, connected: false },
  { id: 4, name: "Bot 4 — XYZ Long vs CASH",  deployer: "CASH", direction: "short_a_long_b", directionLabel: "XYZ Long",  state: "IDLE", apiKey: null, walletAddress: null, subAccountAddress: null, connected: false },
  { id: 5, name: "Bot 5 — XYZ Long vs KM",    deployer: "KM",   direction: "short_a_long_b", directionLabel: "XYZ Long",  state: "IDLE", apiKey: null, walletAddress: null, subAccountAddress: null, connected: false },
  { id: 6, name: "Bot 6 — XYZ Long vs FLX",   deployer: "FLX",  direction: "short_a_long_b", directionLabel: "XYZ Long",  state: "IDLE", apiKey: null, walletAddress: null, subAccountAddress: null, connected: false },
];

interface BotStoreState {
  bots: BotSlot[];
  connectBot: (id: number, apiKey: string, walletAddress: string, subAccountAddress?: string) => void;
  disconnectBot: (id: number) => void;
  updateBotState: (id: number, state: BotState) => void;
  getBotById: (id: number) => BotSlot | undefined;
}

export const useBotStore = create<BotStoreState>()(
  persist(
    (set, get) => ({
      bots: DEFAULT_BOTS,

      connectBot: (id, apiKey, walletAddress, subAccountAddress) =>
        set((s) => ({
          bots: s.bots.map((b) =>
            b.id === id
              ? { ...b, apiKey, walletAddress, subAccountAddress: subAccountAddress || null, connected: true }
              : b
          ),
        })),

      disconnectBot: (id) =>
        set((s) => ({
          bots: s.bots.map((b) =>
            b.id === id
              ? { ...b, apiKey: null, walletAddress: null, subAccountAddress: null, connected: false, state: "IDLE" as BotState }
              : b
          ),
        })),

      updateBotState: (id, state) =>
        set((s) => ({
          bots: s.bots.map((b) => (b.id === id ? { ...b, state } : b)),
        })),

      getBotById: (id) => get().bots.find((b) => b.id === id),
    }),
    {
      name: "hyperarbitrage-bots",
      partialize: (state) => ({
        bots: state.bots.map((b) => ({
          ...b,
          // persist credentials + connection state, reset runtime state
          state: "IDLE" as BotState,
        })),
      }),
    }
  )
);
