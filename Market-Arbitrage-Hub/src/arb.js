const { buyVWAP, sellVWAP, buyVWAPMulti, sellVWAPMulti, midPrice } = require('./orderbook');

const _spikeKeyCache = {};
function _getSpikeKey(dir, Q) {
  const k = (dir << 16) | Q;
  return _spikeKeyCache[k] || (_spikeKeyCache[k] = `d${dir}_Q${Q}`);
}

let _thresholdsCache = new WeakMap();

function clearThresholdsCache() {
  _thresholdsCache = new WeakMap();
}

function computeThresholds(config) {
  const cached = _thresholdsCache.get(config);
  if (cached) return cached;

  const takerFeeDefault = config.takerFee || 0.000082;
  const noGrowthFee = config.noGrowthTakerFee || 0.000432;
  const takerFeeA = config.growthModeA === false ? noGrowthFee : takerFeeDefault;
  const takerFeeB = config.growthModeB === false ? noGrowthFee : takerFeeDefault;
  const feeOpenBps = (takerFeeA + takerFeeB) * 10000;
  const feeRoundTripBps = 2 * (takerFeeA + takerFeeB) * 10000;
  const slippageBufferOpenBps = config.slippageBufferOpenBps ?? 2;
  const slippageBufferRoundTripBps = config.slippageBufferRoundTripBps ?? 4;
  const safetySpreadBps = config.safetySpreadBps ?? 0;
  const minEdgeOpenBps = config.minEdgeOpenBpsOverride ?? (feeOpenBps + slippageBufferOpenBps);
  const minEdgeRoundTripBps = feeRoundTripBps + slippageBufferRoundTripBps;

  const result = {
    takerFeeA,
    takerFeeB,
    feeOpenBps,
    feeRoundTripBps,
    slippageBufferOpenBps,
    slippageBufferRoundTripBps,
    minEdgeOpenBps,
    minEdgeRoundTripBps,
    safetySpreadBps,
  };
  _thresholdsCache.set(config, result);
  return result;
}

function computeMicrostructure(bookA, bookB, midA, midB, midRef, Q, maxLevels) {
  const bA = buyVWAP(bookA.asks, Q, maxLevels);
  const sA = sellVWAP(bookA.bids, Q, maxLevels);
  const bB = buyVWAP(bookB.asks, Q, maxLevels);
  const sB = sellVWAP(bookB.bids, Q, maxLevels);

  const intraCostA = (bA && sA) ? (bA.vwap - sA.vwap) : null;
  const intraCostB = (bB && sB) ? (bB.vwap - sB.vwap) : null;
  const intraCostAbps = intraCostA !== null ? (intraCostA / midA) * 10000 : null;
  const intraCostBbps = intraCostB !== null ? (intraCostB / midB) * 10000 : null;

  const midSpreadBps = 10000 * ((midA / midB) - 1);

  const edgeLong = (sB && bA) ? sB.vwap - bA.vwap : null;
  const edgeShort = (sA && bB) ? sA.vwap - bB.vwap : null;
  const edgeLongBps = edgeLong !== null ? (edgeLong / midRef) * 10000 : null;
  const edgeShortBps = edgeShort !== null ? (edgeShort / midRef) * 10000 : null;

  const bestEdge = Math.max(edgeLongBps ?? -Infinity, edgeShortBps ?? -Infinity);
  const arbImpossible = bestEdge < 0;
  const arbReason = arbImpossible ? 'INTRA_SPREAD_TOO_WIDE' : null;

  return {
    buyVwapA: bA?.vwap ?? null,
    sellVwapA: sA?.vwap ?? null,
    intraCostAbps,
    buyVwapB: bB?.vwap ?? null,
    sellVwapB: sB?.vwap ?? null,
    intraCostBbps,
    midSpreadBps,
    edgeLongBps,
    edgeShortBps,
    bestEdgeBps: bestEdge === -Infinity ? null : bestEdge,
    arbImpossible,
    arbReason,
  };
}

