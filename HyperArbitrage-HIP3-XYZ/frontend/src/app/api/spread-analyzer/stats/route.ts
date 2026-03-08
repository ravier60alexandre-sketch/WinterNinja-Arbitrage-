import { readFileSync } from "fs";
import { resolve } from "path";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const DB_PATH = resolve(process.cwd(), "..", "..", "data", "spreads.db");
const LIVE_STATE_PATH = resolve(process.cwd(), "..", "..", "data", "live-state.json");

const WINDOW_MS: Record<string, number> = {
  "1h": 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "12h": 12 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

let db: any = null;

function getDB() {
  if (!db) {
    try {
      const Database = require("better-sqlite3");
      db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
      db.pragma("journal_mode = WAL");
    } catch {
      return null;
    }
  }
  return db;
}

function readLiveState() {
  try {
    return JSON.parse(readFileSync(LIVE_STATE_PATH, "utf8"));
  } catch {
    return null;
  }
}

function percentile(sortedArr: number[], p: number): number | null {
  if (sortedArr.length === 0) return null;
  const idx = Math.floor(sortedArr.length * p);
  return sortedArr[Math.min(idx, sortedArr.length - 1)];
}

function computeMRForDirection(values: number[], totalFeeBps: number) {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const med = percentile(sorted, 0.5)!;
  const p10 = percentile(sorted, 0.1)!;
  const p90 = percentile(sorted, 0.9)!;
  const amplitude = p90 - p10;

  const mrEdgeCount = values.filter((v) => Math.abs(v - med) > totalFeeBps).length;
  const mrEdgeFreq = mrEdgeCount / values.length;

  const maxDevAbove = Math.max(...values) - med;
  const maxDevBelow = med - Math.min(...values);
  const bestMRProfit = Math.max(maxDevAbove, maxDevBelow) - totalFeeBps;

  return {
    mr_edge_freq: Math.round(mrEdgeFreq * 1000) / 1000,
    amplitude: Math.round(amplitude * 100) / 100,
    best_mr_profit: Math.round(bestMRProfit * 100) / 100,
    median: Math.round(med * 100) / 100,
    mr_entry_above: Math.round((med + totalFeeBps) * 100) / 100,
    mr_entry_below: Math.round((med - totalFeeBps) * 100) / 100,
  };
}

function computeMRMetrics(database: any, pairA: string, pairB: string, totalFeeBps: number) {
  const now = Date.now();
  const results: Record<string, any> = {};

  for (const [windowName, windowMs] of Object.entries(WINDOW_MS)) {
    const sinceTs = now - windowMs;
    const rows = database
      .prepare(`SELECT spread_1_bps, spread_2_bps FROM spread_observations WHERE pair_a = ? AND pair_b = ? AND timestamp >= ? ORDER BY timestamp ASC`)
      .all(pairA, pairB, sinceTs);

    if (rows.length === 0) continue;

    const d1 = rows.map((r: any) => r.spread_1_bps);
    const d2 = rows.map((r: any) => r.spread_2_bps);

    results[windowName] = {
      direction_1: computeMRForDirection(d1, totalFeeBps),
      direction_2: computeMRForDirection(d2, totalFeeBps),
    };
  }

  return results;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const pairA = searchParams.get("pair_a");
  const pairB = searchParams.get("pair_b");

  if (!pairA || !pairB) {
    return NextResponse.json({ error: "pair_a and pair_b are required" }, { status: 400 });
  }

  const database = getDB();
  if (!database) {
    return NextResponse.json({ error: "Database not ready" }, { status: 503 });
  }

  const state = readLiveState();
  const feeConfig = state?.config?.fee_assumptions || {};
  const totalFeeBps = (feeConfig.taker_fee_bps_per_leg || 1.5) * 2 + (feeConfig.slippage_buffer_bps || 1.0);

  try {
    const rawStats = database
      .prepare(
        `SELECT rs.* FROM rolling_stats rs
         INNER JOIN (
           SELECT pair_a, pair_b, window, direction, MAX(timestamp) as max_ts
           FROM rolling_stats WHERE pair_a = ? AND pair_b = ? GROUP BY window, direction
         ) latest ON rs.pair_a = latest.pair_a AND rs.pair_b = latest.pair_b
           AND rs.window = latest.window AND rs.direction = latest.direction
           AND rs.timestamp = latest.max_ts`
      )
      .all(pairA, pairB);

    const mrMetrics = computeMRMetrics(database, pairA, pairB, totalFeeBps);

    const stats: Record<string, any> = {};
    for (const row of rawStats) {
      if (!stats[row.window]) stats[row.window] = {};
      const dirKey = `direction_${row.direction}`;
      const mr = mrMetrics[row.window]?.[dirKey];

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
        mr_edge_freq: mr?.mr_edge_freq ?? null,
        amplitude: mr?.amplitude ?? null,
        best_mr_profit: mr?.best_mr_profit ?? null,
        mr_entry_above: mr?.mr_entry_above ?? null,
        mr_entry_below: mr?.mr_entry_below ?? null,
      };
    }

    const stats24h = stats["24h"] || {};
    const bestOpportunity = findBestOpportunity(stats24h, totalFeeBps);

    const pairs = state?.pairs || [];
    const pair = pairs.find((p: any) => p.asset_a === pairA && p.asset_b === pairB);

    return NextResponse.json({
      pair_a: pairA,
      pair_b: pairB,
      label: pair?.label || `${pairA} / ${pairB}`,
      fee_total_bps: totalFeeBps,
      stats,
      best_opportunity: bestOpportunity,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

function findBestOpportunity(stats24h: any, totalFeeBps: number) {
  const opportunities: any[] = [];

  for (const dir of ["direction_1", "direction_2"]) {
    const s = stats24h[dir];
    if (!s) continue;

    if (s.edge_freq !== null && s.edge_freq > 0) {
      opportunities.push({
        direction: dir,
        type: "directional",
        edge_freq: s.edge_freq,
        expected_bps: s.p50 ? Math.max(s.p50 - totalFeeBps, 0) : 0,
      });
    }

    if (s.amplitude !== null && s.amplitude > totalFeeBps * 2) {
      opportunities.push({
        direction: dir,
        type: "mean_reversion",
        edge_freq: s.mr_edge_freq || 0,
        expected_bps: s.amplitude ? Math.max(s.amplitude / 2 - totalFeeBps, 0) : 0,
        amplitude: s.amplitude,
      });
    }
  }

  opportunities.sort((a, b) => b.expected_bps - a.expected_bps);
  return opportunities.length > 0 ? opportunities[0] : null;
}
