const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 30000,
});

async function ensureTables() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bot_config (
        key VARCHAR(64) PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at BIGINT DEFAULT 0
      )
    `);
    await pool.query(`
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
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_edge_snap_pair_ts ON edge_snapshots (pair_id, ts)`);

    await pool.query(`
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
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_bt_status ON bot_trades (status)`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_bt_pair_status ON bot_trades (pair_id, status)`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_bt_entry_ts ON bot_trades (entry_ts)`).catch(() => {});

    await pool.query(`
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
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_repeg_pair ON repeg_cycles (pair_id)`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_repeg_open_ts ON repeg_cycles (open_ts)`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_repeg_success ON repeg_cycles (pair_id, success)`).catch(() => {});
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_repeg_unique ON repeg_cycles (pair_id, direction, open_ts)`).catch(() => {});

    await pool.query(`ALTER TABLE bot_trades ADD COLUMN IF NOT EXISTS target_exit_px_a NUMERIC`).catch(() => {});
    await pool.query(`ALTER TABLE bot_trades ADD COLUMN IF NOT EXISTS target_exit_px_b NUMERIC`).catch(() => {});
    await pool.query(`ALTER TABLE bot_trades ADD COLUMN IF NOT EXISTS target_profit_bps NUMERIC`).catch(() => {});
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bot_activity_log (
        id SERIAL PRIMARY KEY,
        ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        type TEXT,
        pair_id TEXT,
        direction INT,
        message TEXT
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_activity_log_ts ON bot_activity_log (ts DESC)`);
    await pool.query(`ALTER TABLE bot_activity_log ADD COLUMN IF NOT EXISTS latency_ms INTEGER`).catch(() => {});
    await pool.query(`ALTER TABLE bot_activity_log ADD COLUMN IF NOT EXISTS motif VARCHAR(64)`).catch(() => {});
    await pool.query(`ALTER TABLE bot_activity_log ADD COLUMN IF NOT EXISTS p50_used REAL`).catch(() => {});
    await pool.query(`ALTER TABLE bot_activity_log ADD COLUMN IF NOT EXISTS fees_estimate REAL`).catch(() => {});
    await pool.query(`ALTER TABLE bot_trades ADD COLUMN IF NOT EXISTS bot_id VARCHAR(16) DEFAULT 'bot1'`).catch(() => {});
    await pool.query(`ALTER TABLE bot_trades ADD COLUMN IF NOT EXISTS expected_fees_usd NUMERIC`).catch(() => {});
    await pool.query(`ALTER TABLE bot_trades ADD COLUMN IF NOT EXISTS as_1s REAL`).catch(() => {});
    await pool.query(`ALTER TABLE bot_trades ADD COLUMN IF NOT EXISTS as_3s REAL`).catch(() => {});
    await pool.query(`ALTER TABLE bot_trades ADD COLUMN IF NOT EXISTS as_5s REAL`).catch(() => {});
    await pool.query(`ALTER TABLE bot_activity_log ADD COLUMN IF NOT EXISTS bot_id VARCHAR(16) DEFAULT 'bot1'`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_bot_trades_botid ON bot_trades (bot_id)`).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS funding_snapshots (
        id SERIAL PRIMARY KEY,
        coin VARCHAR(64) NOT NULL,
        ts BIGINT NOT NULL,
        funding_rate REAL NOT NULL DEFAULT 0
      )
    `).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_funding_coin_ts ON funding_snapshots (coin, ts)`).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS book_snapshots (
        id SERIAL PRIMARY KEY,
        coin VARCHAR(64) NOT NULL,
        ts BIGINT NOT NULL,
        bid1 REAL, bid1_sz REAL,
        bid2 REAL, bid2_sz REAL,
        bid3 REAL, bid3_sz REAL,
        bid4 REAL, bid4_sz REAL,
        bid5 REAL, bid5_sz REAL,
        ask1 REAL, ask1_sz REAL,
        ask2 REAL, ask2_sz REAL,
        ask3 REAL, ask3_sz REAL,
        ask4 REAL, ask4_sz REAL,
        ask5 REAL, ask5_sz REAL
      )
    `).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_book_coin_ts ON book_snapshots (coin, ts)`).catch(() => {});

    const migKey = 'migration_pnl_gross_v10';
    const migCheck = await pool.query(`SELECT value FROM bot_config WHERE key = $1`, [migKey]);
    if (migCheck.rows.length === 0) {
      const migResult = await pool.query(
        `UPDATE bot_trades SET realized_pnl_usd = realized_pnl_usd + COALESCE(fees_usd, 0), 
                realized_pnl_bps = CASE WHEN (leg_a_fill_price * leg_a_size + leg_b_fill_price * leg_b_size) > 0 
                  THEN ((realized_pnl_usd + COALESCE(fees_usd, 0)) / (leg_a_fill_price * leg_a_size + leg_b_fill_price * leg_b_size)) * 10000
                  ELSE realized_pnl_bps + CASE WHEN (leg_a_fill_price * leg_a_size + leg_b_fill_price * leg_b_size) > 0 THEN (COALESCE(fees_usd,0) / (leg_a_fill_price * leg_a_size + leg_b_fill_price * leg_b_size)) * 10000 ELSE 0 END
                END
         WHERE status = 'closed' AND COALESCE(fees_usd, 0) > 0`
      );
      await pool.query(`INSERT INTO bot_config (key, value, updated_at) VALUES ($1, $2, $3)`, [migKey, 'done', Date.now()]);
      console.log(`[DB] Migration ${migKey}: converted ${migResult.rowCount} trades from NET to GROSS realized_pnl_usd`);
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS positions (
        id SERIAL PRIMARY KEY,
        pair_id VARCHAR(64) NOT NULL,
        bot_id VARCHAR(16) NOT NULL DEFAULT 'bot1',
        direction INTEGER,
        leg_a_coin VARCHAR(64),
        leg_b_coin VARCHAR(64),
        size NUMERIC DEFAULT 0,
        vwap_entry_a NUMERIC,
        vwap_entry_b NUMERIC,
        avg_slippage_bps NUMERIC DEFAULT 0,
        total_fills INTEGER DEFAULT 0,
        total_notional_usd NUMERIC DEFAULT 0,
        realized_pnl_usd NUMERIC DEFAULT 0,
        fees_usd NUMERIC DEFAULT 0,
        opened_at BIGINT,
        updated_at BIGINT,
        status VARCHAR(20) DEFAULT 'flat',
        UNIQUE(pair_id, bot_id)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_positions_status ON positions (status)`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_positions_botid ON positions (bot_id)`).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS position_fills (
        id SERIAL PRIMARY KEY,
        position_id INTEGER REFERENCES positions(id),
        pair_id VARCHAR(64),
        bot_id VARCHAR(16),
        fill_type VARCHAR(16),
        direction INTEGER,
        size NUMERIC,
        price_a NUMERIC,
        price_b NUMERIC,
        edge_bps NUMERIC,
        slippage_bps NUMERIC,
        pnl_usd NUMERIC,
        fees_usd NUMERIC,
        ts BIGINT
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_pfills_posid ON position_fills (position_id)`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_pfills_ts ON position_fills (ts DESC)`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_pfills_botid ON position_fills (bot_id)`).catch(() => {});

  } catch (err) {
    console.error('[DB] Error creating tables:', err.message);
  }
}

ensureTables();

async function saveCycle(pairId, cycle) {
  try {
    await pool.query(
      `INSERT INTO repeg_cycles (pair_id, direction, q, open_ts, close_ts, duration_ms, open_gross_edge_bps, close_gross_edge_bps, theoretical_pnl_bps, close_liquidity_ok, success)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (pair_id, direction, open_ts) DO NOTHING`,
      [pairId, cycle.direction, cycle.Q, cycle.openTs, cycle.closeTs, cycle.durationMs, cycle.openGrossEdgeBps, cycle.closeGrossEdgeBps, cycle.theoreticalPnlBps, cycle.closeLiquidityOk, cycle.success]
    );
  } catch (err) {
    console.error(`[DB] Error saving cycle for ${pairId}:`, err.message);
  }
}

async function loadCycles(pairId, limit = 500) {
  try {
    const res = await pool.query(
      `SELECT * FROM repeg_cycles WHERE pair_id = $1 ORDER BY open_ts DESC LIMIT $2`,
      [pairId, limit]
    );
    return res.rows.map(r => ({
      key: `d${r.direction}`,
      direction: r.direction,
      Q: parseFloat(r.q),
      openTs: parseInt(r.open_ts),
      closeTs: parseInt(r.close_ts),
      durationMs: parseInt(r.duration_ms),
      openGrossEdgeBps: parseFloat(r.open_gross_edge_bps),
      closeGrossEdgeBps: parseFloat(r.close_gross_edge_bps),
      theoreticalPnlBps: parseFloat(r.theoretical_pnl_bps),
      closeLiquidityOk: r.close_liquidity_ok,
      success: r.success,
    }));
  } catch (err) {
    console.error(`[DB] Error loading cycles for ${pairId}:`, err.message);
    return [];
  }
}

async function getCountsByPair() {
  try {
    const res = await pool.query(
      `SELECT pair_id, COUNT(*) as total, COUNT(*) FILTER (WHERE success = true) as profitable FROM repeg_cycles GROUP BY pair_id`
    );
    const counts = {};
    for (const r of res.rows) {
      counts[r.pair_id] = { total: parseInt(r.total), profitable: parseInt(r.profitable) };
    }
    return counts;
  } catch (err) {
    console.error('[DB] Error getting counts:', err.message);
    return {};
  }
}

async function getStatsByPair(pairId) {
  try {
    const res = await pool.query(
      `SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE success = true) as profitable,
        COUNT(*) FILTER (WHERE close_liquidity_ok = true) as repegged,
        COUNT(*) FILTER (WHERE close_liquidity_ok = false) as failed_liquidity,
        COALESCE(SUM(theoretical_pnl_bps) FILTER (WHERE close_liquidity_ok = true), 0) as total_pnl_bps,
        COALESCE(SUM(q), 0) as total_volume
      FROM repeg_cycles WHERE pair_id = $1`,
      [pairId]
    );
    const r = res.rows[0];
    return {
      total: parseInt(r.total),
      profitable: parseInt(r.profitable),
      repegged: parseInt(r.repegged),
      failedLiquidity: parseInt(r.failed_liquidity),
      totalPnlBps: parseFloat(r.total_pnl_bps),
      totalVolume: parseFloat(r.total_volume),
    };
  } catch (err) {
    console.error(`[DB] Error getting stats for ${pairId}:`, err.message);
    return { total: 0, profitable: 0, repegged: 0, failedLiquidity: 0, totalPnlBps: 0, totalVolume: 0 };
  }
}

async function saveBotConfig(key, value) {
  try {
    await pool.query(
      `INSERT INTO bot_config (key, value, updated_at) VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = $3`,
      [key, JSON.stringify(value), Date.now()]
    );
  } catch (err) {
    console.error(`[DB] Error saving bot config ${key}:`, err.message);
  }
}

async function loadBotConfig(key) {
  try {
    const res = await pool.query(`SELECT value FROM bot_config WHERE key = $1`, [key]);
    if (res.rows.length === 0) return null;
    return JSON.parse(res.rows[0].value);
  } catch (err) {
    console.error(`[DB] Error loading bot config ${key}:`, err.message);
    return null;
  }
}

async function saveEdgeSnapshot(pairId, data) {
  try {
    await pool.query(
      `INSERT INTO edge_snapshots (pair_id, ts, dir1_edge_bps, dir2_edge_bps, max_edge_bps, dir1_status, dir2_status, mid_a, mid_b)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [pairId, data.ts, data.dir1EdgeBps, data.dir2EdgeBps, data.maxEdgeBps, data.dir1Status, data.dir2Status, data.midA, data.midB]
    );
  } catch (err) {
    console.error(`[DB] Error saving edge snapshot for ${pairId}:`, err.message);
  }
}