function computeMetrics(bookA, bookB, config, store) {
  const notionals = config.notionals || [50, 100, 150];
  const maxSlippageBps = config.maxSlippageBps ?? 8;
  const maxLevels = config.maxLevelsToConsume ?? 10;
  const minSpikeMs = config.minSpikeMs ?? 1000;
  const isZScoreMode = !!config.isZScoreMode;
  const thresholds = computeThresholds(config);

  const bidsA = bookA.bids;
  const asksA = bookA.asks;
  const bidsB = bookB.bids;
  const asksB = bookB.asks;
  if (!bidsA.length || !asksA.length || !bidsB.length || !asksB.length) {
    return { error: 'Missing mid price', midA: null, midB: null, results: [], thresholds };
  }

  const midA = (bidsA[0].px + asksA[0].px) * 0.5;
  const midB = (bidsB[0].px + asksB[0].px) * 0.5;
  const midRef = (midA + midB) * 0.5;
  const invMidRef = 10000 / midRef;
  const midSpreadBps = (midA - midB) * invMidRef;
  const ts = Date.now();

  const bestAskA = asksA[0].px;
  const bestBidA = bidsA[0].px;
  const bestAskB = asksB[0].px;
  const bestBidB = bidsB[0].px;
  const bestEdgeLongApprox = (bestBidB - bestAskA) * invMidRef;
  const bestEdgeShortApprox = (bestBidA - bestAskB) * invMidRef;
  const bestPossibleEdge = Math.max(bestEdgeLongApprox, bestEdgeShortApprox);

  const fastRejectThreshold = -5;
  if (bestPossibleEdge < fastRejectThreshold) {
    const fastMicro = {
      buyVwapA: null, sellVwapA: null, intraCostAbps: null,
      buyVwapB: null, sellVwapB: null, intraCostBbps: null,
      midSpreadBps, edgeLongBps: bestEdgeLongApprox, edgeShortBps: bestEdgeShortApprox,
      bestEdgeBps: bestPossibleEdge, arbImpossible: bestPossibleEdge < 0,
      arbReason: 'FAST_REJECT_NEGATIVE_EDGE',
    };
    const results = [];
    for (let i = 0; i < notionals.length; i++) {
      const Q = notionals[i];
      const spikeKey1 = _getSpikeKey(1, Q);
      const spikeKey2 = _getSpikeKey(2, Q);
      if (store) { store.updateSpike(spikeKey1, ts, false); store.updateSpike(spikeKey2, ts, false); }
      results.push({
        Q,
        dir1: { direction: 1, Q, capacityOk: false, status: 'INSUFFICIENT_DEPTH', reason: 'fast-path rejection' },
        dir2: { direction: 2, Q, capacityOk: false, status: 'INSUFFICIENT_DEPTH', reason: 'fast-path rejection' },
        micro: fastMicro,
      });
    }
    return { midA, midB, midRef, ts, thresholds, results, fastRejected: true };
  }

  const bAarr = buyVWAPMulti(asksA, notionals, maxLevels);
  const sAarr = sellVWAPMulti(bidsA, notionals, maxLevels);
  const bBarr = buyVWAPMulti(asksB, notionals, maxLevels);
  const sBarr = sellVWAPMulti(bidsB, notionals, maxLevels);

  const results = [];
  for (let i = 0; i < notionals.length; i++) {
    const Q = notionals[i];
    const bA = bAarr[i];
    const sA = sAarr[i];
    const bB = bBarr[i];
    const sB = sBarr[i];

    const intraCostAbps = (bA && sA) ? (bA.vwap - sA.vwap) * invMidRef : null;
    const intraCostBbps = (bB && sB) ? (bB.vwap - sB.vwap) * invMidRef : null;
    const edgeLongBps = (sB && bA) ? (sB.vwap - bA.vwap) * invMidRef : null;
    const edgeShortBps = (sA && bB) ? (sA.vwap - bB.vwap) * invMidRef : null;
    const bestEdge = Math.max(edgeLongBps ?? -Infinity, edgeShortBps ?? -Infinity);

    const micro = {
      buyVwapA: bA?.vwap ?? null,
      sellVwapA: sA?.vwap ?? null,
      intraCostAbps,
      buyVwapB: bB?.vwap ?? null,
      sellVwapB: sB?.vwap ?? null,
      intraCostBbps,
      midSpreadBps,
      edgeLongBps,
      edgeShortBps,
      bestEdgeBps: bestEdge === -Infinity ? null : bestEdge,
      arbImpossible: bestEdge < 0,
      arbReason: bestEdge < 0 ? 'INTRA_SPREAD_TOO_WIDE' : null,
    };

    const dir1 = computeDirection(1, sB, bA, Q, midRef, thresholds, maxSlippageBps, maxLevels, minSpikeMs, store, ts, invMidRef, isZScoreMode);
    const dir2 = computeDirection(2, sA, bB, Q, midRef, thresholds, maxSlippageBps, maxLevels, minSpikeMs, store, ts, invMidRef, isZScoreMode);

    results.push({ Q, dir1, dir2, micro });
  }

  return {
    midA,
    midB,
    midRef,
    ts,
    thresholds,
    results,
  };
}

