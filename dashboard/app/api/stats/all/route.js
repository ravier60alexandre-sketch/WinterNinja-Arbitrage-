import { readFileSync } from 'fs';
import { resolve } from 'path';

export const dynamic = 'force-dynamic';

const DB_PATH = resolve(process.cwd(), '..', 'data', 'spreads.db');
const LIVE_STATE_PATH = resolve(process.cwd(), '..', 'data', 'live-state.json');

let db = null;

function getDB() {
  if (!db) {
    try {
      const Database = require('better-sqlite3');
      db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
      db.pragma('journal_mode = WAL');
    } catch (e) {
      return null;
    }
  }
  return db;
}

function readLiveState() {
  try {
    return JSON.parse(readFileSync(LIVE_STATE_PATH, 'utf8'));
  } catch (e) {
    return null;
  }
}

function percentile(sortedArr, p) {
  if (sortedArr.length === 0) return null;
  const idx = Math.floor(sortedArr.length * p);
  return sortedArr[Math.min(idx, sortedArr.length - 1)];
}

const WINDOW_MS = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000
};

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const windowParam = searchParams.get('window') || '24h';

  const database = getDB();
  if (!database) {
    return Response.json({ error: 'Database not ready' }, { status: 503 });
  }

  const state = readLiveState();
  if (!state || !state.pairs) {
    return Response.json({ error: 'Collector not ready' }, { status: 503 });
  }

  const feeConfig = state.config && state.config.fee_assumptions || {};
  const totalFeeBps = (feeConfig.taker_fee_bps_per_leg || 1.5) * 2 + (feeConfig.slippage_buffer_bps || 1.0);
  const pairs = state.pairs;

  try {
    // 1) Get latest rolling stats for requested window — single query for ALL pairs
    const rawStats = database.prepare(`
      SELECT rs.* FROM rolling_stats rs
      INNER JOIN (
        SELECT pair_a, pair_b, window, direction, MAX(timestamp) as max_ts
        FROM rolling_stats
        WHERE window = ?
        GROUP BY pair_a, pair_b, direction
      ) latest ON rs.pair_a = latest.pair_a
        AND rs.pair_b = latest.pair_b
        AND rs.window = latest.window
        AND rs.direction = latest.direction
        AND rs.timestamp = latest.max_ts
    `).all(windowParam);

    // 2) Get latest observation per pair — single query using a window function
    const allLatestObs = database.prepare(`
      SELECT pair_a, pair_b, spread_1_bps, spread_2_bps, exec_size_1, exec_size_2, timestamp
      FROM spread_observations
      WHERE id IN (
        SELECT MAX(id) FROM spread_observations GROUP BY pair_a, pair_b
      )
    `).all();

    const latestObs = {};
    for (const obs of allLatestObs) {
      latestObs[`${obs.pair_a}|${obs.pair_b}`] = obs;
    }

    // 3) Compute MR metrics — single bulk query for all pairs at once
    const now = Date.now();
    const windowMs = WINDOW_MS[windowParam] || WINDOW_MS['24h'];
    const sinceTs = now - windowMs;

    const allSpreadRows = database.prepare(`
      SELECT pair_a, pair_b, spread_1_bps, spread_2_bps
      FROM spread_observations
      WHERE timestamp >= ?
      ORDER BY pair_a, pair_b, timestamp ASC
    `).all(sinceTs);

    // Group by pair
    const spreadsByPair = {};
    for (const row of allSpreadRows) {
      const key = `${row.pair_a}|${row.pair_b}`;
      if (!spreadsByPair[key]) spreadsByPair[key] = { d1: [], d2: [] };
      spreadsByPair[key].d1.push(row.spread_1_bps);
      spreadsByPair[key].d2.push(row.spread_2_bps);
    }

    // Compute MR for each pair from grouped data
    const mrMetrics = {};
    for (const [key, spreads] of Object.entries(spreadsByPair)) {
      mrMetrics[key] = {
        direction_1: computeMR(spreads.d1, totalFeeBps),
        direction_2: computeMR(spreads.d2, totalFeeBps)
      };
    }

    // 4) Build per-pair results
    const statsMap = {};
    for (const row of rawStats) {
      const key = `${row.pair_a}|${row.pair_b}`;
      if (!statsMap[key]) statsMap[key] = {};
      const dirKey = `direction_${row.direction}`;
      const mr = mrMetrics[key] && mrMetrics[key][dirKey];

      statsMap[key][dirKey] = {
        mean: row.mean_spread_bps,
        p50: row.median_spread_bps,
        p10: row.p10_spread_bps,
        p90: row.p90_spread_bps,
        stddev: row.stddev_spread_bps,
        max: row.max_spread_bps,
        min: row.min_spread_bps,
        edge_freq: row.edge_frequency,
        mean_reversion: row.mean_reversion_score,
        count: row.count,
        mr_edge_freq: mr ? mr.mr_edge_freq : null,
        amplitude: mr ? mr.amplitude : null,
        mr_entry_above: mr ? mr.mr_entry_above : null,
        mr_entry_below: mr ? mr.mr_entry_below : null
      };
    }

    const results = pairs.map(pair => {
      const key = `${pair.asset_a}|${pair.asset_b}`;
      const live = latestObs[key] || null;
      const pairStats = statsMap[key] || {};

      return {
        pair_a: pair.asset_a,
        pair_b: pair.asset_b,
        label: pair.label || `${pair.asset_a} / ${pair.asset_b}`,
        live: live ? {
          spread_1: live.spread_1_bps,
          spread_2: live.spread_2_bps,
          exec_1: live.exec_size_1,
          exec_2: live.exec_size_2,
          timestamp: live.timestamp
        } : null,
        direction_1: pairStats.direction_1 || null,
        direction_2: pairStats.direction_2 || null
      };
    });

    return Response.json({
      window: windowParam,
      fee_total_bps: totalFeeBps,
      pairs: results
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

function computeMR(values, totalFeeBps) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const med = percentile(sorted, 0.50);
  const p10 = percentile(sorted, 0.10);
  const p90 = percentile(sorted, 0.90);
  const amplitude = p90 - p10;
  const mrEdgeCount = values.filter(v => Math.abs(v - med) > totalFeeBps).length;

  return {
    mr_edge_freq: Math.round((mrEdgeCount / values.length) * 1000) / 1000,
    amplitude: Math.round(amplitude * 100) / 100,
    mr_entry_above: Math.round((med + totalFeeBps) * 100) / 100,
    mr_entry_below: Math.round((med - totalFeeBps) * 100) / 100
  };
}
