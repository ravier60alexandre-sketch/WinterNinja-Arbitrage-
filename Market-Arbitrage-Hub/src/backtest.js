const fs = require('fs');
const path = require('path');

function loadSignalCsv(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, 'utf-8').trim();
  const lines = raw.split('\n');
  if (lines.length < 2) return [];

  const header = lines[0].split(',');
  const signals = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols.length < header.length) continue;

    const obj = {};
    for (let j = 0; j < header.length; j++) {
      const key = header[j].trim();
      const val = cols[j].trim();
      if (key === 'ts') {
        obj[key] = val;
        obj.tsMs = new Date(val).getTime();
      } else if (key === 'direction' || key === 'Q' || key === 'levelsConsumedBuy' || key === 'levelsConsumedSell') {
        obj[key] = parseInt(val) || 0;
      } else {
        obj[key] = parseFloat(val) || 0;
      }
    }
    signals.push(obj);
  }

  return signals;
}

function deduplicateSignals(signals) {
  const seen = new Map();
  const deduped = [];

  for (const s of signals) {
    const key = `${s.tsMs}_${s.direction}_${s.Q}`;
    if (!seen.has(key)) {
      seen.set(key, true);
      deduped.push(s);
    }
  }

  return deduped;
}

function groupSignalsBySpike(signals) {
  signals.sort((a, b) => a.tsMs - b.tsMs);

  const spikes = [];
  let currentSpike = null;
  const MAX_GAP_MS = 5000;

  for (const s of signals) {
    const key = `d${s.direction}`;

    if (!currentSpike || currentSpike.direction !== s.direction || (s.tsMs - currentSpike.lastTs) > MAX_GAP_MS) {
      if (currentSpike) spikes.push(currentSpike);
      currentSpike = {
        direction: s.direction,
        firstTs: s.tsMs,
        lastTs: s.tsMs,
        signals: [s],
        bestSignal: s,
        Q: s.Q,
      };
    } else {
      currentSpike.lastTs = s.tsMs;
      currentSpike.signals.push(s);
      if (s.grossOpenEdgeBps > currentSpike.bestSignal.grossOpenEdgeBps) {
        currentSpike.bestSignal = s;
      }
    }
  }
  if (currentSpike) spikes.push(currentSpike);

  return spikes;
}

