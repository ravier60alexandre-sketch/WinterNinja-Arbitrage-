CREATE TABLE IF NOT EXISTS spread_observations (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp     INTEGER NOT NULL,
  pair_a        TEXT    NOT NULL,
  pair_b        TEXT    NOT NULL,
  spread_1_raw  REAL    NOT NULL,
  spread_1_bps  REAL    NOT NULL,
  exec_size_1   REAL    NOT NULL,
  spread_2_raw  REAL    NOT NULL,
  spread_2_bps  REAL    NOT NULL,
  exec_size_2   REAL    NOT NULL,
  bid_a         REAL    NOT NULL,
  ask_a         REAL    NOT NULL,
  bid_size_a    REAL    NOT NULL,
  ask_size_a    REAL    NOT NULL,
  bid_b         REAL    NOT NULL,
  ask_b         REAL    NOT NULL,
  bid_size_b    REAL    NOT NULL,
  ask_size_b    REAL    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_timestamp ON spread_observations(timestamp);
CREATE INDEX IF NOT EXISTS idx_pair ON spread_observations(pair_a, pair_b, timestamp);

CREATE TABLE IF NOT EXISTS rolling_stats (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp            INTEGER NOT NULL,
  pair_a               TEXT    NOT NULL,
  pair_b               TEXT    NOT NULL,
  window               TEXT    NOT NULL,
  direction            INTEGER NOT NULL,
  count                INTEGER NOT NULL,
  mean_spread_bps      REAL,
  median_spread_bps    REAL,
  p10_spread_bps       REAL,
  p90_spread_bps       REAL,
  stddev_spread_bps    REAL,
  max_spread_bps       REAL,
  min_spread_bps       REAL,
  edge_frequency       REAL,
  mean_reversion_score REAL,
  mr_edge_frequency    REAL,
  amplitude_bps        REAL
);

CREATE INDEX IF NOT EXISTS idx_rolling_stats_pair ON rolling_stats(pair_a, pair_b, window, direction, timestamp);

CREATE TABLE IF NOT EXISTS spread_ohlc (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp     INTEGER NOT NULL,
  pair_a        TEXT    NOT NULL,
  pair_b        TEXT    NOT NULL,
  direction     INTEGER NOT NULL,
  open_bps      REAL    NOT NULL,
  high_bps      REAL    NOT NULL,
  low_bps       REAL    NOT NULL,
  close_bps     REAL    NOT NULL,
  mean_bps      REAL    NOT NULL,
  count         INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ohlc_pair ON spread_ohlc(pair_a, pair_b, direction, timestamp);

CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY
);
