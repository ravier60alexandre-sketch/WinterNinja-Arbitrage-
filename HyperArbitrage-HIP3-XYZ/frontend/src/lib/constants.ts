export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "http://localhost:8000";
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "HyperArbitrage HIP-3";

export const COLORS = {
  bg: { primary: "#0a0a0f", surface: "#12121a", border: "#1e1e2e" },
  accent: { indigo: "#6366f1", cyan: "#22d3ee", green: "#22c55e", red: "#ef4444", amber: "#f59e0b" },
  text: { primary: "#f1f5f9", secondary: "#94a3b8" },
} as const;

export const BOT_STATE_COLORS: Record<string, string> = {
  RUNNING: "text-accent-green",
  PAUSED: "text-accent-amber",
  LIQUIDATING: "text-orange-500",
  STOPPED: "text-text-secondary",
  CONNECTING: "text-accent-cyan",
  IDLE: "text-text-secondary",
};

export const BOT_STATE_BG: Record<string, string> = {
  RUNNING: "bg-accent-green/20 border-accent-green/30",
  PAUSED: "bg-accent-amber/20 border-accent-amber/30",
  LIQUIDATING: "bg-orange-500/20 border-orange-500/30",
  STOPPED: "bg-bg-border",
  CONNECTING: "bg-accent-cyan/20 border-accent-cyan/30",
  IDLE: "bg-bg-border",
};

export const TIMEFRAMES = ["1h", "6h", "12h", "24h", "7d"] as const;

export const PERCENTILE_OPTIONS = [
  { label: "P50", value: 0.5 },
  { label: "P75", value: 0.75 },
  { label: "P80", value: 0.8 },
  { label: "P95", value: 0.95 },
] as const;

export const BOT_DEFINITIONS = [
  { id: 1, name: "Bot 1", pair_a: "XYZ", pair_b: "CASH", direction: "long_a_short_b" as const },
  { id: 2, name: "Bot 2", pair_a: "XYZ", pair_b: "KM", direction: "long_a_short_b" as const },
  { id: 3, name: "Bot 3", pair_a: "XYZ", pair_b: "FLX", direction: "long_a_short_b" as const },
  { id: 4, name: "Bot 4", pair_a: "XYZ", pair_b: "CASH", direction: "short_a_long_b" as const },
  { id: 5, name: "Bot 5", pair_a: "XYZ", pair_b: "KM", direction: "short_a_long_b" as const },
  { id: 6, name: "Bot 6", pair_a: "XYZ", pair_b: "FLX", direction: "short_a_long_b" as const },
] as const;
