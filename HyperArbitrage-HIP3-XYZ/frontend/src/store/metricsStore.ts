import { create } from "zustand";
import type { SpreadSnapshot } from "@/lib/types";

interface SpreadData {
  spread: string;
  mid_a: string;
  mid_b: string;
  edge: string | null;
  p50: string | null;
  p75: string | null;
  p80: string | null;
  p95: string | null;
}

interface MetricsStoreState {
  spreads: Record<number, SpreadData>;
  updateSpread: (botId: number, data: SpreadData) => void;
  connectionStatus: "connected" | "disconnected" | "reconnecting";
  reconnectCount: number;
  setConnectionStatus: (status: "connected" | "disconnected" | "reconnecting") => void;
  incrementReconnect: () => void;
}

export const useMetricsStore = create<MetricsStoreState>((set) => ({
  spreads: {},
  updateSpread: (botId, data) =>
    set((s) => ({
      spreads: { ...s.spreads, [botId]: data },
    })),
  connectionStatus: "disconnected",
  reconnectCount: 0,
  setConnectionStatus: (status) => set({ connectionStatus: status }),
  incrementReconnect: () => set((s) => ({ reconnectCount: s.reconnectCount + 1 })),
}));