async function getEdgeHistory(pairId, hoursBack = 24) {
  try {
    const since = Date.now() - hoursBack * 3600 * 1000;
    const res = await pool.query(
      `SELECT ts, dir1_edge_bps, dir2_edge_bps, max_edge_bps, dir1_status, dir2_status
       FROM edge_snapshots WHERE pair_id = $1 AND ts >= $2 ORDER BY ts ASC`,
      [pairId, since]
    );
    return res.rows;
  } catch (err) {
    console.error(`[DB] Error loading edge history for ${pairId}:`, err.message);
    return [];
  }
}

async function getEdgeStats() {
  try {
    const res = await pool.query(`
      SELECT 
        pair_id,
        COUNT(*) as samples,
        AVG(max_edge_bps) as avg_edge,
        MAX(max_edge_bps) as max_edge,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY max_edge_bps) as median_edge,
        PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY max_edge_bps) as p90_edge,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY max_edge_bps) as p95_edge,
        AVG(max_edge_bps) FILTER (WHERE max_edge_bps >= 7) as avg_edge_above_threshold,
        COUNT(*) FILTER (WHERE max_edge_bps >= 7) as samples_above_threshold
      FROM edge_snapshots
      GROUP BY pair_id ORDER BY avg_edge DESC
    `);
    return res.rows.map(r => ({
      pairId: r.pair_id,
      samples: parseInt(r.samples),
      avgEdgeBps: parseFloat(r.avg_edge),
      maxEdgeBps: parseFloat(r.max_edge),
      medianEdgeBps: parseFloat(r.median_edge),
      p90EdgeBps: parseFloat(r.p90_edge),
      p95EdgeBps: parseFloat(r.p95_edge),
      avgEdgeAboveThreshold: parseFloat(r.avg_edge_above_threshold || 0),
      samplesAboveThreshold: parseInt(r.samples_above_threshold || 0),
    }));
  } catch (err) {
    console.error('[DB] Error getting edge stats:', err.message);
    return [];
  }
}