function runBacktest(pairId, config = {}) {
  const csvDir = path.join(__dirname, '..', 'data', 'csv');
  const csvPath = path.join(csvDir, `signals_${pairId}.csv`);
  const rawSignals = loadSignalCsv(csvPath);

  if (rawSignals.length === 0) {
    return {
      pairId,
      error: 'No signal data available',
      totalSignals: 0,
    };
  }

  const takerFee = config.takerFee || 0.000082;
  const feeOpenBps = 2 * takerFee * 10000;
  const feeRoundTripBps = 4 * takerFee * 10000;
  const latencyMs = config.latencyMs || 150;
  const latencySlippageBps = config.latencySlippageBps || 0.5;
  const repegCloseThresholdBps = config.repegCloseThresholdBps || 1.0;
  const leverage = config.leverage || 4;
  const positionSizeUsd = config.positionSizeUsd || 50;
  const marginPerTrade = positionSizeUsd / leverage;

  const q50Signals = rawSignals.filter(s => s.Q === 50);
  const uniqueSignals = deduplicateSignals(q50Signals);

  const spikes = groupSignalsBySpike(uniqueSignals);

  const trades = [];
  let totalGrossPnlBps = 0;
  let totalNetPnlBps = 0;
  let totalNetPnlUsd = 0;
  let profitableTrades = 0;
  let unprofitableTrades = 0;

  for (const spike of spikes) {
    const entry = spike.bestSignal;

    const entrySlipBps = latencySlippageBps;
    const exitSlipBps = latencySlippageBps;
    const finalPnlBps = entry.grossOpenEdgeBps - repegCloseThresholdBps - feeRoundTripBps - entrySlipBps - exitSlipBps;

    const pnlUsd = (finalPnlBps / 10000) * positionSizeUsd;
    const roiPct = (pnlUsd / marginPerTrade) * 100;

    const trade = {
      ts: entry.ts,
      direction: entry.direction,
      Q: positionSizeUsd,
      margin: marginPerTrade,
      leverage,
      entryGrossEdgeBps: entry.grossOpenEdgeBps,
      entrySlippageBps: entrySlipBps,
      exitSlippageBps: exitSlipBps,
      feeRoundTripBps,
      repegCloseThresholdBps,
      finalPnlBps,
      pnlUsd: Math.round(pnlUsd * 10000) / 10000,
      roiPct: Math.round(roiPct * 100) / 100,
      profitable: finalPnlBps > 0,
      spikeDurationMs: entry.spikeDurationMs,
      spikeSignalCount: spike.signals.length,
      entryBuySlippageBps: entry.buySlippageBps,
      entrySellSlippageBps: entry.sellSlippageBps,
    };

    trades.push(trade);
    totalGrossPnlBps += entry.grossOpenEdgeBps;
    totalNetPnlBps += finalPnlBps;
    totalNetPnlUsd += pnlUsd;

    if (finalPnlBps > 0) profitableTrades++;
    else unprofitableTrades++;
  }

  const totalTrades = trades.length;
  const winRate = totalTrades > 0 ? (profitableTrades / totalTrades) * 100 : 0;
  const avgPnlBps = totalTrades > 0 ? totalNetPnlBps / totalTrades : 0;
  const avgPnlUsd = totalTrades > 0 ? totalNetPnlUsd / totalTrades : 0;
  const totalVolume = totalTrades * positionSizeUsd;
  const totalMarginUsed = totalTrades * marginPerTrade;

  const cpmUsd = totalVolume > 0 ? (totalNetPnlUsd / totalVolume) * 1000000 : 0;

  const firstTs = uniqueSignals.length > 0 ? uniqueSignals[0].tsMs : null;
  const lastTs = uniqueSignals.length > 0 ? uniqueSignals[uniqueSignals.length - 1].tsMs : null;
  const durationHours = firstTs && lastTs ? (lastTs - firstTs) / 3600000 : 0;
  const tradesPerHour = durationHours > 0 ? totalTrades / durationHours : 0;
  const pnlPerHourUsd = durationHours > 0 ? totalNetPnlUsd / durationHours : 0;

  const edgeDistribution = {
    below3bps: trades.filter(t => t.entryGrossEdgeBps < 3).length,
    '3to5bps': trades.filter(t => t.entryGrossEdgeBps >= 3 && t.entryGrossEdgeBps < 5).length,
    '5to8bps': trades.filter(t => t.entryGrossEdgeBps >= 5 && t.entryGrossEdgeBps < 8).length,
    '8to12bps': trades.filter(t => t.entryGrossEdgeBps >= 8 && t.entryGrossEdgeBps < 12).length,
    above12bps: trades.filter(t => t.entryGrossEdgeBps >= 12).length,
  };

  const scenarios = [];
  for (const lat of [50, 100, 150, 200, 300]) {
    const latSlip = lat <= 50 ? 0.2 : lat <= 100 ? 0.4 : lat <= 150 ? 0.5 : lat <= 200 ? 0.8 : 1.2;
    let scenarioPnlBpsSum = 0;
    let scenarioPnlUsdSum = 0;
    let scenarioWins = 0;
    for (const spike of spikes) {
      const e = spike.bestSignal;
      const pnlBps = e.grossOpenEdgeBps - repegCloseThresholdBps - feeRoundTripBps - latSlip - latSlip;
      const pnlUsd = (pnlBps / 10000) * positionSizeUsd;
      if (pnlBps > 0) scenarioWins++;
      scenarioPnlBpsSum += pnlBps;
      scenarioPnlUsdSum += pnlUsd;
    }
    scenarios.push({
      latencyMs: lat,
      latencySlippageBps: latSlip,
      totalPnlBps: Math.round(scenarioPnlBpsSum * 100) / 100,
      totalPnlUsd: Math.round(scenarioPnlUsdSum * 10000) / 10000,
      winRate: totalTrades > 0 ? Math.round((scenarioWins / totalTrades) * 10000) / 100 : 0,
      wins: scenarioWins,
      losses: totalTrades - scenarioWins,
    });
  }

  return {
    pairId,
    config: {
      takerFee,
      feeOpenBps: Math.round(feeOpenBps * 10000) / 10000,
      feeRoundTripBps: Math.round(feeRoundTripBps * 10000) / 10000,
      latencyMs,
      latencySlippageBps,
      repegCloseThresholdBps,
      leverage,
      positionSizeUsd,
      marginPerTrade,
    },
    dataRange: {
      firstSignal: uniqueSignals.length > 0 ? uniqueSignals[0].ts : null,
      lastSignal: uniqueSignals.length > 0 ? uniqueSignals[uniqueSignals.length - 1].ts : null,
      durationHours: Math.round(durationHours * 100) / 100,
    },
    summary: {
      totalRawSignals: rawSignals.length,
      uniqueSignalsQ50: uniqueSignals.length,
      totalSpikes: totalTrades,
      profitableTrades,
      unprofitableTrades,
      winRate: Math.round(winRate * 100) / 100,
      totalGrossPnlBps: Math.round(totalGrossPnlBps * 100) / 100,
      totalNetPnlBps: Math.round(totalNetPnlBps * 100) / 100,
      totalNetPnlUsd: Math.round(totalNetPnlUsd * 10000) / 10000,
      avgPnlBps: Math.round(avgPnlBps * 100) / 100,
      avgPnlUsd: Math.round(avgPnlUsd * 10000) / 10000,
      totalVolumeUsd: totalVolume,
      totalMarginUsedUsd: totalMarginUsed,
      cpmUsd: Math.round(cpmUsd * 100) / 100,
      tradesPerHour: Math.round(tradesPerHour * 100) / 100,
      pnlPerHourUsd: Math.round(pnlPerHourUsd * 10000) / 10000,
    },
    edgeDistribution,
    latencyScenarios: scenarios,
    trades: trades.slice(-50),
  };
}

