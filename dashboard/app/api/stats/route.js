export const dynamic = 'force-dynamic';

let dbRef = null;
let collectorRef = null;

function getDB() {
  if (!dbRef) {
    try { dbRef = require('../../../database'); } catch (e) {}
  }
  return dbRef;
}

function getCollector() {
  if (!collectorRef) {
    try { collectorRef = require('../../../collector'); } catch (e) {}
  }
  return collectorRef;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const pairA = searchParams.get('pair_a');
  const pairB = searchParams.get('pair_b');

  if (!pairA || !pairB) {
    return Response.json({ error: 'pair_a and pair_b are required' }, { status: 400 });
  }

  const db = getDB();
  if (!db) {
    return Response.json({ error: 'Database not ready' }, { status: 503 });
  }

  const collector = getCollector();
  const config = collector ? collector.getConfig() : {};
  const fees = config.fee_assumptions || {};
  const totalFeeBps = (fees.taker_fee_bps_per_leg || 1.5) * 2 + (fees.slippage_buffer_bps || 1.0);

  try {
    const rawStats = db.getLatestStats(pairA, pairB);

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

    // Compute recommendation from 24h stats
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

    // Find label from active pairs
    const activePairs = collector ? collector.getActivePairs() : [];
    const pair = activePairs.find(p => p.asset_a === pairA && p.asset_b === pairB);

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