async function getEdgeProfileByMinute(pairId) {
  try {
    const query = pairId
      ? `SELECT 
          pair_id,
          EXTRACT(HOUR FROM to_timestamp(ts / 1000.0) AT TIME ZONE 'UTC') * 60 + EXTRACT(MINUTE FROM to_timestamp(ts / 1000.0) AT TIME ZONE 'UTC') as minute_of_day,
          AVG(max_edge_bps) as avg_edge,
          MAX(max_edge_bps) as max_edge,
          AVG(dir1_edge_bps) as avg_dir1,
          AVG(dir2_edge_bps) as avg_dir2,
          MAX(dir1_edge_bps) as max_dir1,
          MAX(dir2_edge_bps) as max_dir2,
          COUNT(*) as samples,
          COUNT(*) FILTER (WHERE max_edge_bps >= 10) as samples_above_9,
          COUNT(*) FILTER (WHERE dir1_edge_bps >= 10) as d1_above_10,
          COUNT(*) FILTER (WHERE dir2_edge_bps >= 10) as d2_above_10
        FROM edge_snapshots WHERE pair_id = $1
        GROUP BY pair_id, minute_of_day ORDER BY minute_of_day`
      : `SELECT 
          pair_id,
          EXTRACT(HOUR FROM to_timestamp(ts / 1000.0) AT TIME ZONE 'UTC') * 60 + EXTRACT(MINUTE FROM to_timestamp(ts / 1000.0) AT TIME ZONE 'UTC') as minute_of_day,
          AVG(max_edge_bps) as avg_edge,
          MAX(max_edge_bps) as max_edge,
          AVG(dir1_edge_bps) as avg_dir1,
          AVG(dir2_edge_bps) as avg_dir2,
          MAX(dir1_edge_bps) as max_dir1,
          MAX(dir2_edge_bps) as max_dir2,
          COUNT(*) as samples,
          COUNT(*) FILTER (WHERE max_edge_bps >= 10) as samples_above_9,
          COUNT(*) FILTER (WHERE dir1_edge_bps >= 10) as d1_above_10,
          COUNT(*) FILTER (WHERE dir2_edge_bps >= 10) as d2_above_10
        FROM edge_snapshots
        GROUP BY pair_id, minute_of_day ORDER BY pair_id, minute_of_day`;
    const res = await pool.query(query, pairId ? [pairId] : []);
    return res.rows.map(r => ({
      pairId: r.pair_id,
      minuteOfDay: parseInt(r.minute_of_day),
      hour: Math.floor(parseInt(r.minute_of_day) / 60),
      minute: parseInt(r.minute_of_day) % 60,
      avgEdgeBps: parseFloat(r.avg_edge),
      maxEdgeBps: parseFloat(r.max_edge),
      avgDir1Bps: parseFloat(r.avg_dir1),
      avgDir2Bps: parseFloat(r.avg_dir2),
      maxDir1Bps: parseFloat(r.max_dir1),
      maxDir2Bps: parseFloat(r.max_dir2),
      samples: parseInt(r.samples),
      samplesAbove9: parseInt(r.samples_above_9 || 0),
      d1Above10: parseInt(r.d1_above_10 || 0),
      d2Above10: parseInt(r.d2_above_10 || 0),
    }));
  } catch (err) {
    console.error('[DB] Error getting edge profile:', err.message);
    return [];
  }
}

