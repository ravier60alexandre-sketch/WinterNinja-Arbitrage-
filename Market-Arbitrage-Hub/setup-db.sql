CREATE TABLE IF NOT EXISTS bot_config (
  key VARCHAR(64) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at BIGINT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS edge_snapshots (
  id SERIAL PRIMARY KEY,
  pair_id VARCHAR(64) NOT NULL,
  ts BIGINT NOT NULL,
  dir1_edge_bps REAL NOT NULL DEFAULT 0,
  dir2_edge_bps REAL NOT NULL DEFAULT 0,
  max_edge_bps REAL NOT NULL DEFAULT 0,
  dir1_status VARCHAR(32),
  dir2_status VARCHAR(32),
  mid_a REAL,
  mid_b REAL
);
CREATE INDEX IF NOT EXISTS idx_edge_snap_pair_ts ON edge_snapshots (pair_id, ts);

CREATE TABLE IF NOT EXISTS repeg_cycles (
  id SERIAL PRIMARY KEY,
  pair_id VARCHAR(64) NOT NULL,
  direction INTEGER NOT NULL,
  q NUMERIC NOT NULL,
  open_ts BIGINT NOT NULL,
  close_ts BIGINT NOT NULL,
  duration_ms BIGINT NOT NULL,
  open_gross_edge_bps NUMERIC NOT NULL,
  close_gross_edge_bps NUMERIC NOT NULL,
  theoretical_pnl_bps NUMERIC NOT NULL,
  close_liquidity_ok BOOLEAN NOT NULL DEFAULT true,
  success BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_repeg_pair ON repeg_cycles (pair_id);
CREATE INDEX IF NOT EXISTS idx_repeg_open_ts ON repeg_cycles (open_ts);
CREATE INDEX IF NOT EXISTS idx_repeg_success ON repeg_cycles (pair_id, success);
CREATE UNIQUE INDEX IF NOT EXISTS idx_repeg_unique ON repeg_cycles (pair_id, direction, open_ts);

CREATE TABLE IF NOT EXISTS bot_trades (
  id SERIAL PRIMARY KEY,
  pair_id VARCHAR(64) NOT NULL,
  direction INTEGER NOT NULL,
  q NUMERIC NOT NULL,
  signal_edge_bps NUMERIC NOT NULL,
  entry_ts BIGINT NOT NULL,
  leg_a_coin VARCHAR(64) NOT NULL,
  leg_a_side VARCHAR(4) NOT NULL,
  leg_a_size NUMERIC,
  leg_a_price NUMERIC,
  leg_a_fill_price NUMERIC,
  leg_a_oid BIGINT,
  leg_a_status VARCHAR(20) DEFAULT 'pending',
  leg_b_coin VARCHAR(64) NOT NULL,
  leg_b_side VARCHAR(4) NOT NULL,
  leg_b_size NUMERIC,
  leg_b_price NUMERIC,
  leg_b_fill_price NUMERIC,
  leg_b_oid BIGINT,
  leg_b_status VARCHAR(20) DEFAULT 'pending',
  status VARCHAR(20) DEFAULT 'pending',
  close_ts BIGINT,
  close_leg_a_price NUMERIC,
  close_leg_b_price NUMERIC,
  realized_pnl_bps NUMERIC,
  realized_pnl_usd NUMERIC,
  slippage_entry_bps NUMERIC,
  slippage_exit_bps NUMERIC,
  fees_usd NUMERIC,
  error_msg TEXT,
  error_cost_usd NUMERIC,
  target_exit_px_a NUMERIC,
  target_exit_px_b NUMERIC,
  target_profit_bps NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bt_status ON bot_trades (status);
CREATE INDEX IF NOT EXISTS idx_bt_pair_status ON bot_trades (pair_id, status);
CREATE INDEX IF NOT EXISTS idx_bt_entry_ts ON bot_trades (entry_ts);
