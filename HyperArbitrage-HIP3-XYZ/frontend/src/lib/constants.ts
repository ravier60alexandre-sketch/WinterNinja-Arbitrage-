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

export const AVAILABLE_PAIRS = [
  { asset_a: "xyz:SILVER", asset_b: "cash:SILVER", label: "SILVER - XYZ vs CASH" },
  { asset_a: "xyz:SILVER", asset_b: "flx:SILVER", label: "SILVER - XYZ vs FLX" },
  { asset_a: "xyz:GOLD", asset_b: "cash:GOLD", label: "GOLD - XYZ vs CASH" },
  { asset_a: "xyz:GOLD", asset_b: "flx:GOLD", label: "GOLD - XYZ vs FLX" },
  { asset_a: "xyz:GOLD", asset_b: "km:GOLD", label: "GOLD - XYZ vs KM" },
  { asset_a: "xyz:TSLA", asset_b: "cash:TSLA", label: "TSLA - XYZ vs CASH" },
  { asset_a: "xyz:TSLA", asset_b: "flx:TSLA", label: "TSLA - XYZ vs FLX" },
  { asset_a: "xyz:TSLA", asset_b: "km:TSLA", label: "TSLA - XYZ vs KM" },
  { asset_a: "xyz:NVDA", asset_b: "cash:NVDA", label: "NVDA - XYZ vs CASH" },
  { asset_a: "xyz:NVDA", asset_b: "flx:NVDA", label: "NVDA - XYZ vs FLX" },
  { asset_a: "xyz:NVDA", asset_b: "km:NVDA", label: "NVDA - XYZ vs KM" },
  { asset_a: "xyz:PLATINUM", asset_b: "flx:PLATINUM", label: "PLATINUM - XYZ vs FLX" },
  { asset_a: "xyz:COIN", asset_b: "flx:COIN", label: "COIN - XYZ vs FLX" },
  { asset_a: "xyz:CRCL", asset_b: "flx:CRCL", label: "CRCL - XYZ vs FLX" },
  { asset_a: "xyz:COPPER", asset_b: "flx:COPPER", label: "COPPER - XYZ vs FLX" },
  { asset_a: "xyz:PALLADIUM", asset_b: "flx:PALLADIUM", label: "PALLADIUM - XYZ vs FLX" },
  { asset_a: "xyz:GOOGL", asset_b: "cash:GOOGL", label: "GOOGL - XYZ vs CASH" },
  { asset_a: "xyz:GOOGL", asset_b: "km:GOOGL", label: "GOOGL - XYZ vs KM" },
  { asset_a: "xyz:PLTR", asset_b: "km:PLTR", label: "PLTR - XYZ vs KM" },
  { asset_a: "xyz:AAPL", asset_b: "km:AAPL", label: "AAPL - XYZ vs KM" },
  { asset_a: "xyz:MU", asset_b: "km:MU", label: "MU - XYZ vs KM" },
  { asset_a: "xyz:BABA", asset_b: "km:BABA", label: "BABA - XYZ vs KM" },
  { asset_a: "xyz:HOOD", asset_b: "cash:HOOD", label: "HOOD - XYZ vs CASH" },
  { asset_a: "xyz:INTC", asset_b: "cash:INTC", label: "INTC - XYZ vs CASH" },
  { asset_a: "xyz:AMZN", asset_b: "cash:AMZN", label: "AMZN - XYZ vs CASH" },
  { asset_a: "xyz:META", asset_b: "cash:META", label: "META - XYZ vs CASH" },
  { asset_a: "xyz:MSFT", asset_b: "cash:MSFT", label: "MSFT - XYZ vs CASH" },
] as const;