function computeDirection(dir, sellResult, buyResult, Q, midRef, thresholds, maxSlippageBps, maxLevels, minSpikeMs, store, ts, invMidRef, isZScoreMode) {
  const spikeKey = _getSpikeKey(dir, Q);
  const inv = invMidRef || (10000 / midRef);

  if (!sellResult || !buyResult) {
    if (store) store.updateSpike(spikeKey, ts, false);
    return { direction: dir, Q, capacityOk: false, status: 'INSUFFICIENT_DEPTH', reason: 'no book data' };
  }

  if (!buyResult.capacity || !sellResult.capacity) {
    if (store) store.updateSpike(spikeKey, ts, false);
    return {
      direction: dir, Q,
      capacityOk: false,
      status: 'INSUFFICIENT_DEPTH',
      reason: `depth insufficient (buy ${buyResult.filledPct?.toFixed(0)}%, sell ${sellResult.filledPct?.toFixed(0)}%)`,
      buyVWAP: buyResult.vwap,
      sellVWAP: sellResult.vwap,
      levelsConsumedBuy: buyResult.levelsConsumed,
      levelsConsumedSell: sellResult.levelsConsumed,
    };
  }

  const buySlippageBps = (buyResult.vwap - buyResult.bestPrice) * inv;
  const sellSlippageBps = (sellResult.bestPrice - sellResult.vwap) * inv;

  let capacityOk = true;
  let capacityReason = null;
  if (buyResult.levelsConsumed > maxLevels || sellResult.levelsConsumed > maxLevels) {
    capacityOk = false;
    capacityReason = 'TOO_MANY_LEVELS';
  } else if (buySlippageBps > maxSlippageBps || sellSlippageBps > maxSlippageBps) {
    capacityOk = false;
    capacityReason = 'TOO_MUCH_SLIPPAGE';
  }

  const grossOpenEdgeBps = (sellResult.vwap - buyResult.vwap) * inv;
  const netOpenEdgeBps = grossOpenEdgeBps - thresholds.feeOpenBps - thresholds.slippageBufferOpenBps;
  const netRoundTripBps = grossOpenEdgeBps - thresholds.feeRoundTripBps - thresholds.slippageBufferRoundTripBps;

  const edgeAboveThreshold = grossOpenEdgeBps >= thresholds.minEdgeOpenBps;

  if (store) {
    store.addEdgeSample(spikeKey, ts, grossOpenEdgeBps);
    store.updateSpike(spikeKey, ts, edgeAboveThreshold && capacityOk);
  }

  let zScoreShort = 0, kalmanZ = 0, zScoreLong = 0, kalmanZLong = 0, ewmaDelta = 0, stdBps = 0;
  if (store && store.getZScores) {
    const zs = store.getZScores(dir);
    zScoreShort = zs.short.staticZ;
    kalmanZ = zs.short.kalmanZ;
    zScoreLong = zs.long.staticZ;
    kalmanZLong = zs.long.kalmanZ;
    ewmaDelta = zs.short.ewmaDelta || 0;
    stdBps = zs.short.stdBps || 0;
  }

  const spikeInfo = store ? store.getSpikeInfo(spikeKey) : { currentDurationMs: 0, count: 0, fired: false };
  const spikeLongEnough = spikeInfo.currentDurationMs >= minSpikeMs;

  let status;
  if (!capacityOk) {
    status = capacityReason;
  } else {
    status = 'Z_CANDIDATE';
  }

  return {
    direction: dir, Q,
    capacityOk,
    buyVWAP: buyResult.vwap,
    sellVWAP: sellResult.vwap,
    buyBestPx: buyResult.bestPrice,
    sellBestPx: sellResult.bestPrice,
    levelsConsumedBuy: buyResult.levelsConsumed,
    levelsConsumedSell: sellResult.levelsConsumed,
    buySlippageBps,
    sellSlippageBps,
    grossOpenEdgeBps,
    feeOpenBps: thresholds.feeOpenBps,
    netOpenEdgeBps,
    netRoundTripBps,
    minEdgeOpenBps: thresholds.minEdgeOpenBps,
    spikeDurationMs: spikeInfo.currentDurationMs,
    spikeCount: spikeInfo.count,
    status,
    zScore: zScoreShort,
    kalmanZ,
    ewmaDelta,
    zScoreLong,
    kalmanZLong,
    stdBps,
  };
}

function extractSignals(metrics) {
  const signals = [];
  if (!metrics || !metrics.results) return signals;
  const ts = metrics.ts;

  for (const r of metrics.results) {
    for (const d of [r.dir1, r.dir2]) {
      if (d.status === 'TRADEABLE' || d.status === 'Z_CANDIDATE') {
        signals.push({
          ts,
          status: d.status,
          direction: d.direction,
          Q: d.Q,
          buyVWAP: d.buyVWAP,
          sellVWAP: d.sellVWAP,
          buyBestPx: d.buyBestPx,
          sellBestPx: d.sellBestPx,
          grossOpenEdgeBps: d.grossOpenEdgeBps,
          netOpenEdgeBps: d.netOpenEdgeBps,
          feeOpenBps: d.feeOpenBps,
          buySlippageBps: d.buySlippageBps,
          sellSlippageBps: d.sellSlippageBps,
          levelsConsumedBuy: d.levelsConsumedBuy,
          levelsConsumedSell: d.levelsConsumedSell,
          spikeDurationMs: d.spikeDurationMs,
          zScore: d.zScore,
          kalmanZ: d.kalmanZ,
          ewmaDelta: d.ewmaDelta,
          zScoreLong: d.zScoreLong,
          kalmanZLong: d.kalmanZLong,
          stdBps: d.stdBps,
        });
      }
    }
  }

  return signals;
}

module.exports = { computeMetrics, extractSignals, computeThresholds, computeMicrostructure, clearThresholdsCache };
