export type BotState = "IDLE" | "CONNECTING" | "RUNNING" | "PAUSED" | "LIQUIDATING" | "STOPPED";
export type Direction = "long_a_short_b" | "short_a_long_b";
export type ExitMode = "on_profit" | "on_reverse";
export type BotAction = "start" | "stop" | "liquidate" | "reset";

export interface BotConfig {
  percentile: number;
  timeframe_hours: number;
  profit_margin_bps: number;
  max_slippage_ticks: number;
  max_position_size: number | null;
  funding_rate_threshold: number;
  one_leg_protection: boolean;
  exit_mode: ExitMode;
  min_edge_bps: number;
}

export interface Bot {
  id: number;
  name: string;
  pair_a: string;
  pair_b: string;
  direction: Direction;
  state: BotState;
  account_address: string;
  sub_account_address: string | null;
  created_at: string;
  updated_at: string;
  config: BotConfig | null;
}

export interface Trade {
  id: number;
  bot_id: number;
  entry_time: string;
  exit_time: string | null;
  pair_a: string;
  pair_b: string;
  size: string;
  entry_price_a: string;
  entry_price_b: string;
  exit_price_a: string | null;
  exit_price_b: string | null;
  gross_pnl: string | null;
  fees_paid: string | null;
  funding_paid: string;
  net_pnl: string | null;
  slippage_a: string | null;
  slippage_b: string | null;
  entry_spread: string | null;
  exit_spread: string | null;
  edge_at_entry: string | null;
  status: string;
  close_reason: string | null;
}

export interface BotMetrics {
  bot_id: number;
  date: string;
  total_trades: number;
  winning_trades: number;
  total_volume: string;
  total_fees_paid: string;
  total_funding: string;
  gross_pnl: string;
  net_pnl: string;
  avg_slippage: string;
  max_drawdown: string;
  one_leg_events: number;
  win_rate: number;
}

export interface AggregatedMetrics {
  total_pnl: string;
  total_fees: string;
  total_volume: string;
  total_trades: number;
  winning_trades: number;
  win_rate: number;
  total_one_leg_events: number;
  avg_slippage: string;
  max_drawdown: string;
}

export interface DeployerStats {
  deployer: string;
  total_volume: string | null;
  open_interest: string | null;
  funding_rate: string | null;
  mark_price: string | null;
}

export interface SpreadSnapshot {
  timestamp: string;
  spread: string;
  mid_a: string;
  mid_b: string;
  edge: string | null;
  p50: string | null;
  p75: string | null;
  p80: string | null;
  p95: string | null;
}

export type WSEventType =
  | "spread_update"
  | "trade_executed"
  | "bot_state_change"
  | "metrics_update"
  | "log_event"
  | "funding_update";

export interface WSEvent {
  type: WSEventType;
  bot_id: number;
  timestamp: string;
  data: Record<string, unknown>;
}

export interface AdminOverview {
  bots: Array<{
    id: number;
    name: string;
    pair_a: string;
    pair_b: string;
    direction: string;
    state: string;
  }>;
  aggregated: AggregatedMetrics;
}
