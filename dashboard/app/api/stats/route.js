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

    const stats = {};
    for (const row of rawStats) {
      if (!stats[row.window]) {
        stats[row.window] = {};
      }
      const dirKey = `direction_${row.direction}`;
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
        count: row.count
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
          conservative_bps: s.p90 !== null ? Math.round(s.p90 * 100) / 100 : null
        };
      }
    }

    const pairs = state && state.pairs || [];
    const pair = pairs.find(p => p.asset_a === pairA && p.asset_b === pairB);

    return Response.json({
      pair_a: pairA,
      pair_b: pairB,
      label: pair ? pair.label : `${pairA} / ${pairB}`,
      fee_total_bps: totalFeeBps,
      stats,
      recommendation
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