function runBacktestAll(config = {}) {
  const csvDir = path.join(__dirname, '..', 'data', 'csv');
  if (!fs.existsSync(csvDir)) return { results: [], global: { totalTrades: 0, totalPnlUsd: 0, winRate: 0, totalVolume: 0 } };
  const signalFiles = fs.readdirSync(csvDir).filter(f => f.startsWith('signals_') && f.endsWith('.csv'));

  const results = [];
  let globalTotalPnlUsd = 0;
  let globalTotalTrades = 0;
  let globalWins = 0;
  let globalVolume = 0;

  for (const file of signalFiles) {
    const pairId = file.replace('signals_', '').replace('.csv', '');
    const result = runBacktest(pairId, config);

    if (result.error || result.summary.totalSpikes === 0) continue;

    results.push(result);
    globalTotalPnlUsd += result.summary.totalNetPnlUsd;
    globalTotalTrades += result.summary.totalSpikes;
    globalWins += result.summary.profitableTrades;
    globalVolume += result.summary.totalVolumeUsd;
  }

  results.sort((a, b) => b.summary.totalNetPnlUsd - a.summary.totalNetPnlUsd);

  return {
    config: results.length > 0 ? results[0].config : {},
    globalSummary: {
      totalPairs: results.length,
      totalTrades: globalTotalTrades,
      totalWins: globalWins,
      totalLosses: globalTotalTrades - globalWins,
      winRate: globalTotalTrades > 0 ? Math.round((globalWins / globalTotalTrades) * 10000) / 100 : 0,
      totalNetPnlUsd: Math.round(globalTotalPnlUsd * 10000) / 10000,
      totalVolumeUsd: globalVolume,
      cpmUsd: globalVolume > 0 ? Math.round((globalTotalPnlUsd / globalVolume) * 1000000 * 100) / 100 : 0,
    },
    pairs: results,
  };
}

module.exports = { runBacktest, runBacktestAll, loadSignalCsv };