async function getEdgeExportCsv() {
  try {
    const res = await pool.query(
      `SELECT pair_id, ts, dir1_edge_bps, dir2_edge_bps, max_edge_bps, dir1_status, dir2_status, mid_a, mid_b
       FROM edge_snapshots ORDER BY ts ASC`
    );
    return res.rows;
  } catch (err) {
    console.error('[DB] Error exporting edge data:', err.message);
    return [];
  }
}

async function saveActivityLog(entry) {
  try {
    const msg = [entry.reason, entry.detail].filter(Boolean).join(' — ');
    await pool.query(
      `INSERT INTO bot_activity_log (ts, type, pair_id, direction, message, bot_id, latency_ms, motif, p50_used, fees_estimate) VALUES (TO_TIMESTAMP($1 / 1000.0), $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [entry.ts, entry.type, entry.pairId || null, entry.direction || null, msg || null, entry.botId || 'bot1', entry.latencyMs || null, entry.motif || null, entry.p50Used || null, entry.feesEstimate || null]
    );
  } catch (err) {
    console.error('[DB] Error saving activity log:', err.message);
  }
}

async function getActivityHistory(limit = 200, botId = 'bot1') {
  try {
    const res = await pool.query(
      `SELECT id, ts, type, pair_id, direction, message, latency_ms, motif, p50_used, fees_estimate FROM bot_activity_log WHERE bot_id = $2 ORDER BY ts DESC LIMIT $1`,
      [limit, botId]
    );
    return res.rows.map(r => ({
      id: r.id,
      ts: new Date(r.ts).getTime(),
      type: r.type,
      pairId: r.pair_id,
      direction: r.direction,
      message: r.message,
      latencyMs: r.latency_ms,
      motif: r.motif,
      p50Used: r.p50_used,
      feesEstimate: r.fees_estimate,
    }));
  } catch (err) {
    console.error('[DB] Error loading activity history:', err.message);
    return [];
  }
}

async function purgeOldActivityLogs(retentionDays = 7) {
  try {
    const res = await pool.query(`DELETE FROM bot_activity_log WHERE ts < NOW() - INTERVAL '${retentionDays} days'`);
    if (res.rowCount > 0) {
      console.log(`[DB] Purged ${res.rowCount} activity logs older than ${retentionDays}d`);
    }
  } catch (err) {
    console.error('[DB] Activity log purge error:', err.message);
  }
}

const EDGE_RETENTION_DAYS = parseInt(process.env.EDGE_RETENTION_DAYS) || 21;

async function purgeOldSnapshots(retentionDays = EDGE_RETENTION_DAYS) {
  try {
    const cutoff = Date.now() - retentionDays * 24 * 3600 * 1000;
    const res = await pool.query(`DELETE FROM edge_snapshots WHERE ts < $1`, [cutoff]);
    if (res.rowCount > 0) {
      console.log(`[DB] Purged ${res.rowCount} edge snapshots older than ${retentionDays}d`);
    }
  } catch (err) {
    console.error('[DB] Purge error:', err.message);
  }
}

purgeOldSnapshots();
purgeOldActivityLogs();
setInterval(() => purgeOldSnapshots(), 6 * 3600 * 1000);
setInterval(() => purgeOldActivityLogs(), 6 * 3600 * 1000);

async function getArbHoursProfile() {
  try {
    const windowMs = 3 * 24 * 3600 * 1000;
    const cutoff = Date.now() - windowMs;
    const res = await pool.query(`
      WITH recent AS (
        SELECT *,
          EXTRACT(DOW FROM to_timestamp(ts / 1000.0) AT TIME ZONE 'Europe/Paris')::int as dow,
          EXTRACT(HOUR FROM to_timestamp(ts / 1000.0) AT TIME ZONE 'Europe/Paris')::int as hour_utc
        FROM edge_snapshots WHERE ts >= $1
      ),
      day_floors AS (
        SELECT pair_id, dow,
          percentile_cont(0.50) WITHIN GROUP (ORDER BY dir1_edge_bps) as p50_d1,
          percentile_cont(0.50) WITHIN GROUP (ORDER BY dir2_edge_bps) as p50_d2
        FROM recent
        GROUP BY pair_id, dow
      ),
      hourly AS (
        SELECT 
          e.pair_id,
          e.dow,
          e.hour_utc,
          COUNT(*) as samples,
          AVG(e.dir1_edge_bps) as avg_d1,
          AVG(e.dir2_edge_bps) as avg_d2,
          MAX(e.dir1_edge_bps) as peak_d1,
          MAX(e.dir2_edge_bps) as peak_d2,
          percentile_cont(0.50) WITHIN GROUP (ORDER BY e.dir1_edge_bps) as p50_h_d1,
          percentile_cont(0.50) WITHIN GROUP (ORDER BY e.dir2_edge_bps) as p50_h_d2,
          f.p50_d1 as floor_d1,
          f.p50_d2 as floor_d2
        FROM recent e
        JOIN day_floors f ON f.pair_id = e.pair_id AND f.dow = e.dow
        GROUP BY e.pair_id, e.dow, e.hour_utc, f.p50_d1, f.p50_d2
      )
      SELECT 
        pair_id, dow, hour_utc, samples,
        ROUND(avg_d1::numeric, 2) as avg_d1,
        ROUND(avg_d2::numeric, 2) as avg_d2,
        ROUND(peak_d1::numeric, 2) as peak_d1,
        ROUND(peak_d2::numeric, 2) as peak_d2,
        ROUND(p50_h_d1::numeric, 2) as p50_d1,
        ROUND(p50_h_d2::numeric, 2) as p50_d2,
        ROUND(floor_d1::numeric, 2) as floor_d1,
        ROUND(floor_d2::numeric, 2) as floor_d2
      FROM hourly
      ORDER BY pair_id, dow, hour_utc
    `, [cutoff]);
    return res.rows;
  } catch (err) {
    console.error('[DB] getArbHoursProfile error:', err.message);
    return [];
  }
}

async function getActivityHistoryPaginated(options = {}) {
  try {
    const page = Math.max(1, parseInt(options.page) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(options.limit) || 100));
    const offset = (page - 1) * limit;
    const conditions = ['1=1'];
    const params = [];
    let idx = 1;

    if (options.botId) {
      conditions.push(`bot_id = $${idx++}`);
      params.push(options.botId);
    }
    if (options.pair) {
      conditions.push(`pair_id = $${idx++}`);
      params.push(options.pair);
    }
    if (options.type) {
      conditions.push(`type = $${idx++}`);
      params.push(options.type);
    }
    if (options.motif) {
      conditions.push(`motif = $${idx++}`);
      params.push(options.motif);
    }
    if (options.from) {
      conditions.push(`ts >= TO_TIMESTAMP($${idx++} / 1000.0)`);
      params.push(parseInt(options.from));
    }
    if (options.to) {
      conditions.push(`ts <= TO_TIMESTAMP($${idx++} / 1000.0)`);
      params.push(parseInt(options.to));
    }
    if (options.search) {
      conditions.push(`message ILIKE $${idx++}`);
      params.push(`%${options.search}%`);
    }

    const where = conditions.join(' AND ');

    const countRes = await pool.query(
      `SELECT COUNT(*) as total FROM bot_activity_log WHERE ${where}`,
      params
    );
    const total = parseInt(countRes.rows[0].total);

    const dataParams = [...params, limit, offset];
    const res = await pool.query(
      `SELECT id, ts, type, pair_id, direction, message, latency_ms, motif, p50_used, fees_estimate, bot_id
       FROM bot_activity_log WHERE ${where}
       ORDER BY ts DESC LIMIT $${idx++} OFFSET $${idx++}`,
      dataParams
    );

    return {
      entries: res.rows.map(r => ({
        id: r.id,
        ts: new Date(r.ts).getTime(),
        type: r.type,
        pairId: r.pair_id,
        direction: r.direction,
        message: r.message,
        latencyMs: r.latency_ms,
        motif: r.motif,
        p50Used: r.p50_used,
        feesEstimate: r.fees_estimate,
        botId: r.bot_id,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  } catch (err) {
    console.error('[DB] Error loading paginated activity history:', err.message);
    return { entries: [], total: 0, page: 1, limit: 100, totalPages: 0 };
  }
}

async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, saveCycle, loadCycles, getCountsByPair, getStatsByPair, saveBotConfig, loadBotConfig, saveEdgeSnapshot, getEdgeHistory, getEdgeStats, getEdgeProfileByMinute, getEdgeExportCsv, getArbHoursProfile, saveActivityLog, getActivityHistory, getActivityHistoryPaginated, withTransaction };
