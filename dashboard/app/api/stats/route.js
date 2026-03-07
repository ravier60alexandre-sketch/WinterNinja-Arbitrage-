import { readFileSync } from 'fs';
import { resolve } from 'path';

export const dynamic = 'force-dynamic';

const DB_PATH = resolve(process.cwd(), '..', 'data', 'spreads.db');
const LIVE_STATE_PATH = resolve(process.cwd(), '..', 'data', 'live-state.json');

const WINDOW_MS = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000
};

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

function computeMRMetrics(database, pairA, pairB, totalFeeBps) {
  const now = Date.now();
  const results = {};

  for (const [windowName, windowMs] of Object.entries(WINDOW_MS)) {
    const sinceTs = now - windowMs;
    const rows = database.prepare(`
      SELECT spread_1_bps, spread_2_bps FROM spread_observations
      WHERE pair_a = ? AND pair_b = ? AND timestamp >= ?
      ORDER BY timestamp ASC
    `).all(pairA, pairB, sinceTs);

    if (rows.length === 0) continue;

    const d1 = rows.map(r => r.spread_1_bps);
    const d2 = rows.map(r => r.spread_2_bps);

    results[windowName] = {
      direction_1: computeMRForDirection(d1, totalFeeBps),
      direction_2: computeMRForDirection(d2, totalFeeBps)
    };
  }

  return results;
}

function computeMRForDirection(values, totalFeeBps) {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const med = percentile(sorted, 0.50);
  const p10 = percentile(sorted, 0.10);
  const p90 = percentile(sorted, 0.90);
  const amplitude = p90 - p10;

  // Mean reversion edge: % of time spread deviates from median by more than fees
  const mrEdgeCount = values.filter(v => Math.abs(v - med) > totalFeeBps).length;
  const mrEdgeFreq = mrEdgeCount / values.length;

  // Best theoretical MR profit: max deviation from median minus fees
  const maxDevAbove = Math.max(...values) - med;
  const maxDevBelow = med - Math.min(...values);
  const bestMRProfit = Math.max(maxDevAbove, maxDevBelow) - totalFeeBps;

  return {
    mr_edge_freq: Math.round(mrEdgeFreq * 1000) / 1000,
    amplitude: Math.round(amplitude * 100) / 100,
    best_mr_profit: Math.round(bestMRProfit * 100) / 100,
    median: Math.round(med * 100) / 100,
    mr_entry_above: Math.round((med + totalFeeBps) * 100) / 100,
    mr_entry_below: Math.round((med - totalFeeBps) * 100) / 100
  };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const pairA = searchParams.get('pair_a');
  const pairB = searchParams.get('pair_b');

  if (!pairA || !pairB) {
    return Response.json({ error: 'pair_a and pair_b are required' }, { status: 400 });
  }

  const database = getDB();
  if (!database) {
    return Response.json({ error: 'Database not ready' }, { status: 503 });
  }

  const state = readLiveState();
  const feeConfig = state && state.config && state.config.fee_assumptions || {};
  const totalFeeBps = (feeConfig.taker_fee_bps_per_leg || 1.5) * 2 + (feeConfig.slippage_buffer_bps || 1.0);

  try {
    const rawStats = database.prepare(`
      SELECT rs.* FROM rolling_stats rs
      INNER JOIN (
        SELECT pair_a, pair_b, window, direction, MAX(timestamp) as max_ts
        FROM rolling_stats
        WHERE pair_a = ? AND pair_b = ?
        GROUP BY window, direction
      ) latest ON rs.pair_a = latest.pair_a
        AND rs.pair_b = latest.pair_b
        AND rs.window = latest.window
        AND rs.direction = latest.direction
        AND rs.timestamp = latest.max_ts
    `).all(pairA, pairB);

    // Compute MR metrics from raw data
    const mrMetrics = computeMRMetrics(database, pairA, pairB, totalFeeBps);

    const stats = {};
    for (const row of rawStats) {
      if (!stats[row.window]) {
        stats[row.window] = {};
      }
      const dirKey = `direction_${row.direction}`;
      const mr = mrMetrics[row.window] && mrMetrics[row.window][dirKey];

      stats[row.window][dirKey] = {
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
        // New MR metrics
        mr_edge_freq: mr ? mr.mr_edge_freq : null,
        amplitude: mr ? mr.amplitude : null,
        best_mr_profit: mr ? mr.best_mr_profit : null,
        mr_entry_above: mr ? mr.mr_entry_above : null,
        mr_entry_below: mr ? mr.mr_entry_below : null
      };
    }

    const recommendation = {};
    const stats24h = stats['24h'] || {};
    for (const dir of ['direction_1', 'direction_2']) {
      const s = stats24h[dir];
      if (s) {
        recommendation[dir] = {
          entry_bps: s.p50 !== null ? Math.round((s.p50 + totalFeeBps) * 100) / 100 : null,
          aggressive_bps: s.p10 !== null ? Math.round((s.p10 + totalFeeBps) * 100) / 100 : null,
          conservative_bps: s.p90 !== null ? Math.round(s.p90 * 100) / 100 : null,
          // MR entry: enter when spread deviates from median by > fees
          mr_entry_above: s.mr_entry_above,
          mr_entry_below: s.mr_entry_below,
          amplitude: s.amplitude
        };
      }
    }

    // Best opportunity across both directions
    const bestOpportunity = findBestOpportunity(stats24h, totalFeeBps);

    const pairs = state && state.pairs || [];
    const pair = pairs.find(p => p.asset_a === pairA && p.asset_b === pairB);

    return Response.json({
      pair_a: pairA,
      pair_b: pairB,
      label: pair ? pair.label : `${pairA} / ${pairB}`,
      fee_total_bps: totalFeeBps,
      stats,
      recommendation,
      best_opportunity: bestOpportunity
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

function findBestOpportunity(stats24h, totalFeeBps) {
  const opportunities = [];

  for (const dir of ['direction_1', 'direction_2']) {
    const s = stats24h[dir];
    if (!s) continue;

    // Directional edge (classic)
    if (s.edge_freq !== null && s.edge_freq > 0) {
      opportunities.push({
        direction: dir,
        type: 'directional',
        edge_freq: s.edge_freq,
        expected_bps: s.p50 ? Math.max(s.p50 - totalFeeBps, 0) : 0
      });
    }

    // Mean reversion edge
    if (s.amplitude !== null && s.amplitude > totalFeeBps * 2) {
      opportunities.push({
        direction: dir,
        type: 'mean_reversion',
        edge_freq: s.mr_edge_freq || 0,
        expected_bps: s.amplitude ? Math.max(s.amplitude / 2 - totalFeeBps, 0) : 0,
        amplitude: s.amplitude
      });
    }
  }

  // Sort by expected profitability
  opportunities.sort((a, b) => b.expected_bps - a.expected_bps);
  return opportunities.length > 0 ? opportunities[0] : null;
}
