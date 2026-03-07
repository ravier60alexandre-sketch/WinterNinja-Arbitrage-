const db = require('../database');

const WINDOW_MS = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000
};

function percentile(sortedArr, p) {
  if (sortedArr.length === 0) return null;
  const idx = Math.floor(sortedArr.length * p);
  return sortedArr[Math.min(idx, sortedArr.length - 1)];
}

function mean(arr) {
  if (arr.length === 0) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stddev(arr, avg) {
  if (arr.length === 0) return null;
  const sqDiffs = arr.map(v => (v - avg) * (v - avg));
  return Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / arr.length);
}

function autocorrelationLag1(values) {
  if (values.length < 3) return null;

  const n = values.length - 1;
  const x = values.slice(0, n);
  const y = values.slice(1);

  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let denX = 0;
  let denY = 0;

  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  const den = Math.sqrt(denX * denY);
  if (den === 0) return 0;

  return num / den;
}

function computeStatsForWindow(values, totalFeeBps) {
  if (values.length === 0) {
    return {
      count: 0,
      mean_spread_bps: null,
      median_spread_bps: null,
      p10_spread_bps: null,
      p90_spread_bps: null,
      stddev_spread_bps: null,
      max_spread_bps: null,
      min_spread_bps: null,
      edge_frequency: null,
      mean_reversion_score: null,
      mr_edge_frequency: null,
      amplitude_bps: null
    };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const avg = mean(values);
  const med = percentile(sorted, 0.50);

  // Classic edge: spread > fees (directional arbitrage)
  const edgeCount = values.filter(v => v > totalFeeBps).length;

  // Mean reversion edge: deviation from median > fees (both directions)
  // If spread deviates from its median by more than the fee cost, that's a MR opportunity
  const mrEdgeCount = values.filter(v => Math.abs(v - med) > totalFeeBps).length;

  // Amplitude: P90 - P10 range (tradeable range)
  const p10 = percentile(sorted, 0.10);
  const p90 = percentile(sorted, 0.90);
  const amplitude = p90 !== null && p10 !== null ? p90 - p10 : null;

  return {
    count: values.length,
    mean_spread_bps: Math.round(avg * 100) / 100,
    median_spread_bps: Math.round(med * 100) / 100,
    p10_spread_bps: Math.round(p10 * 100) / 100,
    p90_spread_bps: Math.round(p90 * 100) / 100,
    stddev_spread_bps: Math.round(stddev(values, avg) * 100) / 100,
    max_spread_bps: Math.round(Math.max(...values) * 100) / 100,
    min_spread_bps: Math.round(Math.min(...values) * 100) / 100,
    edge_frequency: Math.round((edgeCount / values.length) * 1000) / 1000,
    mean_reversion_score: Math.round((autocorrelationLag1(values) || 0) * 1000) / 1000,
    mr_edge_frequency: Math.round((mrEdgeCount / values.length) * 1000) / 1000,
    amplitude_bps: amplitude !== null ? Math.round(amplitude * 100) / 100 : null
  };
}

function updateStats(pairs, config) {
  const now = Date.now();
  const windows = config.rolling_windows || ['1h', '6h', '12h', '24h', '7d'];
  const fees = config.fee_assumptions || {};
  const totalFeeBps = (fees.taker_fee_bps_per_leg || 1.5) * 2 + (fees.slippage_buffer_bps || 1.0);

  for (const pair of pairs) {
    for (const windowName of windows) {
      const windowMs = WINDOW_MS[windowName];
      if (!windowMs) continue;

      const sinceTs = now - windowMs;
      const rows = db.getSpreadValues(pair.asset_a, pair.asset_b, sinceTs);

      if (rows.length === 0) continue;

      const d1Values = rows.map(r => r.spread_1_bps);
      const d2Values = rows.map(r => r.spread_2_bps);

      const stats1 = computeStatsForWindow(d1Values, totalFeeBps);
      const stats2 = computeStatsForWindow(d2Values, totalFeeBps);

      db.insertStats({
        timestamp: now,
        pair_a: pair.asset_a,
        pair_b: pair.asset_b,
        window: windowName,
        direction: 1,
        ...stats1
      });

      db.insertStats({
        timestamp: now,
        pair_a: pair.asset_a,
        pair_b: pair.asset_b,
        window: windowName,
        direction: 2,
        ...stats2
      });
    }
  }
}

module.exports = { updateStats, computeStatsForWindow, WINDOW_MS };
