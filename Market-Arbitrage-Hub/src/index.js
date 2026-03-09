try { require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') }); } catch (_) {}
const express = require('express');
const path = require('path');
const fs = require('fs');
const { Store, RingBuffer } = require('./store');
const { WSPool } = require('./hl_ws');
const { computeMetrics, extractSignals, computeThresholds, clearThresholdsCache } = require('./arb');
const { runBacktest, runBacktestAll } = require('./backtest');
const db = require('./db');
const { ExecutionEngine } = require('./execution');
const hlApiModule = require('./hl_api');
const { getParisTime, TIMEZONE } = require('./tz');
const { registerGenericBotRoutes } = require('./botRoutes');

if (!process.env.DATABASE_URL) {
  console.error('[FATAL] Missing required env var: DATABASE_URL. Exiting.');
  process.exit(1);
}
if (!process.env.BOT1_PRIVATE_KEY && !process.env.HL_PRIVATE_KEY) {
  console.error('[FATAL] Missing required env var: BOT1_PRIVATE_KEY or HL_PRIVATE_KEY. Exiting.');
  process.exit(1);
}

process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled Rejection:', reason instanceof Error ? reason.stack : reason);
});
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception:', err.stack);
  process.exit(1);
});

const LOCKFILE = path.join(__dirname, '..', '.bot.lock');
function acquireLock() {
  try {
    if (fs.existsSync(LOCKFILE)) {
      const pid = parseInt(fs.readFileSync(LOCKFILE, 'utf-8').trim(), 10);
      try { process.kill(pid, 0); console.error(`[FATAL] Another bot instance running (PID ${pid}). Exiting.`); process.exit(1); } catch (e) {}
    }
    fs.writeFileSync(LOCKFILE, String(process.pid));
  } catch (e) { console.error('[WARN] Could not acquire lockfile:', e.message); }
}
function releaseLock() { try { if (fs.existsSync(LOCKFILE) && fs.readFileSync(LOCKFILE, 'utf-8').trim() === String(process.pid)) fs.unlinkSync(LOCKFILE); } catch (e) {} }
acquireLock();

const configPath = path.join(__dirname, '..', 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
config.takerFee = config.takerFee || 0.000045;
config.noGrowthTakerFee = config.noGrowthTakerFee || 0.00015;

function botEnv(botNum, suffix) {
  const newKey = `BOT${botNum}_${suffix}`;
  const oldKey = botNum === 1 ? `HL_${suffix}` : `HL_${suffix}_${botNum}`;
  return process.env[newKey] || process.env[oldKey] || '';
}

const PORT = parseInt(process.env.PORT || config.port || 5000, 10);

const wsPool = new WSPool(config, 9);

const bot1Api = hlApiModule.getDefaultInstance() || hlApiModule.createInstance(botEnv(1, 'PRIVATE_KEY'), 'bot1', botEnv(1, 'VAULT_ADDRESS') || null);
const executionEngine = new ExecutionEngine({
  minEdgeBps: config.minEdgeOpenBpsOverride || 8,
  positionSizeUsd: config.notionals?.[0] || 50,
  slippagePct: config.slippagePct || 0.005,
  crossRate: 0.00045,
  addRate: 0.00015,
  botId: 'bot1',
  dexFilter: ['xyz', 'flx'],
}, bot1Api);

let bot2Api = null;
let executionEngine2 = null;
const WALLET_ADDRESS_2 = botEnv(2, 'WALLET_ADDRESS');
if (botEnv(2, 'PRIVATE_KEY')) {
  bot2Api = hlApiModule.createInstance(botEnv(2, 'PRIVATE_KEY'), 'bot2', botEnv(2, 'VAULT_ADDRESS') || null);
  executionEngine2 = new ExecutionEngine({
    minEdgeBps: config.minEdgeOpenBpsOverride || 8,
    positionSizeUsd: config.notionals?.[0] || 50,
    slippagePct: config.slippagePct || 0.005,
    crossRate: 0.00045,
    addRate: 0.00015,
    botId: 'bot2',
    dexFilter: ['xyz', 'km'],
  }, bot2Api);
  console.log('[Bot2] Initialized with separate wallet');
} else {
  console.log('[Bot2] No HL_PRIVATE_KEY_2 — Bot+ disabled');
}

let bot3Api = null;
let executionEngine3 = null;
const WALLET_ADDRESS_3 = botEnv(3, 'WALLET_ADDRESS');
if (botEnv(3, 'PRIVATE_KEY')) {
  bot3Api = hlApiModule.createInstance(botEnv(3, 'PRIVATE_KEY'), 'bot3', botEnv(3, 'VAULT_ADDRESS') || null);
  executionEngine3 = new ExecutionEngine({
    minEdgeBps: config.minEdgeOpenBpsOverride || 8,
    positionSizeUsd: config.notionals?.[0] || 50,
    slippagePct: config.slippagePct || 0.005,
    crossRate: 0.00045,
    addRate: 0.00015,
    botId: 'bot3',
    dexFilter: ['xyz', 'cash'],
  }, bot3Api);
  console.log('[Bot3] Initialized with separate wallet');
} else {
  console.log('[Bot3] No HL_PRIVATE_KEY_3 — Bot3 disabled');
}

let bot4Api = null;
let executionEngine4 = null;
const WALLET_ADDRESS_4 = botEnv(4, 'WALLET_ADDRESS');
if (botEnv(4, 'PRIVATE_KEY')) {
  bot4Api = hlApiModule.createInstance(botEnv(4, 'PRIVATE_KEY'), 'bot4', botEnv(4, 'VAULT_ADDRESS') || null);
  executionEngine4 = new ExecutionEngine({
    minEdgeBps: config.minEdgeOpenBpsOverride || 8,
    positionSizeUsd: config.notionals?.[0] || 50,
    slippagePct: config.slippagePct || 0.005,
    crossRate: 0.00045,
    addRate: 0.00015,
    botId: 'bot4',
    dexFilter: ['xyz', 'flx'],
  }, bot4Api);
  console.log('[Bot4] Initialized with separate wallet');
} else {
  console.log('[Bot4] No HL_PRIVATE_KEY_4 — Bot4 disabled');
}

let bot5Api = null;
let executionEngine5 = null;
const WALLET_ADDRESS_5 = botEnv(5, 'WALLET_ADDRESS');
if (botEnv(5, 'PRIVATE_KEY')) {
  bot5Api = hlApiModule.createInstance(botEnv(5, 'PRIVATE_KEY'), 'bot5', botEnv(5, 'VAULT_ADDRESS') || null);
  executionEngine5 = new ExecutionEngine({
    minEdgeBps: config.minEdgeOpenBpsOverride || 8,
    positionSizeUsd: config.notionals?.[0] || 50,
    slippagePct: config.slippagePct || 0.005,
    crossRate: 0.00045,
    addRate: 0.00015,
    botId: 'bot5',
    dexFilter: ['xyz', 'km'],
  }, bot5Api);
  console.log('[Bot5] Initialized with separate wallet');
} else {
  console.log('[Bot5] No HL_PRIVATE_KEY_5 — Bot5 disabled');
}

let bot6Api = null;
let executionEngine6 = null;
const WALLET_ADDRESS_6 = botEnv(6, 'WALLET_ADDRESS');
if (botEnv(6, 'PRIVATE_KEY')) {
  bot6Api = hlApiModule.createInstance(botEnv(6, 'PRIVATE_KEY'), 'bot6', botEnv(6, 'VAULT_ADDRESS') || null);
  executionEngine6 = new ExecutionEngine({
    minEdgeBps: config.minEdgeOpenBpsOverride || 8,
    positionSizeUsd: config.notionals?.[0] || 50,
    slippagePct: config.slippagePct || 0.005,
    crossRate: 0.00045,
    addRate: 0.00015,
    botId: 'bot6',
    dexFilter: ['xyz', 'cash'],
  }, bot6Api);
  console.log('[Bot6] Initialized with separate wallet');
} else {
  console.log('[Bot6] No HL_PRIVATE_KEY_6 — Bot6 disabled');
}

const botRegistry = {
  bot1: { engine: executionEngine, api: bot1Api, deployer: 'flx', direction: 'xyz_short', walletAddr: () => botEnv(1, 'WALLET_ADDRESS') },
  bot2: { get engine() { return executionEngine2; }, get api() { return bot2Api; }, deployer: 'km', direction: 'xyz_short', walletAddr: () => WALLET_ADDRESS_2 },
  bot3: { get engine() { return executionEngine3; }, get api() { return bot3Api; }, deployer: 'cash', direction: 'xyz_short', walletAddr: () => WALLET_ADDRESS_3 },
  bot4: { get engine() { return executionEngine4; }, get api() { return bot4Api; }, deployer: 'flx', direction: 'xyz_long', walletAddr: () => WALLET_ADDRESS_4 },
  bot5: { get engine() { return executionEngine5; }, get api() { return bot5Api; }, deployer: 'km', direction: 'xyz_long', walletAddr: () => WALLET_ADDRESS_5 },
  bot6: { get engine() { return executionEngine6; }, get api() { return bot6Api; }, deployer: 'cash', direction: 'xyz_long', walletAddr: () => WALLET_ADDRESS_6 },
};

const deployerDirectionMap = {};
for (const [botId, reg] of Object.entries(botRegistry)) {
  deployerDirectionMap[`${reg.deployer}:${reg.direction}`] = botId;
}
console.log('[Router] Deployer→Bot map:', JSON.stringify(deployerDirectionMap));

const routingStats = { total: 0, routed: 0, rejected: 0, perBot: {} };
for (const botId of Object.keys(botRegistry)) routingStats.perBot[botId] = 0;

function _resolveXyzSide(pairConfig, direction) {
  const depA = pairConfig.marketA.split(':')[0].toLowerCase();
  const depB = pairConfig.marketB.split(':')[0].toLowerCase();
  const xyzIsB = depB === 'xyz';
  const xyzIsA = depA === 'xyz';
  if (!xyzIsA && !xyzIsB) return 'no_xyz';
  if (xyzIsB) return direction === 1 ? 'xyz_short' : 'xyz_long';
  return direction === 1 ? 'xyz_long' : 'xyz_short';
}

function _extractDeployer(pairId) {
  return pairId.split('-')[0].toLowerCase();
}

function routeSignal(pairId, sig, pairConfig) {
  routingStats.total++;
  const deployer = _extractDeployer(pairId);
  const xyzSide = _resolveXyzSide(pairConfig, sig.direction);
  if (xyzSide === 'no_xyz') {
    routingStats.rejected++;
    return;
  }
  const routeKey = `${deployer}:${xyzSide}`;
  const targetBotId = deployerDirectionMap[routeKey];
  if (!targetBotId) {
    routingStats.rejected++;
    return;
  }
  const reg = botRegistry[targetBotId];
  if (!reg || !reg.engine) {
    routingStats.rejected++;
    return;
  }
  routingStats.routed++;
  routingStats.perBot[targetBotId] = (routingStats.perBot[targetBotId] || 0) + 1;
  reg.engine.onSignal(pairId, sig, pairConfig).catch(e =>
    console.error(`[${targetBotId}] Signal error ${pairId}:`, e.message)
  );
}


class PairEngine {
  constructor(pairConfig, globalConfig) {
    this.id = pairConfig.id;
    const growthA = hlApiModule.getGrowthMode(pairConfig.marketA);
    const growthB = hlApiModule.getGrowthMode(pairConfig.marketB);
    this.config = {
      ...globalConfig,
      marketA: pairConfig.marketA,
      marketB: pairConfig.marketB,
      growthModeA: growthA,
      growthModeB: growthB,
    };
    if (!growthA || !growthB) {
      console.log(`[PairEngine] ${pairConfig.id}: growth mode A=${growthA}, B=${growthB} — non-growth legs use higher (add) fees`);
    }
    this.store = new Store(this.config);

    wsPool.register(this.config.marketA, [this.store], () => this.recompute());
    wsPool.register(this.config.marketB, [this.store], () => this.recompute());

    this.csvLogging = globalConfig.csvLogging || false;
    if (this.csvLogging) {
      const csvDir = path.join(__dirname, '..', 'data', 'csv');
      if (!_csvHeaderCache.has(csvDir)) {
        if (!fs.existsSync(csvDir)) fs.mkdirSync(csvDir, { recursive: true });
        _csvHeaderCache.add(csvDir);
      }
      const csvPath = path.join(csvDir, `signals_${this.id}.csv`);
      if (!_csvHeaderCache.has(csvPath)) {
        const csvHeader = 'ts,direction,Q,buyVWAP,sellVWAP,grossOpenEdgeBps,netOpenEdgeBps,feeOpenBps,buySlippageBps,sellSlippageBps,levelsConsumedBuy,levelsConsumedSell,spikeDurationMs\n';
        if (!fs.existsSync(csvPath)) fs.writeFileSync(csvPath, csvHeader);
        _csvHeaderCache.add(csvPath);
      }
      this.csvPath = csvPath;

      const spreadCsvPath = path.join(csvDir, `spread_${this.id}.csv`);
      if (!_csvHeaderCache.has(spreadCsvPath)) {
        const spreadHeader = 'ts,midA,midB,dir1GrossBps,dir2GrossBps,dir1Status,dir2Status,bestBidA,bestAskA,bestBidB,bestAskB,intraCostAbps,intraCostBbps,midSpreadBps,arbImpossible\n';
        if (!fs.existsSync(spreadCsvPath)) fs.writeFileSync(spreadCsvPath, spreadHeader);
        _csvHeaderCache.add(spreadCsvPath);
      }
      this.spreadCsvPath = spreadCsvPath;
    }
    this.lastSpreadLogMs = 0;
    this.lastMids = { midA: 0, midB: 0 };
    this.ringBuffer1s = new RingBuffer(3600);
    this.ringBufferTick = new RingBuffer(600);
  }

  async start() {
    console.log(`[PairEngine] Started ${this.id}: ${this.config.marketA} vs ${this.config.marketB}`);
  }

  stop() {
    wsPool.unregister(this.config.marketA, this.store);
    wsPool.unregister(this.config.marketB, this.store);
    console.log(`[PairEngine] Stopped ${this.id}`);
  }

  recompute() {
    const bookA = this.store.state.bookA;
    const bookB = this.store.state.bookB;
    if (!bookA || !bookB) return;

    this.config.isZScoreMode = Object.values(botRegistry).some(r => r.engine && r.engine._isZScoreMode());
    const metrics = computeMetrics(bookA, bookB, this.config, this.store);
    this.store.updateMetrics(metrics);
    this.lastMids = { midA: metrics.midA || 0, midB: metrics.midB || 0 };

    const tickTs = Date.now();
    const tickQ0 = (metrics.results || [])[0];
    const tickMicro = tickQ0 ? tickQ0.micro || {} : {};
    this.ringBufferTick.push({
      ts: tickTs,
      midA: metrics.midA || 0,
      midB: metrics.midB || 0,
      bestBidA: bookA?.bids?.[0]?.px || 0,
      bestAskA: bookA?.asks?.[0]?.px || 0,
      bestBidB: bookB?.bids?.[0]?.px || 0,
      bestAskB: bookB?.asks?.[0]?.px || 0,
      spreadBps: tickMicro.midSpreadBps || ((metrics.midA && metrics.midB && metrics.midB > 0) ? ((metrics.midA / metrics.midB) - 1) * 10000 : 0),
      dir1EdgeBps: tickQ0 ? (tickQ0.dir1?.grossOpenEdgeBps || 0) : 0,
      dir2EdgeBps: tickQ0 ? (tickQ0.dir2?.grossOpenEdgeBps || 0) : 0,
      depthA_2bps: computeDepthWithin2bps(bookA, metrics.midA || 0),
      depthB_2bps: computeDepthWithin2bps(bookB, metrics.midB || 0),
    });

    if (!this._thresholds) this._thresholds = computeThresholds(this.config);
    const thresholds = this._thresholds;
    const repegQ = (this.config.notionals || [50, 100, 150])[0];
    const signals = extractSignals(metrics);
    for (const sig of signals) {
      this.store.addSignal(sig);
      this.store.incrementOpportunity(sig.direction);
      if (sig.grossOpenEdgeBps >= 5) this.store.incrementBigEdge(sig.direction);
      if (this.csvLogging) this.appendSignalCsv(sig);
      sig.pegBps = this.store.getDynamicPeg(sig.direction);
      sig.adjustedEdgeBps = sig.grossOpenEdgeBps - sig.pegBps;
      sig._liveBookA = bookA;
      sig._liveBookB = bookB;
      routeSignal(this.id, sig, this.config);
    }

    const ts = metrics.ts;
    const q0 = (metrics.results || [])[0];
    if (!q0) return;

    this.store.addSpreadSample(ts, q0.dir1.grossOpenEdgeBps || 0, q0.dir2.grossOpenEdgeBps || 0, q0.dir1.capacityOk, q0.dir2.capacityOk);

    if (this.csvLogging) {
      const now = Date.now();
      if (now - this.lastSpreadLogMs >= 1000) {
        this.lastSpreadLogMs = now;
        const micro = q0.micro || {};
        const line = [
          new Date(ts).toISOString(),
          metrics.midA?.toFixed(6) || '',
          metrics.midB?.toFixed(6) || '',
          (q0.dir1.grossOpenEdgeBps || 0).toFixed(4),
          (q0.dir2.grossOpenEdgeBps || 0).toFixed(4),
          q0.dir1.status || '',
          q0.dir2.status || '',
          bookA?.bids?.[0]?.px?.toFixed(6) || '',
          bookA?.asks?.[0]?.px?.toFixed(6) || '',
          bookB?.bids?.[0]?.px?.toFixed(6) || '',
          bookB?.asks?.[0]?.px?.toFixed(6) || '',
          micro.intraCostAbps?.toFixed(4) ?? '',
          micro.intraCostBbps?.toFixed(4) ?? '',
          micro.midSpreadBps?.toFixed(4) ?? '',
          micro.arbImpossible ? 1 : 0,
        ].join(',');
        fs.appendFile(this.spreadCsvPath, line + '\n', () => {});
      }
    }


    for (const [botId, reg] of Object.entries(botRegistry)) {
      if (!reg.engine) continue;
      try {
        reg.engine.checkAndClosePositions(
          this.id,
          { dir1: q0.dir1.grossOpenEdgeBps || 0, dir2: q0.dir2.grossOpenEdgeBps || 0 },
          this.config.repegCloseThresholdBps ?? 1.0,
          this.config,
          { midA: metrics.midA || 0, midB: metrics.midB || 0 },
          { bookA, bookB }
        );
      } catch (e) { console.error(`[${botId}] Close check error ${this.id}:`, e.message); }
    }
  }

  appendSignalCsv(signal) {
    const line = [
      new Date(signal.ts).toISOString(),
      signal.direction,
      signal.Q,
      signal.buyVWAP?.toFixed(6) || '',
      signal.sellVWAP?.toFixed(6) || '',
      signal.grossOpenEdgeBps?.toFixed(4) || '',
      signal.netOpenEdgeBps?.toFixed(4) || '',
      signal.feeOpenBps?.toFixed(4) || '',
      signal.buySlippageBps?.toFixed(4) || '',
      signal.sellSlippageBps?.toFixed(4) || '',
      signal.levelsConsumedBuy || '',
      signal.levelsConsumedSell || '',
      signal.spikeDurationMs || '',
    ].join(',');
    fs.appendFile(this.csvPath, line + '\n', () => {});
  }
}

const _csvHeaderCache = new Set();

const pairs = config.pairs || [{ id: 'default', marketA: config.marketA, marketB: config.marketB }];

const engines = {};
for (const pairDef of pairs) {
  const engine = new PairEngine(pairDef, config);
  engines[pairDef.id] = engine;
}

function _propagateFeesToEngines(growthFee, noGrowthFee) {
  for (const engine of Object.values(engines)) {
    engine.config.takerFee = growthFee;
    engine.config.noGrowthTakerFee = noGrowthFee;
    if (engine.store && engine.store.repegTracker) {
      const gm = { a: engine.config.growthModeA !== false, b: engine.config.growthModeB !== false };
      const feeA = gm.a ? growthFee : noGrowthFee;
      const feeB = gm.b ? growthFee : noGrowthFee;
      engine.store.repegTracker.feeRoundTripRate = 2 * (feeA + feeB);
    }
    if (engine._thresholds) engine._thresholds = null;
  }
  clearThresholdsCache();
  console.log(`[FeeSync] Propagated live fees to ${Object.keys(engines).length} pair engines: growth=${(growthFee*10000).toFixed(2)}bps noGrowth=${(noGrowthFee*10000).toFixed(2)}bps`);
}

for (const [botId, reg] of Object.entries(botRegistry)) {
  if (reg.engine) reg.engine.onFeeUpdate(_propagateFeesToEngines);
}

const EDGE_SAMPLE_INTERVAL_MS = 60000;
setInterval(() => {
  const ts = Date.now();
  for (const [pairId, engine] of Object.entries(engines)) {
    const metrics = engine.store.state.metrics;
    if (!metrics) continue;
    const results = metrics.results || [];
    const q0 = results[0];
    if (!q0) continue;
    const d1 = q0.dir1?.grossOpenEdgeBps || 0;
    const d2 = q0.dir2?.grossOpenEdgeBps || 0;
    db.saveEdgeSnapshot(pairId, {
      ts,
      dir1EdgeBps: d1,
      dir2EdgeBps: d2,
      maxEdgeBps: Math.max(d1, d2),
      dir1Status: q0.dir1?.status || '',
      dir2Status: q0.dir2?.status || '',
      midA: metrics.midA || 0,
      midB: metrics.midB || 0,
    });
  }
}, EDGE_SAMPLE_INTERVAL_MS);

function computeDepthWithin2bps(book, mid) {
  if (!book || !mid || mid <= 0) return 0;
  const threshold = mid * 0.0002;
  let totalSize = 0;
  if (book.bids) {
    for (const lvl of book.bids) {
      if (mid - lvl.px <= threshold) totalSize += lvl.sz * lvl.px;
      else break;
    }
  }
  if (book.asks) {
    for (const lvl of book.asks) {
      if (lvl.px - mid <= threshold) totalSize += lvl.sz * lvl.px;
      else break;
    }
  }
  return totalSize;
}

function startGlobal1sScheduler() {
  const now = Date.now();
  const msUntilNextSecond = 1000 - (now % 1000);
  setTimeout(() => {
    snapshot1sAllPairs();
    setInterval(snapshot1sAllPairs, 1000);
  }, msUntilNextSecond);
}

function snapshot1sAllPairs() {
  const ts = Math.round(Date.now() / 1000) * 1000;
  for (const [pairId, engine] of Object.entries(engines)) {
    const metrics = engine.store.state.metrics;
    if (!metrics) continue;
    const results = metrics.results || [];
    const q0 = results[0];
    const micro = q0 ? q0.micro || {} : {};
    const bookA = engine.store.state.bookA;
    const bookB = engine.store.state.bookB;
    const midA = metrics.midA || 0;
    const midB = metrics.midB || 0;
    const d1 = q0 ? (q0.dir1?.grossOpenEdgeBps || 0) : 0;
    const d2 = q0 ? (q0.dir2?.grossOpenEdgeBps || 0) : 0;
    engine.ringBuffer1s.push({
      ts,
      midA,
      midB,
      dir1EdgeBps: d1,
      dir2EdgeBps: d2,
      maxEdgeBps: Math.max(d1, d2),
      midSpreadBps: micro.midSpreadBps || (midB > 0 ? ((midA / midB) - 1) * 10000 : 0),
      bestBidA: bookA?.bids?.[0]?.px || 0,
      bestAskA: bookA?.asks?.[0]?.px || 0,
      bestBidB: bookB?.bids?.[0]?.px || 0,
      bestAskB: bookB?.asks?.[0]?.px || 0,
      intraCostAbps: micro.intraCostAbps || 0,
      intraCostBbps: micro.intraCostBbps || 0,
      depthA_2bps: computeDepthWithin2bps(bookA, midA),
      depthB_2bps: computeDepthWithin2bps(bookB, midB),
    });

    trackMeanReversion(pairId, { d1, d2 }, ts);
  }
}

startGlobal1sScheduler();

const _meanReversionState = {};
const _meanReversionDurations = {};
const MEAN_REVERSION_MAX_DURATIONS = 200;

function trackMeanReversion(pairId, edgeBps, ts) {
  const threshold = executionEngine ? executionEngine.getPairObjectifBps(pairId) : 5;
  if (!_meanReversionState[pairId]) {
    _meanReversionState[pairId] = { aboveD1: false, aboveD2: false, startTsD1: 0, startTsD2: 0 };
  }
  if (!_meanReversionDurations[pairId]) {
    _meanReversionDurations[pairId] = { d1: [], d2: [] };
  }
  const st = _meanReversionState[pairId];
  const dur = _meanReversionDurations[pairId];

  const d1Above = edgeBps.d1 >= threshold;
  const d2Above = edgeBps.d2 >= threshold;

  if (d1Above && !st.aboveD1) {
    st.aboveD1 = true;
    st.startTsD1 = ts;
  } else if (!d1Above && st.aboveD1) {
    st.aboveD1 = false;
    if (st.startTsD1 > 0) {
      const durationS = (ts - st.startTsD1) / 1000;
      if (durationS > 0 && durationS < 3600) {
        dur.d1.push(durationS);
        if (dur.d1.length > MEAN_REVERSION_MAX_DURATIONS) dur.d1.shift();
      }
    }
  }

  if (d2Above && !st.aboveD2) {
    st.aboveD2 = true;
    st.startTsD2 = ts;
  } else if (!d2Above && st.aboveD2) {
    st.aboveD2 = false;
    if (st.startTsD2 > 0) {
      const durationS = (ts - st.startTsD2) / 1000;
      if (durationS > 0 && durationS < 3600) {
        dur.d2.push(durationS);
        if (dur.d2.length > MEAN_REVERSION_MAX_DURATIONS) dur.d2.shift();
      }
    }
  }
}

function computePercentile(arr, p) {
  if (!arr || arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function computeMedian(arr) {
  return computePercentile(arr, 0.5);
}

function fitHalfLife(durations) {
  if (!durations || durations.length < 3) return { tau: null, halfLife: null, survivalCurve: {} };
  const sorted = [...durations].sort((a, b) => a - b);
  const n = sorted.length;
  const timePoints = [0.5, 1, 2, 3, 5, 10, 30, 60];
  const survivalCurve = {};
  for (const t of timePoints) {
    const surviving = sorted.filter(d => d > t).length;
    survivalCurve[t] = n > 0 ? surviving / n : 0;
  }

  let sumT = 0, sumLogP = 0, count = 0;
  for (const t of timePoints) {
    const p = survivalCurve[t];
    if (p > 0.01 && p < 1) {
      sumT += t;
      sumLogP += Math.log(p);
      count++;
    }
  }

  let tau = null;
  let halfLife = null;
  if (count >= 2) {
    const lambda = -sumLogP / sumT;
    if (lambda > 0) {
      tau = 1 / lambda;
      halfLife = tau * Math.log(2);
    }
  }

  return { tau, halfLife, survivalCurve };
}

function getMeanReversionMetrics(pairId) {
  const dur = _meanReversionDurations[pairId];
  if (!dur) return { d1: { median: 0, p90: 0, count: 0, halfLife: null, tau: null, survivalCurve: {} }, d2: { median: 0, p90: 0, count: 0, halfLife: null, tau: null, survivalCurve: {} } };

  const d1Fit = fitHalfLife(dur.d1);
  const d2Fit = fitHalfLife(dur.d2);

  return {
    d1: {
      median: computeMedian(dur.d1),
      p90: computePercentile(dur.d1, 0.9),
      count: dur.d1.length,
      halfLife: d1Fit.halfLife,
      tau: d1Fit.tau,
      survivalCurve: d1Fit.survivalCurve,
    },
    d2: {
      median: computeMedian(dur.d2),
      p90: computePercentile(dur.d2, 0.9),
      count: dur.d2.length,
      halfLife: d2Fit.halfLife,
      tau: d2Fit.tau,
      survivalCurve: d2Fit.survivalCurve,
    },
  };
}

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  if (req.path.startsWith('/_stcore')) {
    return res.send('<html><head><meta http-equiv="refresh" content="0;url=/"></head><body>Reloading...</body></html>');
  }
  next();
});

app.use(express.static(path.join(__dirname, '..', 'public')));

function makePairLabel(p) {
  return `${p.marketA.split(':')[0]}/${p.marketB.split(':')[0]} ${p.marketA.split(':')[1]}`;
}

function generatePairId(marketA, marketB) {
  const a = marketA.split(':');
  const b = marketB.split(':');
  return `${a[0]}-${b[0]}-${a[1]}`;
}

function saveConfigToDisk() {
  config.pairs = pairs.map(p => ({ id: p.id, marketA: p.marketA, marketB: p.marketB }));
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

function connectNewWsConnections() {
  for (const conn of wsPool.connections) {
    if (!conn.connected && !conn.ws) {
      conn.connect();
    }
  }
}

app.get('/pairs', (req, res) => {
  res.json(pairs.map(p => {
    const e = engines[p.id];
    const growthA = e ? e.config.growthModeA : true;
    const growthB = e ? e.config.growthModeB : true;
    const thresholds = e ? computeThresholds(e.config) : null;
    return {
      id: p.id,
      marketA: p.marketA,
      marketB: p.marketB,
      label: makePairLabel(p),
      growthModeA: growthA,
      growthModeB: growthB,
      feeOpenBps: thresholds ? Math.round(thresholds.feeOpenBps * 100) / 100 : null,
      feeRoundTripBps: thresholds ? Math.round(thresholds.feeRoundTripBps * 100) / 100 : null,
    };
  }));
});

app.post('/pairs/add', async (req, res) => {
  try {
    const { marketA, marketB } = req.body;
    if (!marketA || !marketB) return res.status(400).json({ error: 'marketA and marketB required' });
    if (!marketA.includes(':') || !marketB.includes(':')) return res.status(400).json({ error: 'Format: deployer:COIN (e.g. flx:SILVER)' });

    const coinA = marketA.split(':')[1];
    const coinB = marketB.split(':')[1];
    if (coinA !== coinB) return res.status(400).json({ error: `Coin mismatch: ${coinA} vs ${coinB}` });

    let finalA = marketA, finalB = marketB;
    const depA = marketA.split(':')[0].toLowerCase();
    if (depA === 'xyz') {
      finalA = marketB;
      finalB = marketA;
      console.log(`[Pairs] Auto-normalized xyz to marketB: ${finalA} vs ${finalB}`);
    }

    const id = generatePairId(finalA, finalB);
    if (engines[id] || pairs.some(p => p.id === id)) return res.status(409).json({ error: `Pair ${id} already exists` });
    const revId = generatePairId(finalB, finalA);
    if (engines[revId] || pairs.some(p => p.id === revId)) return res.status(409).json({ error: `Pair already exists as ${revId} (inversée)` });

    const pairDef = { id, marketA: finalA, marketB: finalB };
    pairs.push(pairDef);

    const engine = new PairEngine(pairDef, config);
    engines[id] = engine;
    await engine.start();

    connectNewWsConnections();

    saveConfigToDisk();

    executionEngine.enablePair(id);
    executionEngine._allPairIds = pairs.map(p => p.id);

    console.log(`[Server] Pair added: ${id} (${finalA} vs ${finalB})`);
    res.json({ ok: true, id, label: makePairLabel(pairDef), total: pairs.length });
  } catch (err) {
    console.error('[Server] Add pair error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/pairs/remove', (req, res) => {
  try {
    const { pairId } = req.body;
    if (!pairId) return res.status(400).json({ error: 'pairId required' });
    if (!engines[pairId]) return res.status(404).json({ error: `Pair ${pairId} not found` });

    engines[pairId].stop();
    delete engines[pairId];
    const idx = pairs.findIndex(p => p.id === pairId);
    if (idx >= 0) pairs.splice(idx, 1);

    executionEngine.disablePair(pairId);
    executionEngine._allPairIds = pairs.map(p => p.id);

    saveConfigToDisk();

    console.log(`[Server] Pair removed: ${pairId}`);
    res.json({ ok: true, pairId });
  } catch (err) {
    console.error('[Server] Remove pair error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/state/:pairId', async (req, res) => {
  const engine = engines[req.params.pairId];
  if (!engine) return res.status(404).json({ error: 'Pair not found' });
  const thresholds = computeThresholds(engine.config);
  const dislocationStats = engine.store.getDislocationStats();
  let dbStats = null;
  let dbRecentCycles = [];
  try {
    dbStats = await db.getStatsByPair(req.params.pairId);
    dbRecentCycles = await db.loadCycles(req.params.pairId, 20);
  } catch (e) {}
  res.json({
    ...engine.store.getState(),
    dynamicPeg: engine.store.getDynamicPegState(),
    dislocationStats,
    repegStats: dbStats || { totalOpened: 0, totalRepegged: 0, totalFailedLiquidity: 0, pendingOpen: 0, successRate: 0, theoreticalPnlBps: 0, avgPnlBps: 0, totalVolumeUsd: 0, cpmUsd: 0 },
    recentCycles: dbRecentCycles,
    dbStats,
    config: {
      marketA: engine.config.marketA,
      marketB: engine.config.marketB,
      takerFeeGrowth: executionEngine.getFeeRates().takerFeeGrowth,
      takerFeeNoGrowth: executionEngine.getFeeRates().takerFeeNoGrowth,
      pairFees: executionEngine._getPairTakerFees(req.params.pairId),
      feeRoundTripBps: executionEngine.getPairFeeRoundTripBps(req.params.pairId),
      notionals: engine.config.notionals,
      slippageBufferOpenBps: engine.config.slippageBufferOpenBps,
      slippageBufferRoundTripBps: engine.config.slippageBufferRoundTripBps,
      maxSlippageBps: engine.config.maxSlippageBps,
      maxLevelsToConsume: engine.config.maxLevelsToConsume,
      minSpikeMs: engine.config.minSpikeMs,
      repegCloseThresholdBps: engine.config.repegCloseThresholdBps ?? 1.0,
      ...thresholds,
    },
  });
});

app.get('/spread-history/:pairId', (req, res) => {
  const engine = engines[req.params.pairId];
  if (!engine) return res.status(404).json({ error: 'Pair not found' });
  const n = parseInt(req.query.n || '36000', 10);
  res.json(engine.store.getSpreadHistory(n));
});

app.get('/logs/:pairId', (req, res) => {
  const engine = engines[req.params.pairId];
  if (!engine) return res.status(404).json({ error: 'Pair not found' });
  const n = parseInt(req.query.n || '50', 10);
  res.json(engine.store.signals.getLast(n));
});

app.get('/counts', (req, res) => {
  const counts = {};
  for (const [id, engine] of Object.entries(engines)) {
    const bc = engine.store.state.bigEdgeCounts || {};
    counts[id] = (bc.d1 || 0) + (bc.d2 || 0);
  }
  res.json(counts);
});

app.get('/big-edge-counts', (req, res) => {
  const result = {};
  for (const [id, engine] of Object.entries(engines)) {
    const bc = engine.store.state.bigEdgeCounts || {};
    result[id] = { d1: bc.d1 || 0, d2: bc.d2 || 0 };
  }
  res.json(result);
});

app.get('/health', (req, res) => {
  const pairStatus = {};
  for (const [id, engine] of Object.entries(engines)) {
    pairStatus[id] = {
      connectionA: engine.store.state.connectionA,
      connectionB: engine.store.state.connectionB,
    };
  }
  res.json({ status: 'ok', pairs: pairStatus, uptime: process.uptime() });
});

app.get('/state', (req, res) => {
  const first = Object.values(engines)[0];
  if (!first) return res.status(404).json({ error: 'No pairs' });
  const thresholds = computeThresholds(first.config);
  const dislocationStats = first.store.getDislocationStats();
  res.json({
    ...first.store.getState(),
    dislocationStats,
    repegStats: {},
    recentCycles: [],
    config: {
      marketA: first.config.marketA,
      marketB: first.config.marketB,
      takerFeeGrowth: executionEngine.getFeeRates().takerFeeGrowth,
      takerFeeNoGrowth: executionEngine.getFeeRates().takerFeeNoGrowth,
      notionals: first.config.notionals,
      slippageBufferOpenBps: first.config.slippageBufferOpenBps,
      slippageBufferRoundTripBps: first.config.slippageBufferRoundTripBps,
      maxSlippageBps: first.config.maxSlippageBps,
      maxLevelsToConsume: first.config.maxLevelsToConsume,
      minSpikeMs: first.config.minSpikeMs,
      repegCloseThresholdBps: first.config.repegCloseThresholdBps ?? 1.0,
      ...thresholds,
    },
  });
});

app.get('/spread-history', (req, res) => {
  const first = Object.values(engines)[0];
  if (!first) return res.json([]);
  const n = parseInt(req.query.n || '600', 10);
  res.json(first.store.getSpreadHistory(n));
});

app.get('/logs', (req, res) => {
  const first = Object.values(engines)[0];
  if (!first) return res.json([]);
  const n = parseInt(req.query.n || '50', 10);
  res.json(first.store.signals.getLast(n));
});

const configAllowed = [
  'notionals',
  'slippageBufferOpenBps', 'slippageBufferRoundTripBps',
  'maxSlippageBps', 'maxLevelsToConsume', 'minSpikeMs',
  'safetySpreadBps',
];

app.post('/config', (req, res) => {
  const updates = {};
  for (const key of configAllowed) {
    if (req.body[key] !== undefined) {
      updates[key] = req.body[key];
    }
  }
  for (const engine of Object.values(engines)) {
    engine.store.updateConfig(updates);
    engine.config = { ...engine.config, ...updates };
    engine._thresholds = null;
  }
  const first = Object.values(engines)[0];
  const thresholds = computeThresholds(first.config);
  res.json({ ok: true, config: { ...first.store.getConfig(), ...thresholds } });
});

app.post('/fees', (req, res) => {
  const updates = {};
  if (req.body.takerFee !== undefined) updates.takerFee = parseFloat(req.body.takerFee);
  for (const engine of Object.values(engines)) {
    engine.store.updateConfig(updates);
    engine.config = { ...engine.config, ...updates };
    engine._thresholds = null;
  }
  const first = Object.values(engines)[0];
  const thresholds = computeThresholds(first.config);
  res.json({ ok: true, ...thresholds });
});

app.get('/backtest/:pairId', (req, res) => {
  const backtestConfig = {
    takerFee: executionEngine.getFeeRates().takerFeeGrowth,
    latencyMs: parseInt(req.query.latencyMs || '150'),
    latencySlippageBps: parseFloat(req.query.latencySlippageBps || '0.5'),
    repegCloseThresholdBps: parseFloat(req.query.closeThreshold || '1.0'),
    leverage: parseInt(req.query.leverage || '4'),
    positionSizeUsd: parseInt(req.query.positionSize || '50'),
  };
  const result = runBacktest(req.params.pairId, backtestConfig);
  res.json(result);
});

app.get('/backtest', (req, res) => {
  const backtestConfig = {
    takerFee: executionEngine.getFeeRates().takerFeeGrowth,
    latencyMs: parseInt(req.query.latencyMs || '150'),
    latencySlippageBps: parseFloat(req.query.latencySlippageBps || '0.5'),
    repegCloseThresholdBps: parseFloat(req.query.closeThreshold || '1.0'),
    leverage: parseInt(req.query.leverage || '4'),
    positionSizeUsd: parseInt(req.query.positionSize || '50'),
  };
  const result = runBacktestAll(backtestConfig);
  res.json(result);
});

const hlApi = require('./hl_api');

const WALLET_ADDRESS = botEnv(1, 'WALLET_ADDRESS');
if (!WALLET_ADDRESS) {
  console.warn('[Server] WARNING: HL_WALLET_ADDRESS env var not set — wallet-dependent features may fail');
}
let cachedBalances = { usdc: 0, usdt: 0, usdh: 0, wallet: null, ts: 0 };
const BALANCE_CACHE_MS = 10000;

app.get('/wallet/balances', async (req, res) => {
  try {
    const now = Date.now();
    const activeAddr = bot1Api.getActiveAddress() || WALLET_ADDRESS;
    if (now - cachedBalances.ts > BALANCE_CACHE_MS || cachedBalances._addr !== activeAddr) {
      cachedBalances = { ...(await hlApi.getBalances(activeAddr)), ts: now, _addr: activeAddr };
    }
    res.json(cachedBalances);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const _statusCaches = {};
const _statusRefreshing = {};
for (const botId of Object.keys(botRegistry)) {
  _statusCaches[botId] = { data: null, ts: 0 };
  _statusRefreshing[botId] = false;
}

async function _refreshStatusCacheFor(botId) {
  if (_statusRefreshing[botId]) return;
  const reg = botRegistry[botId];
  if (!reg || !reg.engine) return;
  _statusRefreshing[botId] = true;
  try {
    const botConfig = reg.engine.getConfig();
    const liveStats = await reg.engine.getLiveStats();
    _statusCaches[botId] = { data: { ...botConfig, liveStats }, ts: Date.now() };
  } catch (e) {} finally { _statusRefreshing[botId] = false; }
}

for (const botId of Object.keys(botRegistry)) {
  setInterval(() => _refreshStatusCacheFor(botId), 5000);
}

app.get('/bot/available', (req, res) => {
  res.json({ available: !!executionEngine, botId: 'bot1', deployer: 'flx', direction: 'xyz_short' });
});

app.get('/bot/status', async (req, res) => {
  if (_statusCaches.bot1.data) {
    return res.json(_statusCaches.bot1.data);
  }
  const botConfig = executionEngine.getConfig();
  const liveStats = await executionEngine.getLiveStats();
  const payload = { ...botConfig, liveStats };
  _statusCaches.bot1 = { data: payload, ts: Date.now() };
  res.json(payload);
});

app.get('/bot/fees', (req, res) => {
  res.json(executionEngine.getFeeRates());
});

app.get('/bot/ping', async (req, res) => {
  try {
    const ms = await executionEngine._hlApi.pingLatency();
    res.json({ ok: true, pingMs: ms });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

app.post('/bot/start', (req, res) => {
  const ok = executionEngine.start();
  res.json({ ok, enabled: executionEngine.isEnabled() });
});

app.post('/bot/stop', (req, res) => {
  executionEngine.stop();
  res.json({ ok: true, enabled: false });
});

app.post('/bot/liquidation/start', (req, res) => {
  const ok = executionEngine.startLiquidation();
  res.json({ ok, liquidationMode: executionEngine.liquidationMode, enabled: executionEngine.isEnabled() });
});

app.post('/bot/liquidation/stop', (req, res) => {
  const ok = executionEngine.stopLiquidation();
  res.json({ ok, liquidationMode: executionEngine.liquidationMode, enabled: executionEngine.isEnabled() });
});

app.post('/bot/pair', (req, res) => {
  const { pairId, enabled } = req.body;
  if (!engines[pairId]) return res.status(404).json({ error: 'Pair not found' });
  if (enabled) {
    executionEngine.enablePair(pairId);
  } else {
    executionEngine.disablePair(pairId);
  }
  res.json({ ok: true, pairId, enabled: executionEngine.isPairEnabled(pairId) });
});

app.post('/bot/force-close/:tradeId', async (req, res) => {
  res.json({ ok: false, error: 'Per-trade force close removed — use force-close-pair/:pairId instead' });
});

app.post('/bot/force-close-pair/:pairId', async (req, res) => {
  try {
    const result = await executionEngine.forceClosePair(req.params.pairId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/bot/force-close-all', async (req, res) => {
  try {
    const results = await executionEngine.forceCloseAll();
    res.json({ ok: true, results });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/bot/positions', async (req, res) => {
  try {
    const pairMids = {};
    for (const [id, peng] of Object.entries(engines)) pairMids[id] = peng.lastMids;
    const positions = await executionEngine.getPositionsList();
    const enriched = positions.map(pos => {
      const mids = pairMids[pos.pairId];
      const midA = mids?.midA || 0;
      const midB = mids?.midB || 0;
      const spreadPnlBps = executionEngine.computeSpreadPnlBps(pos, midA, midB);
      const spreadPnlUsd = executionEngine.computeSpreadPnlUsd(pos, midA, midB);
      const feesRT = executionEngine.getPairFeeRoundTripBps(pos.pairId);
      return { ...pos, midA, midB, spreadPnlBps, spreadPnlUsd, feesRT };
    });
    res.json(enriched);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/bot/fills', async (req, res) => {
  try {
    const limit = parseInt(req.query.n || '100');
    res.json(await executionEngine.getRecentFills(limit));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/bot/suggest-edges', async (req, res) => {
  try {
    const minutesBack = parseInt(req.query.minutes || '30');
    const cutoff = new Date(Date.now() - minutesBack * 60 * 1000).toISOString();
    const result = await db.pool.query(`
      SELECT pair_id,
        COUNT(*) as cycles,
        ROUND(AVG(duration_ms)::numeric / 1000) as avg_duration_s,
        ROUND(AVG(theoretical_pnl_bps)::numeric, 2) as avg_pnl_bps,
        ROUND(MAX(theoretical_pnl_bps)::numeric, 2) as max_pnl_bps,
        ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY theoretical_pnl_bps)::numeric, 2) as median_pnl_bps,
        SUM(CASE WHEN close_liquidity_ok THEN 1 ELSE 0 END) as liq_ok,
        SUM(CASE WHEN NOT close_liquidity_ok THEN 1 ELSE 0 END) as liq_fail
      FROM repeg_cycles
      WHERE created_at > $1
      GROUP BY pair_id
      ORDER BY cycles DESC
    `, [cutoff]);

    const feeRates = executionEngine.getFeeRates();
    const feeRoundTripBps = 2 * 2 * feeRates.takerFeeGrowth * 10000;
    const suggestions = {};

    for (const r of result.rows) {
      const cycles = parseInt(r.cycles);
      const liqOk = parseInt(r.liq_ok);
      const liqFail = parseInt(r.liq_fail);
      const liqOkPct = cycles > 0 ? liqOk / cycles : 0;
      const avgPnl = parseFloat(r.avg_pnl_bps);
      const maxPnl = parseFloat(r.max_pnl_bps);
      const medianPnl = parseFloat(r.median_pnl_bps);
      const avgDuration = parseInt(r.avg_duration_s);

      let suggestedEdge;
      let tier;
      let reason;

      if (liqOkPct >= 0.90 && avgDuration <= 30 && avgPnl >= 3.0) {
        suggestedEdge = Math.max(maxPnl + 2.0, feeRoundTripBps + 7.0);
        suggestedEdge = Math.ceil(suggestedEdge * 2) / 2;
        tier = 'A';
        reason = `Liq ${(liqOkPct*100).toFixed(0)}% OK, repeg ${avgDuration}s, max ${maxPnl} bps`;
      } else if (liqOkPct >= 0.80 && avgPnl >= 2.5) {
        suggestedEdge = Math.max(maxPnl + 3.0, feeRoundTripBps + 8.0);
        suggestedEdge = Math.ceil(suggestedEdge * 2) / 2;
        tier = 'B';
        reason = `Liq ${(liqOkPct*100).toFixed(0)}% OK, repeg ${avgDuration}s, max ${maxPnl} bps`;
      } else if (liqOkPct >= 0.50) {
        suggestedEdge = Math.max(maxPnl + 4.0, feeRoundTripBps + 10.0);
        suggestedEdge = Math.ceil(suggestedEdge * 2) / 2;
        tier = 'C';
        reason = `Liq ${(liqOkPct*100).toFixed(0)}% OK, repeg lent ${avgDuration}s, max ${maxPnl} bps`;
      } else {
        suggestedEdge = 0;
        tier = 'D';
        reason = `Liq seulement ${(liqOkPct*100).toFixed(0)}% OK — trop risqué`;
      }

      suggestions[r.pair_id] = {
        suggestedEdge: parseFloat(suggestedEdge.toFixed(1)),
        tier,
        reason,
        cycles,
        liqOkPct: parseFloat((liqOkPct * 100).toFixed(0)),
        avgPnlBps: avgPnl,
        maxPnlBps: maxPnl,
        medianPnlBps: medianPnl,
        avgDurationS: avgDuration,
      };
    }

    for (const p of pairs) {
      if (!suggestions[p.id]) {
        suggestions[p.id] = {
          suggestedEdge: 0,
          tier: 'D',
          reason: 'Pas de données repeg récentes',
          cycles: 0,
          liqOkPct: 0,
          avgPnlBps: 0,
          maxPnlBps: 0,
          medianPnlBps: 0,
          avgDurationS: 0,
        };
      }
    }

    res.json({ minutesAnalyzed: minutesBack, feeRoundTripBps, suggestions });
  } catch (err) {
    console.error('[API] suggest-edges error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/bot/reset', async (req, res) => {
  const result = await executionEngine.reset();
  res.json({ ok: true, message: 'Bot reset: all trades cleared, bot stopped', closedPositions: result.closedPositions || [] });
});

app.post('/bot/config', async (req, res) => {
  await executionEngine.updateConfig(req.body);
  res.json({ ok: true, config: executionEngine.getConfig() });
});

app.get('/bot/pair-tiers', (req, res) => {
  if (Date.now() - _pairTierCaches.bot1.ts > PAIR_TIER_RECALC_MS) {
    computePairTiers(executionEngine);
  }
  res.json({ tiers: _pairTierCaches.bot1.data, config: executionEngine.tierConfig, ts: _pairTierCaches.bot1.ts, totalBalance: _pairTierCaches.bot1.totalBalance });
});

app.post('/bot/pair-tiers/config', async (req, res) => {
  const { thresholds, marginPct } = req.body;
  await executionEngine.updateTierConfig({ thresholds, marginPct });
  computePairTiers(executionEngine);
  res.json({ ok: true, config: executionEngine.tierConfig, tiers: _pairTierCaches.bot1.data, totalBalance: _pairTierCaches.bot1.totalBalance });
});
app.post('/bot/pair-tiers/reset', (req, res) => {
  executionEngine.resetTierConfig();
  computePairTiers(executionEngine);
  res.json({ ok: true, config: executionEngine.tierConfig, tiers: _pairTierCaches.bot1.data, totalBalance: _pairTierCaches.bot1.totalBalance });
});

app.post('/bot/pair-overrides', (req, res) => {
  const { pairId, zThreshold, bufferBps } = req.body;
  if (!pairId) return res.status(400).json({ error: 'pairId required' });
  const result = executionEngine.setPairOverrides(pairId, { zThreshold, bufferBps });
  res.json(result);
});

app.get('/bot/pair-fees-detail', (req, res) => {
  try {
    const result = [];
    for (const p of pairs) {
      const fees = executionEngine._getPairTakerFees(p.id);
      const gm = executionEngine._pairGrowthModes[p.id] || { a: true, b: true };
      const [depA] = (p.marketA || '').split(':');
      const [depB] = (p.marketB || '').split(':');
      result.push({
        pairId: p.id,
        deployerA: depA,
        deployerB: depB,
        growthA: gm.a !== false,
        growthB: gm.b !== false,
        feeA: fees.feeA * 10000,
        feeB: fees.feeB * 10000,
        feeRT: (fees.feeA + fees.feeB) * 2 * 10000,
      });
    }
    res.json({ pairs: result });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const _aiKeys = { openai: '', claude: '' };

app.post('/bot/ai/key', (req, res) => {
  const { key, provider } = req.body;
  if (provider === 'claude') {
    if (!key || !key.startsWith('sk-ant-')) return res.status(400).json({ error: 'Invalid Anthropic key (must start with sk-ant-)' });
    _aiKeys.claude = key;
    return res.json({ ok: true, provider: 'claude', masked: 'sk-ant-...' + key.slice(-4) });
  }
  if (!key || !key.startsWith('sk-')) return res.status(400).json({ error: 'Invalid OpenAI key' });
  _aiKeys.openai = key;
  res.json({ ok: true, provider: 'openai', masked: 'sk-...' + key.slice(-4) });
});

app.get('/bot/ai/key', (req, res) => {
  res.json({
    openai: { hasKey: !!_aiKeys.openai, masked: _aiKeys.openai ? 'sk-...' + _aiKeys.openai.slice(-4) : '' },
    claude: { hasKey: !!_aiKeys.claude, masked: _aiKeys.claude ? 'sk-ant-...' + _aiKeys.claude.slice(-4) : '' },
  });
});

function _buildAiContext(botConfig, liveStats, recentTrades, floorSummary, parisHour, dayOfWeek) {
  return `Current state (${parisHour}h Paris, day ${dayOfWeek}):

BOT CONFIG: ${JSON.stringify({ enabled: botConfig.enabled, entryMode: botConfig.p50Mode, costsBps: botConfig.costsBps, positionSizeUsd: botConfig.positionSizeUsd, maxGlobalPositions: botConfig.maxGlobalPositions, maxLeverage: botConfig.maxLeverage, stopLossBps: botConfig.stopLossBps, tierConfig: botConfig.tierConfig })}

LIVE STATS: ${JSON.stringify(liveStats)}

BALANCES: ${JSON.stringify(botConfig.balances)}

OPEN POSITIONS: ${JSON.stringify(botConfig.openPositions || {})}

RECENT TRADES (last 20): ${JSON.stringify(recentTrades.map(t => ({ pair: t.pair_id, dir: t.direction, status: t.status, pnl: t.realized_pnl_usd, fees: t.fees_usd, entryEdge: t.entry_edge_bps, slippage: t.slippage_entry_bps, duration: t.duration_sec, error: t.error_msg })))}

LATENCY: ${JSON.stringify(botConfig.latency)}
EXEC TIME: ${JSON.stringify(botConfig.execTime)}`;
}

const AI_SYSTEM_PROMPT = `You are an expert trading bot advisor for a HyperLiquid HIP3 delta-neutral arbitrage system.
The bot monitors deployer pairs and enters using Z-Score modes (zscore/ou/kalman) when Z >= threshold AND edge >= feesRT + bufferBps.
Close strategies: volume (TP=feesRT), be (TP=feesRT+entrySlip), beplus (TP=feesRT+customSlip). Optional zMeanRevert toggle.
Growth mode pairs have 0.82bps taker fee, non-growth have 4.32bps.

You can suggest config changes. When you do, output a JSON block in this exact format:
\`\`\`actions
{"type":"config","changes":{"costsBps":5,"p50Mode":"zscore","positionSizeUsd":30}}
\`\`\`

Valid config fields: marginBps (number), p50Mode (string: zscore|ou|kalman|ewma), maxPositionUsd (number), maxGlobalPositions (number), stopLossBps (number), maxLeverage (number), bufferBps (number), zMeanRevert (boolean), closeBufferBps (number), maxLossBps (number).
You can also suggest per-pair edge overrides:
\`\`\`actions
{"type":"pairEdges","changes":{"flx-xyz-SILVER:d1":10,"km-xyz-TSLA:d2":8}}
\`\`\`

You can also enable/disable pairs:
\`\`\`actions
{"type":"enablePair","pairId":"flx-xyz-CRCL","enabled":false}
\`\`\`

Only suggest changes when the user asks or when you see clear issues. Answer in French. Be concise and data-driven.`;

app.post('/bot/ai/analyze', async (req, res) => {
  const { question, provider } = req.body;
  const useProvider = provider || 'openai';

  if (useProvider === 'claude' && !_aiKeys.claude) return res.status(400).json({ error: 'No Anthropic key configured' });
  if (useProvider === 'openai' && !_aiKeys.openai) return res.status(400).json({ error: 'No OpenAI key configured' });

  try {
    const botConfig = executionEngine.getConfig();
    const liveStats = await executionEngine.getLiveStats();
    const recentTrades = await executionEngine.getTradeHistory(20);
    const { hour: parisHour, dow: dayOfWeek } = getParisTime();

    const contextMsg = _buildAiContext(botConfig, liveStats, recentTrades, {}, parisHour, dayOfWeek);
    const userMsg = contextMsg + '\n\n' + (question || 'Analyse la situation actuelle et donne tes recommandations.');
    let reply;

    if (useProvider === 'claude') {
      const Anthropic = require('@anthropic-ai/sdk');
      const anthropic = new Anthropic({ apiKey: _aiKeys.claude });
      const msg = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: AI_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMsg }],
      });
      reply = msg.content[0].text;
    } else {
      const OpenAI = require('openai');
      const openai = new OpenAI({ apiKey: _aiKeys.openai });
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: AI_SYSTEM_PROMPT },
          { role: 'user', content: userMsg },
        ],
        max_tokens: 2000,
        temperature: 0.3,
      });
      reply = completion.choices[0].message.content;
    }

    const actions = [];
    const actionRegex = /```actions\n([\s\S]*?)```/g;
    let match;
    while ((match = actionRegex.exec(reply)) !== null) {
      try { actions.push(JSON.parse(match[1].trim())); } catch (e) {}
    }

    res.json({ reply, actions, provider: useProvider });
  } catch (err) {
    console.error(`[AI:${useProvider}] Error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/bot/ai/apply', async (req, res) => {
  if (!_aiKeys.openai && !_aiKeys.claude) return res.status(403).json({ error: 'No AI key configured' });
  const { action } = req.body;
  if (!action || !action.type) return res.status(400).json({ error: 'Invalid action' });
  try {
    if (action.type === 'config') {
      await executionEngine.updateConfig(action.changes);
      console.log('[AI] Applied config changes:', action.changes);
      return res.json({ ok: true, config: executionEngine.getConfig() });
    }
    if (action.type === 'enablePair') {
      if (action.enabled) executionEngine.enablePair(action.pairId);
      else executionEngine.disablePair(action.pairId);
      console.log(`[AI] ${action.enabled ? 'Enabled' : 'Disabled'} pair ${action.pairId}`);
      return res.json({ ok: true, pairId: action.pairId, enabled: action.enabled });
    }
    res.status(400).json({ error: 'Unknown action type' });
  } catch (err) {
    console.error('[AI] Apply error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/bot/trades', async (req, res) => {
  const limit = parseInt(req.query.n || '50');
  const trades = await executionEngine.getTradeHistory(limit);
  res.json(trades);
});

app.get('/bot/trades/open', async (req, res) => {
  try {
    const result = await db.pool.query(
      `SELECT * FROM bot_trades WHERE status = 'open' AND bot_id = 'bot1' ORDER BY entry_ts DESC`
    );
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/bot/trades/closed', async (req, res) => {
  try {
    const limit = parseInt(req.query.n || '50');
    const pair = req.query.pair || null;
    let whereClause = `status NOT IN ('open','orphan_closing') AND bot_id = 'bot1'`;
    const params = [limit];
    if (pair) {
      whereClause += ` AND pair_id = $2`;
      params.push(pair);
    }
    const [result, countRes] = await Promise.all([
      db.pool.query(
        `SELECT * FROM bot_trades WHERE ${whereClause} ORDER BY COALESCE(close_ts, entry_ts) DESC LIMIT $1`,
        params
      ),
      db.pool.query(
        pair
          ? `SELECT COUNT(*)::int as total FROM bot_trades WHERE status NOT IN ('open','orphan_closing') AND bot_id = 'bot1' AND pair_id = $1`
          : `SELECT COUNT(*)::int as total FROM bot_trades WHERE status NOT IN ('open','orphan_closing') AND bot_id = 'bot1'`,
        pair ? [pair] : []
      )
    ]);
    res.json({ rows: result.rows, total: countRes.rows[0].total });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/bot/dn-status', (req, res) => {
  res.json(executionEngine.getDnStatus());
});

app.get('/bot/combined-pair-stats', async (req, res) => {
  try {
    const pairMids = {};
    for (const [id, eng] of Object.entries(engines)) pairMids[id] = eng.lastMids;
    const stats1 = await executionEngine.getPairStats(pairMids);
    let stats2 = [];
    if (executionEngine2) {
      stats2 = await executionEngine2.getPairStats(pairMids);
    }
    const merged = {};
    const addStats = (arr) => {
      for (const s of arr) {
        const key = `${s.pairId}:d${s.direction || 0}`;
        if (!merged[key]) {
          merged[key] = { ...s, _closedForAvg: s.closed || 0 };
          continue;
        }
        const m = merged[key];
        const w1 = m._closedForAvg || 0;
        const w2 = s.closed || 0;
        const wt = w1 + w2;
        m.total += s.total;
        m.open += s.open;
        m.closed += s.closed;
        m.errors += s.errors;
        m.wins += s.wins;
        m.losses += s.losses;
        m.totalPnlUsd += s.totalPnlUsd;
        m.totalFeesUsd += s.totalFeesUsd;
        m.totalVolumeUsd += s.totalVolumeUsd;
        m.unrealizedPnlUsd += s.unrealizedPnlUsd;
        m.dnAdjustments += s.dnAdjustments;
        m.dnAdjustmentCostUsd += s.dnAdjustmentCostUsd;
        if (wt > 0) {
          m.avgEntryEdgeBps = (m.avgEntryEdgeBps * w1 + s.avgEntryEdgeBps * w2) / wt;
          m.avgGrossEdgeBps = (m.avgGrossEdgeBps * w1 + s.avgGrossEdgeBps * w2) / wt;
          m.avgSlippageBps = (m.avgSlippageBps * w1 + s.avgSlippageBps * w2) / wt;
        }
        if (s.zMid0 != null) m.zMid0 = m.zMid0 != null ? (m.zMid0 + s.zMid0) / 2 : s.zMid0;
        m.unrealizedPnlBps = wt > 0 ? (m.unrealizedPnlBps * w1 + s.unrealizedPnlBps * w2) / wt : 0;
        m._closedForAvg = wt;
      }
    };
    addStats(stats1);
    addStats(stats2);
    const result = Object.values(merged).map(m => { delete m._closedForAvg; return m; });
    result.sort((a, b) => a.pairId.localeCompare(b.pairId) || (a.direction || 0) - (b.direction || 0));
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

function buildHedgeStatus(rows, onChainPositions) {
    const symbols = {};
    const dbExpectedPerCoin = {};
    for (const t of rows) {
      const processLeg = (coin, side, size, px) => {
        if (!coin || !size) return;
        const parts = coin.split(':');
        if (parts.length < 2) return;
        const symbol = parts[1];
        const sz = parseFloat(size) || 0;
        const price = parseFloat(px) || 0;
        if (sz <= 0 || price <= 0) return;
        const notional = sz * price;
        if (!symbols[symbol]) symbols[symbol] = { symbol, totalLong: 0, totalShort: 0, legs: [] };
        if (side === 'B' || side === 'buy' || side === 'long') {
          symbols[symbol].totalLong += notional;
        } else {
          symbols[symbol].totalShort += notional;
        }
        symbols[symbol].legs.push({ coin, side, notional: parseFloat(notional.toFixed(2)) });
        if (!dbExpectedPerCoin[coin]) dbExpectedPerCoin[coin] = 0;
        dbExpectedPerCoin[coin] += sz;
      };
      processLeg(t.leg_a_coin, t.leg_a_side, t.leg_a_size, t.leg_a_fill_price);
      processLeg(t.leg_b_coin, t.leg_b_side, t.leg_b_size, t.leg_b_fill_price);
    }
    const symbolList = Object.values(symbols).map(s => {
      const maxN = Math.max(s.totalLong, s.totalShort);
      const minN = Math.min(s.totalLong, s.totalShort);
      const hedgePct = maxN > 0 ? (minN / maxN) * 100 : 100;
      const entry = {
        symbol: s.symbol,
        totalLong: parseFloat(s.totalLong.toFixed(2)),
        totalShort: parseFloat(s.totalShort.toFixed(2)),
        net: parseFloat((s.totalLong - s.totalShort).toFixed(2)),
        hedgePct: parseFloat(hedgePct.toFixed(1)),
        status: hedgePct >= 99 ? 'ok' : hedgePct >= 95 ? 'warning' : 'critical',
        legs: s.legs,
      };
      if (onChainPositions) {
        const onChainLegs = [];
        let worstDivergence = 0;
        for (const leg of s.legs) {
          const pos = onChainPositions[leg.coin];
          const dbSize = dbExpectedPerCoin[leg.coin] || 0;
          const onChainSize = pos ? Math.abs(pos.size) : 0;
          const divergence = dbSize > 0 ? Math.abs(onChainSize - dbSize) / dbSize * 100 : (onChainSize > 0 ? 100 : 0);
          if (divergence > worstDivergence) worstDivergence = divergence;
          onChainLegs.push({
            coin: leg.coin,
            dbSize: parseFloat(dbSize.toFixed(6)),
            onChainSize: parseFloat(onChainSize.toFixed(6)),
            divergencePct: parseFloat(divergence.toFixed(1)),
          });
        }
        entry.onChainLegs = onChainLegs;
        entry.onChainDivergencePct = parseFloat(worstDivergence.toFixed(1));
        if (worstDivergence > 20) entry.status = 'critical';
        else if (worstDivergence > 5 && entry.status === 'ok') entry.status = 'warning';
      }
      return entry;
    });
    symbolList.sort((a, b) => a.symbol.localeCompare(b.symbol));
    return { lastCheck: Date.now(), symbols: symbolList };
}

app.get('/bot/hedge-status', async (req, res) => {
  try {
    const result = await db.pool.query(`
      SELECT leg_a_coin, leg_a_side, leg_a_size, leg_a_fill_price,
             leg_b_coin, leg_b_side, leg_b_size, leg_b_fill_price
      FROM bot_trades WHERE status = 'open' AND bot_id = 'bot1'
    `);
    let onChain = null;
    try { onChain = await e1._hlApi.getDeployerPositions(e1._hlApi.getActiveAddress() || e1._activeAddress); } catch (_) {}
    res.json(buildHedgeStatus(result.rows, onChain));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/bot/hedge-status-global', async (req, res) => {
  try {
    const result = await db.pool.query(`
      SELECT leg_a_coin, leg_a_side, leg_a_size, leg_a_fill_price,
             leg_b_coin, leg_b_side, leg_b_size, leg_b_fill_price
      FROM bot_trades WHERE status = 'open'
    `);
    res.json(buildHedgeStatus(result.rows));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/bot/pair-stats', async (req, res) => {
  const pairMids = {};
  for (const [id, eng] of Object.entries(engines)) {
    pairMids[id] = eng.lastMids;
  }
  const stats = await executionEngine.getPairStats(pairMids);
  res.json(stats);
});

let cachedFundingRates = { rates: {}, ts: 0 };
const FUNDING_CACHE_MS = 60000;

app.get('/bot/funding', async (req, res) => {
  try {
    const now = Date.now();
    if (now - cachedFundingRates.ts > FUNDING_CACHE_MS) {
      const dexNames = new Set();
      for (const p of pairs) {
        const [dA] = p.marketA.split(':');
        const [dB] = p.marketB.split(':');
        dexNames.add(dA);
        dexNames.add(dB);
      }
      cachedFundingRates = { rates: await hlApi.getFundingRates([...dexNames]), ts: now };
    }

    await executionEngine._refreshFundingPayments();

    const openTrades = await db.pool.query(
      `SELECT id, pair_id, leg_a_coin, leg_a_side, leg_a_size, leg_a_fill_price, 
              leg_b_coin, leg_b_side, leg_b_size, leg_b_fill_price, entry_ts
       FROM bot_trades WHERE status = 'open' AND bot_id = 'bot1'`
    );
    const closedTrades = await db.pool.query(
      `SELECT id, pair_id, leg_a_coin, leg_a_side, leg_a_size, leg_a_fill_price, 
              leg_b_coin, leg_b_side, leg_b_size, leg_b_fill_price, entry_ts, close_ts
       FROM bot_trades WHERE status = 'closed' AND bot_id = 'bot1'`
    );

    const rates = cachedFundingRates.rates;
    const totalWalletFunding = executionEngine.getTotalWalletFunding();

    res.json({
      fundingNet: totalWalletFunding,
      totalWalletFunding,
      rates,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/bot/dust', async (req, res) => {
  res.json({ positions: [], message: 'Dust detection removed in position model' });
});

app.post('/bot/dust/close/:tradeId', async (req, res) => {
  res.json({ ok: false, error: 'Dust close removed in position model' });
});

app.post('/bot/dust/close-all', async (req, res) => {
  res.json({ ok: false, error: 'Dust close removed in position model' });
});

app.get('/bot/stable-balances', (req, res) => {
  try {
    res.json(executionEngine.getStableBalances());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/bot/stable-rebalance', async (req, res) => {
  try {
    if (req.body.targets) {
      await executionEngine.updateConfig({ stableTargets: req.body.targets });
    }
    if (req.body.driftThreshold !== undefined) {
      await executionEngine.updateConfig({ driftThreshold: req.body.driftThreshold });
    }
    if (req.body.action === 'rebalance') {
      const result = await executionEngine.triggerStableRebalance();
      return res.json(result);
    }
    res.json({ ok: true, config: { stableTargets: executionEngine._stableTargets, driftThreshold: executionEngine._driftThreshold } });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

const _crossWalletConfig = {
  autoEnabled: false,
  crossCheckIntervalSec: 300,
  crossCooldownSec: 600,
};
let _crossWalletLastTransferTs = 0;
const _crossWalletHistory = [];
const CROSS_WALLET_HISTORY_MAX = 20;
let _crossWalletInterval = null;

function _getCrossWalletStatus() {
  const bot1Margin = executionEngine.getMarginInfo();
  const bot1Dry = executionEngine.isWalletDry();
  const bot1CanDonate = executionEngine.canDonate();
  const bot1Balances = executionEngine._cachedBalances || {};

  let bot2Margin = null;
  let bot2Dry = false;
  let bot2CanDonate = false;
  let bot2Balances = {};
  let bot2Active = false;

  if (executionEngine2) {
    bot2Active = true;
    bot2Margin = executionEngine2.getMarginInfo();
    bot2Dry = executionEngine2.isWalletDry();
    bot2CanDonate = executionEngine2.canDonate();
    bot2Balances = executionEngine2._cachedBalances || {};
  }

  const now = Date.now();
  const cooldownRemainingSec = Math.max(0, (_crossWalletLastTransferTs + _crossWalletConfig.crossCooldownSec * 1000 - now) / 1000);
  const cooldownActive = cooldownRemainingSec > 0;

  return {
    bot2Active,
    bot1: {
      margin: bot1Margin,
      isDry: bot1Dry,
      canDonate: bot1CanDonate,
      balances: { usdc: bot1Balances.usdc || 0, usdt: bot1Balances.usdt || 0, usdh: bot1Balances.usdh || 0 },
    },
    bot2: bot2Active ? {
      margin: bot2Margin,
      isDry: bot2Dry,
      canDonate: bot2CanDonate,
      balances: { usdc: bot2Balances.usdc || 0, usdt: bot2Balances.usdt || 0, usdh: bot2Balances.usdh || 0 },
    } : null,
    cooldownActive,
    cooldownRemainingSec: Math.round(cooldownRemainingSec),
    lastTransferTs: _crossWalletLastTransferTs,
    config: { ..._crossWalletConfig, dryThresholdPct: executionEngine._dryThresholdPct, donateThresholdPct: executionEngine._donateThresholdPct },
    history: _crossWalletHistory.slice(-CROSS_WALLET_HISTORY_MAX),
  };
}

async function _executeCrossWalletTransfer() {
  if (!executionEngine2) return { ok: false, error: 'Bot2 not active' };

  const bot1Dry = executionEngine.isWalletDry();
  const bot2Dry = executionEngine2.isWalletDry();
  const bot1CanDonate = executionEngine.canDonate();
  const bot2CanDonate = executionEngine2.canDonate();

  let donor = null;
  let receiver = null;
  let donorApi = null;
  let receiverAddr = null;
  let direction = '';

  if (bot1Dry && bot2CanDonate) {
    donor = executionEngine2;
    receiver = executionEngine;
    donorApi = bot2Api;
    receiverAddr = await bot1Api.getWalletAddress();
    direction = 'bot2→bot1';
  } else if (bot2Dry && bot1CanDonate) {
    donor = executionEngine;
    receiver = executionEngine2;
    donorApi = bot1Api;
    receiverAddr = await bot2Api.getWalletAddress();
    direction = 'bot1→bot2';
  } else {
    return { ok: false, error: 'No wallet is dry with another able to donate' };
  }

  const donorBalances = donor._cachedBalances || {};
  const actions = [];
  const ts = Date.now();

  try {
    const usdcAmt = Math.floor((donorBalances.usdc || 0) * 0.5 * 100) / 100;
    if (usdcAmt >= 1) {
      try {
        await donorApi.usdTransfer(receiverAddr, usdcAmt);
        actions.push({ token: 'USDC', amount: usdcAmt, status: 'ok' });
        console.log(`[CrossWallet] ${direction}: Transferred $${usdcAmt} USDC`);
      } catch (e) {
        actions.push({ token: 'USDC', amount: usdcAmt, status: 'error', error: e.message });
        console.error(`[CrossWallet] USDC transfer error:`, e.message);
      }
    }

    const usdtAmt = Math.floor((donorBalances.usdt || 0) * 0.5 * 100) / 100;
    if (usdtAmt >= 1) {
      try {
        await donorApi.spotTransfer(receiverAddr, 'USDT', usdtAmt);
        actions.push({ token: 'USDT', amount: usdtAmt, status: 'ok' });
        console.log(`[CrossWallet] ${direction}: Transferred $${usdtAmt} USDT`);
      } catch (e) {
        actions.push({ token: 'USDT', amount: usdtAmt, status: 'error', error: e.message });
        console.error(`[CrossWallet] USDT transfer error:`, e.message);
      }
    }

    const usdhAmt = Math.floor((donorBalances.usdh || 0) * 0.5 * 100) / 100;
    if (usdhAmt >= 1) {
      try {
        await donorApi.spotTransfer(receiverAddr, 'USDH', usdhAmt);
        actions.push({ token: 'USDH', amount: usdhAmt, status: 'ok' });
        console.log(`[CrossWallet] ${direction}: Transferred $${usdhAmt} USDH`);
      } catch (e) {
        actions.push({ token: 'USDH', amount: usdhAmt, status: 'error', error: e.message });
        console.error(`[CrossWallet] USDH transfer error:`, e.message);
      }
    }

    if (actions.length === 0) {
      return { ok: false, error: 'No tokens to transfer (amounts too small)' };
    }

    _crossWalletLastTransferTs = ts;
    const historyEntry = { ts, direction, actions, donorMargin: donor.getMarginInfo(), receiverMargin: receiver.getMarginInfo() };
    _crossWalletHistory.push(historyEntry);
    if (_crossWalletHistory.length > CROSS_WALLET_HISTORY_MAX) _crossWalletHistory.shift();

    console.log(`[CrossWallet] Transfer complete ${direction}: ${actions.filter(a => a.status === 'ok').length}/${actions.length} successful`);
    return { ok: true, direction, actions, ts };
  } catch (e) {
    console.error(`[CrossWallet] Transfer error:`, e.message);
    return { ok: false, error: e.message, actions };
  }
}

async function _checkCrossWalletBalance() {
  if (!executionEngine2) return;
  if (!_crossWalletConfig.autoEnabled) return;

  const now = Date.now();
  const cooldownMs = _crossWalletConfig.crossCooldownSec * 1000;
  if (now - _crossWalletLastTransferTs < cooldownMs) return;

  const bot1Dry = executionEngine.isWalletDry();
  const bot2Dry = executionEngine2.isWalletDry();
  const bot1CanDonate = executionEngine.canDonate();
  const bot2CanDonate = executionEngine2.canDonate();

  if ((bot1Dry && bot2CanDonate) || (bot2Dry && bot1CanDonate)) {
    console.log(`[CrossWallet] Auto-check triggered: bot1 dry=${bot1Dry} donate=${bot1CanDonate}, bot2 dry=${bot2Dry} donate=${bot2CanDonate}`);
    await _executeCrossWalletTransfer();
  }
}

function _startCrossWalletChecker() {
  if (_crossWalletInterval) clearInterval(_crossWalletInterval);
  _crossWalletInterval = setInterval(() => _checkCrossWalletBalance(), _crossWalletConfig.crossCheckIntervalSec * 1000);
}

function _restartCrossWalletChecker() {
  if (_crossWalletInterval) clearInterval(_crossWalletInterval);
  _crossWalletInterval = setInterval(() => _checkCrossWalletBalance(), _crossWalletConfig.crossCheckIntervalSec * 1000);
}

if (executionEngine2) {
  _startCrossWalletChecker();
}

app.get('/bot/cross-balance', (req, res) => {
  try {
    res.json(_getCrossWalletStatus());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/bot/cross-rebalance', async (req, res) => {
  try {
    if (!executionEngine2) return res.status(400).json({ ok: false, error: 'Bot2 not active' });

    const now = Date.now();
    const cooldownMs = _crossWalletConfig.crossCooldownSec * 1000;
    if (now - _crossWalletLastTransferTs < cooldownMs) {
      const remain = Math.round((_crossWalletLastTransferTs + cooldownMs - now) / 1000);
      return res.status(429).json({ ok: false, error: `Cooldown active (${remain}s remaining)` });
    }

    const result = await _executeCrossWalletTransfer();
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/bot/cross-rebalance-config', async (req, res) => {
  try {
    if (req.body.autoEnabled !== undefined) {
      _crossWalletConfig.autoEnabled = !!req.body.autoEnabled;
    }
    if (req.body.crossCheckIntervalSec !== undefined) {
      _crossWalletConfig.crossCheckIntervalSec = Math.max(60, Math.min(1800, parseInt(req.body.crossCheckIntervalSec) || 300));
      _restartCrossWalletChecker();
    }
    if (req.body.crossCooldownSec !== undefined) {
      _crossWalletConfig.crossCooldownSec = Math.max(300, Math.min(3600, parseInt(req.body.crossCooldownSec) || 600));
    }
    if (req.body.dryThresholdPct !== undefined) {
      const val = parseFloat(req.body.dryThresholdPct);
      if (val >= 1 && val <= 20) {
        await executionEngine.updateConfig({ dryThresholdPct: val });
        if (executionEngine2) await executionEngine2.updateConfig({ dryThresholdPct: val });
      }
    }
    if (req.body.donateThresholdPct !== undefined) {
      const val = parseFloat(req.body.donateThresholdPct);
      if (val >= 5 && val <= 30) {
        await executionEngine.updateConfig({ donateThresholdPct: val });
        if (executionEngine2) await executionEngine2.updateConfig({ donateThresholdPct: val });
      }
    }
    console.log(`[CrossWallet] Config updated: auto=${_crossWalletConfig.autoEnabled}, interval=${_crossWalletConfig.crossCheckIntervalSec}s, cooldown=${_crossWalletConfig.crossCooldownSec}s`);
    res.json({ ok: true, config: { ..._crossWalletConfig, dryThresholdPct: executionEngine._dryThresholdPct, donateThresholdPct: executionEngine._donateThresholdPct } });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/bot/slippage-stats', async (req, res) => {
  try {
    const now = Date.now();
    const tsMin = now - 3 * 86400000;
    const r = await db.pool.query(`
      SELECT pair_id,
        COUNT(*)::int as trades,
        ROUND(AVG(slippage_entry_bps)::numeric, 2) as avg_slip,
        ROUND((PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY slippage_entry_bps))::numeric, 2) as p50_slip,
        ROUND(MAX(slippage_entry_bps)::numeric, 2) as max_slip
      FROM bot_trades
      WHERE status IN ('open','closed') AND slippage_entry_bps IS NOT NULL AND entry_ts > $1 AND bot_id = 'bot1'
      GROUP BY pair_id ORDER BY avg_slip DESC
    `, [tsMin]);
    const result = {};
    for (const row of r.rows) {
      result[row.pair_id] = {
        trades: row.trades,
        avgSlip: parseFloat(row.avg_slip),
        p50Slip: parseFloat(row.p50_slip),
        maxSlip: parseFloat(row.max_slip),
      };
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/bot/pnl-reconciliation', async (req, res) => {
  try {
    const trades = await db.pool.query(`
      SELECT id, pair_id, direction, status, entry_ts, close_ts,
             leg_a_coin, leg_a_side, leg_a_size, leg_a_fill_price, close_leg_a_price,
             leg_b_coin, leg_b_side, leg_b_size, leg_b_fill_price, close_leg_b_price,
             realized_pnl_usd, realized_pnl_bps, fees_usd, error_cost_usd, error_msg,
             signal_edge_bps, slippage_entry_bps, target_profit_bps
      FROM bot_trades WHERE status IN ('closed','error','orphan_closed','closing') AND bot_id = 'bot1'
      ORDER BY close_ts DESC NULLS LAST LIMIT 200
    `);

    const now = Date.now();
    await executionEngine._refreshFundingPayments();

    const totalWalletFunding = executionEngine.getTotalWalletFunding();
    let totalGross = 0, totalFees = 0, totalErrorCost = 0;
    const details = trades.rows.map(t => {
      const gross = parseFloat(t.realized_pnl_usd) || 0;
      const fees = parseFloat(t.fees_usd) || 0;
      const errorCost = parseFloat(t.error_cost_usd) || 0;
      const holdMs = (parseInt(t.close_ts) || now) - parseInt(t.entry_ts);

      const net = gross - fees - errorCost;
      totalGross += gross;
      totalFees += fees;
      totalErrorCost += errorCost;

      return {
        id: t.id, pair: t.pair_id, dir: t.direction, status: t.status,
        entryTs: t.entry_ts, closeTs: t.close_ts, holdMin: (holdMs / 60000).toFixed(1),
        legA: { coin: t.leg_a_coin, side: t.leg_a_side, size: t.leg_a_size, entryPx: t.leg_a_fill_price, exitPx: t.close_leg_a_price },
        legB: { coin: t.leg_b_coin, side: t.leg_b_side, size: t.leg_b_size, entryPx: t.leg_b_fill_price, exitPx: t.close_leg_b_price },
        grossPnl: gross.toFixed(4), fees: fees.toFixed(4),
        errorCost: errorCost.toFixed(4), netPnl: net.toFixed(4),
        signalEdge: t.signal_edge_bps, slippage: t.slippage_entry_bps, targetTp: t.target_profit_bps,
        error: t.error_msg
      };
    });

    const lsForDn = await executionEngine.getLiveStats();
    const dnCost = lsForDn.dnAdjustmentCostUsd || 0;
    const orphanCost = lsForDn.orphanCostUsd || 0;

    res.json({
      totals: {
        grossPnl: totalGross.toFixed(4),
        fees: totalFees.toFixed(4),
        funding: totalWalletFunding.toFixed(4),
        errorCost: totalErrorCost.toFixed(4),
        dnCost: dnCost.toFixed(4),
        orphanCost: orphanCost.toFixed(4),
        orphansClosed: lsForDn.orphansClosed || 0,
        netPnl: (totalGross - totalFees + totalWalletFunding - totalErrorCost - dnCost).toFixed(4),
      },
      trades: details
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/bot/missed-stats', (req, res) => {
  res.json(executionEngine.getMissedStats());
});

app.get('/bot/fee-drift', async (req, res) => {
  try {
    const last50 = await db.pool.query(`
      SELECT id, pair_id, direction, entry_ts, fees_usd, expected_fees_usd,
             leg_a_fill_price, leg_a_size, leg_b_fill_price, leg_b_size
      FROM bot_trades
      WHERE status IN ('open','closed') AND fees_usd IS NOT NULL AND bot_id = 'bot1'
      ORDER BY entry_ts DESC LIMIT 50
    `);

    const daily = await db.pool.query(`
      SELECT
        TO_CHAR(TO_TIMESTAMP(entry_ts / 1000.0) AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD') as day,
        COUNT(*)::int as trades,
        ROUND(SUM(fees_usd)::numeric, 4) as total_realized,
        ROUND(SUM(COALESCE(expected_fees_usd, fees_usd))::numeric, 4) as total_expected,
        ROUND(AVG(fees_usd)::numeric, 6) as avg_realized,
        ROUND(AVG(COALESCE(expected_fees_usd, fees_usd))::numeric, 6) as avg_expected
      FROM bot_trades
      WHERE status IN ('open','closed') AND fees_usd IS NOT NULL AND bot_id = 'bot1'
      GROUP BY day ORDER BY day DESC LIMIT 14
    `);

    const trades = last50.rows.map(t => {
      const realized = parseFloat(t.fees_usd) || 0;
      const expected = parseFloat(t.expected_fees_usd) || realized;
      const notional = (parseFloat(t.leg_a_fill_price) * parseFloat(t.leg_a_size) + parseFloat(t.leg_b_fill_price) * parseFloat(t.leg_b_size)) / 2;
      const driftBps = notional > 0 ? ((realized - expected) / notional) * 10000 : 0;
      return {
        id: t.id,
        pair: t.pair_id,
        dir: t.direction,
        ts: parseInt(t.entry_ts),
        realized: realized.toFixed(4),
        expected: expected.toFixed(4),
        driftUsd: (realized - expected).toFixed(4),
        driftBps: Math.round(driftBps * 100) / 100,
      };
    });

    const totalRealized = trades.reduce((s, t) => s + parseFloat(t.realized), 0);
    const totalExpected = trades.reduce((s, t) => s + parseFloat(t.expected), 0);
    const avgDriftBps = trades.length > 0 ? trades.reduce((s, t) => s + t.driftBps, 0) / trades.length : 0;

    res.json({
      trades,
      daily: daily.rows.map(d => ({
        day: d.day,
        trades: d.trades,
        totalRealized: parseFloat(d.total_realized),
        totalExpected: parseFloat(d.total_expected),
        avgRealized: parseFloat(d.avg_realized),
        avgExpected: parseFloat(d.avg_expected),
        driftUsd: (parseFloat(d.total_realized) - parseFloat(d.total_expected)).toFixed(4),
      })),
      summary: {
        totalRealized: totalRealized.toFixed(4),
        totalExpected: totalExpected.toFixed(4),
        avgDriftBps: Math.round(avgDriftBps * 100) / 100,
        alert: Math.abs(avgDriftBps) > 0.5,
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/bot/activity', (req, res) => {
  const n = parseInt(req.query.n || '50');
  res.json(executionEngine.getActivityLog(n));
});

const _sseClients = new Set();

app.get('/bot/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('data: {"type":"CONNECTED"}\n\n');

  const client = { res };
  _sseClients.add(client);

  const unsubBot1 = executionEngine.onEvent((event) => {
    try { res.write(`data: ${JSON.stringify(event)}\n\n`); } catch (e) {}
  });
  let unsubBot2 = null;
  if (executionEngine2) {
    unsubBot2 = executionEngine2.onEvent((event) => {
      try { res.write(`data: ${JSON.stringify(event)}\n\n`); } catch (e) {}
    });
  }

  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch (e) {}
  }, 30000);

  let cleaned = false;
  function cleanup() {
    if (cleaned) return;
    cleaned = true;
    _sseClients.delete(client);
    unsubBot1();
    if (unsubBot2) unsubBot2();
    clearInterval(heartbeat);
  }
  req.on('close', cleanup);
  req.on('error', cleanup);
  res.on('error', cleanup);
});

app.get('/bot/activity-history', async (req, res) => {
  try {
    const result = await db.getActivityHistoryPaginated({
      page: req.query.page,
      limit: req.query.limit,
      pair: req.query.pair || undefined,
      type: req.query.type || undefined,
      motif: req.query.motif || undefined,
      from: req.query.from || undefined,
      to: req.query.to || undefined,
      search: req.query.search || undefined,
      botId: req.query.botId || 'bot1',
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/bot/edge-floor', async (req, res) => {
  try {
    const now = Date.now();
    const { dow: currentDow } = getParisTime(new Date(now));
    const dayNames = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
    const maxAgeDays = 21;
    const tsMin = now - maxAgeDays * 24 * 3600 * 1000;

    let dowFilter, mode;
    if (req.query.dow !== undefined) {
      const qDow = parseInt(req.query.dow);
      dowFilter = [qDow];
      mode = dayNames[qDow];
    } else {
      dowFilter = [currentDow];
      mode = dayNames[currentDow];
    }

    let result = await db.pool.query(`
      WITH base AS (
        SELECT pair_id,
          ROUND(AVG(max_edge_bps)::numeric, 2) as avg_edge,
          ROUND(percentile_cont(0.25) WITHIN GROUP (ORDER BY max_edge_bps)::numeric, 2) as p25_edge,
          ROUND(percentile_cont(0.10) WITHIN GROUP (ORDER BY max_edge_bps)::numeric, 2) as p10_edge,
          ROUND(MIN(max_edge_bps)::numeric, 2) as min_edge,
          ROUND(percentile_cont(0.50) WITHIN GROUP (ORDER BY dir1_edge_bps)::numeric, 2) as p50_dir1,
          ROUND(percentile_cont(0.50) WITHIN GROUP (ORDER BY dir2_edge_bps)::numeric, 2) as p50_dir2,
          ROUND(AVG(dir1_edge_bps)::numeric, 2) as avg_dir1,
          ROUND(AVG(dir2_edge_bps)::numeric, 2) as avg_dir2,
          ROUND(MAX(dir1_edge_bps)::numeric, 2) as max_dir1,
          ROUND(MAX(dir2_edge_bps)::numeric, 2) as max_dir2,
          COUNT(*) FILTER (WHERE dir1_edge_bps >= 10) as d1_above_10,
          COUNT(*) FILTER (WHERE dir2_edge_bps >= 10) as d2_above_10,
          COUNT(*) as samples
        FROM edge_snapshots
        WHERE ts > $1
          AND EXTRACT(DOW FROM to_timestamp(ts / 1000.0) AT TIME ZONE '${TIMEZONE}') = ANY($2::int[])
        GROUP BY pair_id
      ),
      liq AS (
        SELECT e.pair_id,
          COUNT(*) FILTER (WHERE e.dir1_edge_bps <= ABS(b.p50_dir1) + 2 AND (e.dir1_status = 'INSUFFICIENT_DEPTH' OR e.dir1_status = 'TOO_MUCH_SLIPPAGE')) as d1_no_liq,
          COUNT(*) FILTER (WHERE e.dir1_edge_bps <= ABS(b.p50_dir1) + 2) as d1_near_floor,
          COUNT(*) FILTER (WHERE e.dir2_edge_bps <= ABS(b.p50_dir2) + 2 AND (e.dir2_status = 'INSUFFICIENT_DEPTH' OR e.dir2_status = 'TOO_MUCH_SLIPPAGE')) as d2_no_liq,
          COUNT(*) FILTER (WHERE e.dir2_edge_bps <= ABS(b.p50_dir2) + 2) as d2_near_floor
        FROM edge_snapshots e
        JOIN base b ON e.pair_id = b.pair_id
        WHERE e.ts > $1
          AND EXTRACT(DOW FROM to_timestamp(e.ts / 1000.0) AT TIME ZONE '${TIMEZONE}') = ANY($2::int[])
        GROUP BY e.pair_id
      )
      SELECT b.*, l.d1_no_liq, l.d1_near_floor, l.d2_no_liq, l.d2_near_floor
      FROM base b LEFT JOIN liq l ON b.pair_id = l.pair_id
      ORDER BY b.avg_edge DESC
    `, [tsMin, dowFilter]);

    if (result.rows.length === 0) {
      const tsMin72 = now - 72 * 3600 * 1000;
      result = await db.pool.query(`
        WITH base AS (
          SELECT pair_id,
            ROUND(AVG(max_edge_bps)::numeric, 2) as avg_edge,
            ROUND(percentile_cont(0.25) WITHIN GROUP (ORDER BY max_edge_bps)::numeric, 2) as p25_edge,
            ROUND(percentile_cont(0.10) WITHIN GROUP (ORDER BY max_edge_bps)::numeric, 2) as p10_edge,
            ROUND(MIN(max_edge_bps)::numeric, 2) as min_edge,
            ROUND(percentile_cont(0.50) WITHIN GROUP (ORDER BY dir1_edge_bps)::numeric, 2) as p50_dir1,
            ROUND(percentile_cont(0.50) WITHIN GROUP (ORDER BY dir2_edge_bps)::numeric, 2) as p50_dir2,
            ROUND(AVG(dir1_edge_bps)::numeric, 2) as avg_dir1,
            ROUND(AVG(dir2_edge_bps)::numeric, 2) as avg_dir2,
            ROUND(MAX(dir1_edge_bps)::numeric, 2) as max_dir1,
            ROUND(MAX(dir2_edge_bps)::numeric, 2) as max_dir2,
            COUNT(*) FILTER (WHERE dir1_edge_bps >= 10) as d1_above_10,
            COUNT(*) FILTER (WHERE dir2_edge_bps >= 10) as d2_above_10,
            COUNT(*) as samples
          FROM edge_snapshots
          WHERE ts > $1
          GROUP BY pair_id
        ),
        liq AS (
          SELECT e.pair_id,
            COUNT(*) FILTER (WHERE e.dir1_edge_bps <= ABS(b.p50_dir1) + 2 AND (e.dir1_status = 'INSUFFICIENT_DEPTH' OR e.dir1_status = 'TOO_MUCH_SLIPPAGE')) as d1_no_liq,
            COUNT(*) FILTER (WHERE e.dir1_edge_bps <= ABS(b.p50_dir1) + 2) as d1_near_floor,
            COUNT(*) FILTER (WHERE e.dir2_edge_bps <= ABS(b.p50_dir2) + 2 AND (e.dir2_status = 'INSUFFICIENT_DEPTH' OR e.dir2_status = 'TOO_MUCH_SLIPPAGE')) as d2_no_liq,
            COUNT(*) FILTER (WHERE e.dir2_edge_bps <= ABS(b.p50_dir2) + 2) as d2_near_floor
          FROM edge_snapshots e
          JOIN base b ON e.pair_id = b.pair_id
          WHERE e.ts > $1
          GROUP BY e.pair_id
        )
        SELECT b.*, l.d1_no_liq, l.d1_near_floor, l.d2_no_liq, l.d2_near_floor
        FROM base b LEFT JOIN liq l ON b.pair_id = l.pair_id
        ORDER BY b.avg_edge DESC
      `, [tsMin72]);
      mode = `fallback 72h`;
    }
    const isFallback = mode === 'fallback 72h';
    const pairObjThresholds = [];
    for (const row of result.rows) {
      const objBps = executionEngine.getPairObjectifBps(row.pair_id);
      pairObjThresholds.push({ pairId: row.pair_id, objBps });
    }

    let aboveObjCounts = {};
    if (pairObjThresholds.length > 0) {
      const aboveTs = isFallback ? (now - 72 * 3600 * 1000) : tsMin;
      let baseParams, nextIdx;
      if (isFallback) {
        baseParams = [aboveTs];
        nextIdx = 2;
      } else {
        baseParams = [tsMin, dowFilter];
        nextIdx = 3;
      }
      const valuesClause = pairObjThresholds.map((p, i) => `($${i * 2 + nextIdx}, $${i * 2 + nextIdx + 1})`).join(', ');
      const valuesParams = pairObjThresholds.flatMap(p => [p.pairId, p.objBps]);
      const dowClause = isFallback ? '' : `AND EXTRACT(DOW FROM to_timestamp(e.ts / 1000.0) AT TIME ZONE '${TIMEZONE}') = ANY($2::int[])`;
      const aboveRes = await db.pool.query(`
        WITH thresholds(pair_id, obj) AS (VALUES ${valuesClause})
        SELECT e.pair_id,
          COUNT(*) FILTER (WHERE e.dir1_edge_bps >= t.obj::numeric) as d1_above_obj,
          COUNT(*) FILTER (WHERE e.dir2_edge_bps >= t.obj::numeric) as d2_above_obj,
          COUNT(*) as samples
        FROM edge_snapshots e
        JOIN thresholds t ON e.pair_id = t.pair_id::text
        WHERE e.ts > $1
          ${dowClause}
        GROUP BY e.pair_id
      `, [...baseParams, ...valuesParams]);
      for (const r of aboveRes.rows) {
        aboveObjCounts[r.pair_id] = {
          d1: parseInt(r.d1_above_obj || 0),
          d2: parseInt(r.d2_above_obj || 0),
          samples: parseInt(r.samples || 0),
        };
      }
    }

    const floors = {};
    for (const row of result.rows) {
      const s = parseInt(row.samples);
      const d1Near = parseInt(row.d1_near_floor || 0);
      const d2Near = parseInt(row.d2_near_floor || 0);
      const d1NoLiq = parseInt(row.d1_no_liq || 0);
      const d2NoLiq = parseInt(row.d2_no_liq || 0);
      const aboveObj = aboveObjCounts[row.pair_id] || { d1: 0, d2: 0, samples: s };
      floors[row.pair_id] = {
        avgEdge: parseFloat(row.avg_edge),
        p25Edge: parseFloat(row.p25_edge),
        p10Edge: parseFloat(row.p10_edge),
        minEdge: parseFloat(row.min_edge),
        p50Dir1: parseFloat(row.p50_dir1),
        p50Dir2: parseFloat(row.p50_dir2),
        avgDir1: parseFloat(row.avg_dir1),
        avgDir2: parseFloat(row.avg_dir2),
        maxDir1: parseFloat(row.max_dir1),
        maxDir2: parseFloat(row.max_dir2),
        pctD1AboveObj: s > 0 ? parseFloat((aboveObj.d1 / s * 100).toFixed(1)) : 0,
        pctD2AboveObj: s > 0 ? parseFloat((aboveObj.d2 / s * 100).toFixed(1)) : 0,
        liqD1: d1Near > 0 ? parseFloat(((1 - d1NoLiq / d1Near) * 100).toFixed(1)) : 100,
        liqD2: d2Near > 0 ? parseFloat(((1 - d2NoLiq / d2Near) * 100).toFixed(1)) : 100,
        samples: s,
      };
    }
    const totalSamples = result.rows.reduce((s, r) => s + parseInt(r.samples || 0), 0);
    res.json({ floors, dayMode: mode, dayOfWeek: currentDow, totalSamples });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/bot/edge-stats', async (req, res) => {
  try {
    const stats = await db.getEdgeStats();
    res.json(stats);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/bot/edge-history/:pairId', async (req, res) => {
  try {
    const hours = parseInt(req.query.hours || '24');
    const data = await db.getEdgeHistory(req.params.pairId, hours);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/bot/chart-data/:pairId', async (req, res) => {
  try {
    const hours = parseInt(req.query.hours || '4');
    const since = Date.now() - hours * 3600 * 1000;
    const rows = await db.pool.query(
      `SELECT ts, dir1_edge_bps, dir2_edge_bps, max_edge_bps, mid_a, mid_b
       FROM edge_snapshots WHERE pair_id = $1 AND ts >= $2 ORDER BY ts ASC`,
      [req.params.pairId, since]
    );
    const pairCfg = executionEngine?.pairConfigs?.[req.params.pairId];
    const entryMinBps = pairCfg?.entryMinBps || 3;
    res.json({ snapshots: rows.rows, entryMinBps });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/bot/chart-data-1s/:pairId', (req, res) => {
  const engine = engines[req.params.pairId];
  if (!engine) return res.status(404).json({ error: 'Pair not found' });
  const seconds = Math.min(3600, Math.max(1, parseInt(req.query.seconds || '300')));
  const all = engine.ringBuffer1s.getAll();
  const sliced = all.slice(-seconds);
  const labels = [];
  const midA = [];
  const midB = [];
  const d1 = [];
  const d2 = [];
  const midSpreadBps = [];
  const depthA = [];
  const depthB = [];
  const bestBidA = [];
  const bestAskA = [];
  const bestBidB = [];
  const bestAskB = [];
  for (const entry of sliced) {
    labels.push(entry.ts);
    midA.push(entry.midA);
    midB.push(entry.midB);
    d1.push(entry.dir1EdgeBps);
    d2.push(entry.dir2EdgeBps);
    midSpreadBps.push(entry.midSpreadBps);
    depthA.push(entry.depthA_2bps);
    depthB.push(entry.depthB_2bps);
    bestBidA.push(entry.bestBidA || 0);
    bestAskA.push(entry.bestAskA || 0);
    bestBidB.push(entry.bestBidB || 0);
    bestAskB.push(entry.bestAskB || 0);
  }
  res.json({ pairId: req.params.pairId, labels, midA, midB, d1, d2, midSpreadBps, depthA, depthB, bestBidA, bestAskA, bestBidB, bestAskB });
});

app.get('/bot/chart-data-all-1s', (req, res) => {
  const seconds = Math.min(3600, Math.max(1, parseInt(req.query.seconds || '300')));
  let downsampleStep = 1;
  if (seconds > 1800) downsampleStep = 5;
  else if (seconds > 600) downsampleStep = 2;
  const pairsData = {};
  for (const [pairId, engine] of Object.entries(engines)) {
    const all = engine.ringBuffer1s.getAll();
    const sliced = all.slice(-seconds);
    const labels = [];
    const midA = [];
    const midB = [];
    const d1 = [];
    const d2 = [];
    const midSpreadBps = [];
    const bestBidA = [];
    const bestAskA = [];
    const bestBidB = [];
    const bestAskB = [];
    const depthA = [];
    const depthB = [];
    for (let i = 0; i < sliced.length; i += downsampleStep) {
      const entry = sliced[i];
      labels.push(entry.ts);
      midA.push(entry.midA);
      midB.push(entry.midB);
      d1.push(entry.dir1EdgeBps);
      d2.push(entry.dir2EdgeBps);
      midSpreadBps.push(entry.midSpreadBps);
      bestBidA.push(entry.bestBidA || 0);
      bestAskA.push(entry.bestAskA || 0);
      bestBidB.push(entry.bestBidB || 0);
      bestAskB.push(entry.bestAskB || 0);
      depthA.push(entry.depthA_2bps || 0);
      depthB.push(entry.depthB_2bps || 0);
    }
    const zStats = {};
    if (engine.store && engine.store.getZScores) {
      const zd1 = engine.store.getZScores(1);
      const zd2 = engine.store.getZScores(2);
      const feesRT = executionEngine.getPairFeeRoundTripBps(pairId);
      const adaptiveMin = feesRT + executionEngine.slippageMarginBps;
      const s1 = zd1.short.stdBps || 0;
      const s2 = zd2.short.stdBps || 0;
      zStats.d1 = { meanBps: zd1.short.meanBps, stdBps: s1, kalmanZ: zd1.short.kalmanZ, edgeMinBps: Math.round(adaptiveMin * 100) / 100, zMin: s1 > 0 ? Math.round((adaptiveMin / s1) * 100) / 100 : null };
      zStats.d2 = { meanBps: zd2.short.meanBps, stdBps: s2, kalmanZ: zd2.short.kalmanZ, edgeMinBps: Math.round(adaptiveMin * 100) / 100, zMin: s2 > 0 ? Math.round((adaptiveMin / s2) * 100) / 100 : null };
    }
    pairsData[pairId] = { labels, midA, midB, d1, d2, midSpreadBps, bestBidA, bestAskA, bestBidB, bestAskB, depthA, depthB, zStats };
  }
  res.json({ pairs: pairsData });
});

app.get('/bot/chart-data-tick/:pairId', (req, res) => {
  const engine = engines[req.params.pairId];
  if (!engine) return res.status(404).json({ error: 'Pair not found' });
  const seconds = Math.min(120, Math.max(1, parseInt(req.query.seconds || '60')));
  const cutoff = Date.now() - seconds * 1000;
  const all = engine.ringBufferTick.getAll();
  const filtered = all.filter(e => e.ts >= cutoff);
  const labels = [];
  const midA = [];
  const midB = [];
  const bestBidA = [];
  const bestAskA = [];
  const bestBidB = [];
  const bestAskB = [];
  const spreadBps = [];
  const dir1EdgeBps = [];
  const dir2EdgeBps = [];
  const depthA = [];
  const depthB = [];
  for (const entry of filtered) {
    labels.push(entry.ts);
    midA.push(entry.midA);
    midB.push(entry.midB);
    bestBidA.push(entry.bestBidA);
    bestAskA.push(entry.bestAskA);
    bestBidB.push(entry.bestBidB);
    bestAskB.push(entry.bestAskB);
    spreadBps.push(entry.spreadBps);
    dir1EdgeBps.push(entry.dir1EdgeBps);
    dir2EdgeBps.push(entry.dir2EdgeBps);
    depthA.push(entry.depthA_2bps);
    depthB.push(entry.depthB_2bps);
  }
  const zStats = {};
  if (engine.store && engine.store.getZScores) {
    const zd1 = engine.store.getZScores(1);
    const zd2 = engine.store.getZScores(2);
    const feesRT = executionEngine.getPairFeeRoundTripBps(req.params.pairId);
    const adaptiveMin = feesRT + executionEngine.slippageMarginBps;
    const s1 = zd1.short.stdBps || 0;
    const s2 = zd2.short.stdBps || 0;
    zStats.d1 = { meanBps: zd1.short.meanBps, stdBps: s1, kalmanZ: zd1.short.kalmanZ, edgeMinBps: Math.round(adaptiveMin * 100) / 100, zMin: s1 > 0 ? Math.round((adaptiveMin / s1) * 100) / 100 : null };
    zStats.d2 = { meanBps: zd2.short.meanBps, stdBps: s2, kalmanZ: zd2.short.kalmanZ, edgeMinBps: Math.round(adaptiveMin * 100) / 100, zMin: s2 > 0 ? Math.round((adaptiveMin / s2) * 100) / 100 : null };
  }
  res.json({ pairId: req.params.pairId, labels, midA, midB, bestBidA, bestAskA, bestBidB, bestAskB, spreadBps, dir1EdgeBps, dir2EdgeBps, depthA, depthB, zStats });
});

app.get('/bot/chart-signals/:pairId', (req, res) => {
  const engine = engines[req.params.pairId];
  if (!engine) return res.status(404).json({ error: 'Pair not found' });
  const n = parseInt(req.query.n || '50');
  const signals = engine.store.signals.getLast(n);
  const entries = [];
  for (const sig of signals) {
    entries.push({
      ts: sig.ts,
      direction: sig.direction,
      grossOpenEdgeBps: sig.grossOpenEdgeBps,
      netOpenEdgeBps: sig.netOpenEdgeBps,
      type: 'entry',
    });
  }
  const bot1Trades = executionEngine ? (executionEngine.getPositionsMap() || {}) : {};
  const exits = [];
  try {
    const recentCycles = engine.store.repegTracker.getRecentCycles(n);
    for (const cycle of recentCycles) {
      if (cycle.key && cycle.key.includes(req.params.pairId)) {
        exits.push({
          ts: cycle.closeTs,
          direction: cycle.direction,
          theoreticalPnlBps: cycle.theoreticalPnlBps,
          type: 'exit',
        });
      }
    }
  } catch (e) {}
  const combined = [...entries, ...exits].sort((a, b) => a.ts - b.ts).slice(-n);
  res.json({ pairId: req.params.pairId, signals: combined });
});

app.get('/bot/pool-ranking', async (req, res) => {
  try {
    const botId = req.query.botId || 'bot1';
    const result = await db.pool.query(`
      SELECT
        pair_id,
        COUNT(*) as total_trades,
        COUNT(*) FILTER (WHERE status = 'closed') as closed_trades,
        COUNT(*) FILTER (WHERE status = 'open') as open_trades,
        COUNT(*) FILTER (WHERE status = 'closed' AND (realized_pnl_usd - COALESCE(fees_usd, 0)) > 0) as wins,
        COUNT(*) FILTER (WHERE status = 'closed' AND (realized_pnl_usd - COALESCE(fees_usd, 0)) <= 0) as losses,
        COALESCE(SUM(realized_pnl_usd) FILTER (WHERE status = 'closed'), 0) as total_pnl_gross,
        COALESCE(SUM(fees_usd) FILTER (WHERE status = 'closed'), 0) as total_fees,
        COALESCE(SUM(COALESCE(error_cost_usd, 0)), 0) as total_error_cost,
        COALESCE(SUM(
          (CASE WHEN leg_a_fill_price IS NOT NULL THEN leg_a_size * leg_a_fill_price ELSE 0 END +
          CASE WHEN leg_b_fill_price IS NOT NULL THEN leg_b_size * leg_b_fill_price ELSE 0 END) / 2.0
        ) FILTER (WHERE status = 'closed'), 0) as total_volume,
        AVG(CASE WHEN status = 'closed' AND close_ts IS NOT NULL AND entry_ts IS NOT NULL
          THEN (close_ts::bigint - entry_ts::bigint) END) as avg_hold_ms,
        PERCENTILE_CONT(0.5) WITHIN GROUP (
          ORDER BY CASE WHEN status = 'closed' AND close_ts IS NOT NULL AND entry_ts IS NOT NULL
            THEN (close_ts::bigint - entry_ts::bigint) END
        ) as median_hold_ms,
        PERCENTILE_CONT(0.9) WITHIN GROUP (
          ORDER BY CASE WHEN status = 'closed' AND close_ts IS NOT NULL AND entry_ts IS NOT NULL
            THEN (close_ts::bigint - entry_ts::bigint) END
        ) as p90_hold_ms,
        COUNT(*) FILTER (WHERE status IN ('error','orphan_closed','closed_orphan')) as error_count
      FROM bot_trades
      WHERE pair_id NOT LIKE 'dn_adjustment%' AND bot_id = $1
      GROUP BY pair_id
      ORDER BY pair_id
    `, [botId]);

    const pools = result.rows.map(r => {
      const closed = parseInt(r.closed_trades) || 0;
      const total = parseInt(r.total_trades) || 0;
      const wins = parseInt(r.wins) || 0;
      const losses = parseInt(r.losses) || 0;
      const pnlGross = parseFloat(r.total_pnl_gross) || 0;
      const fees = parseFloat(r.total_fees) || 0;
      const errorCost = parseFloat(r.total_error_cost) || 0;
      const volume = parseFloat(r.total_volume) || 0;
      const avgHoldMs = parseFloat(r.avg_hold_ms) || 0;
      const medianHoldMs = parseFloat(r.median_hold_ms) || 0;
      const p90HoldMs = parseFloat(r.p90_hold_ms) || 0;
      const errors = parseInt(r.error_count) || 0;
      const winRate = closed > 0 ? (wins / closed) * 100 : 0;
      const fillRate = total > 0 ? (closed / total) * 100 : 0;
      const pnlPerVol = volume > 0 ? ((pnlGross - fees) / volume) * 10000 : 0;
      const avgHoldMin = avgHoldMs / 60000;
      const score = avgHoldMin > 0 && volume > 0
        ? (pnlPerVol * (fillRate / 100)) / avgHoldMin
        : 0;

      return {
        pairId: r.pair_id,
        totalTrades: total,
        closedTrades: closed,
        openTrades: parseInt(r.open_trades) || 0,
        wins, losses, winRate: Math.round(winRate * 10) / 10,
        pnlGross: Math.round(pnlGross * 10000) / 10000,
        pnlNet: Math.round((pnlGross - fees - errorCost) * 10000) / 10000,
        fees: Math.round(fees * 10000) / 10000,
        volume: Math.round(volume * 100) / 100,
        pnlPerVolBps: Math.round(pnlPerVol * 100) / 100,
        fillRate: Math.round(fillRate * 10) / 10,
        avgHoldMs: Math.round(avgHoldMs),
        medianHoldMs: Math.round(medianHoldMs),
        p90HoldMs: Math.round(p90HoldMs),
        errors,
        score: Math.round(score * 1000) / 1000,
      };
    });

    pools.sort((a, b) => b.score - a.score);

    res.json({ pools });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/bot/capital-allocation', async (req, res) => {
  try {
    const totalCapital = parseFloat(req.query.capital) || 1000;
    const maxLeverage = parseInt(req.query.leverage) || 5;
    const riskPref = req.query.risk || 'normal';
    const botId = req.query.botId || 'bot1';

    const result = await db.pool.query(`
      SELECT
        pair_id,
        COUNT(*) as total_trades,
        COUNT(*) FILTER (WHERE status = 'closed') as closed_trades,
        COUNT(*) FILTER (WHERE status = 'closed' AND (realized_pnl_usd - COALESCE(fees_usd, 0)) > 0) as wins,
        COALESCE(SUM(realized_pnl_usd) FILTER (WHERE status = 'closed'), 0) as total_pnl_gross,
        COALESCE(SUM(fees_usd) FILTER (WHERE status = 'closed'), 0) as total_fees,
        COALESCE(SUM(COALESCE(error_cost_usd, 0)), 0) as total_error_cost,
        COALESCE(SUM(
          (CASE WHEN leg_a_fill_price IS NOT NULL THEN leg_a_size * leg_a_fill_price ELSE 0 END +
          CASE WHEN leg_b_fill_price IS NOT NULL THEN leg_b_size * leg_b_fill_price ELSE 0 END) / 2.0
        ) FILTER (WHERE status = 'closed'), 0) as total_volume,
        AVG(CASE WHEN status = 'closed' AND close_ts IS NOT NULL AND entry_ts IS NOT NULL
          THEN (close_ts::bigint - entry_ts::bigint) END) as avg_hold_ms,
        COUNT(*) FILTER (WHERE status IN ('error','orphan_closed','closed_orphan')) as error_count
      FROM bot_trades
      WHERE pair_id NOT LIKE 'dn_adjustment%' AND bot_id = $1
      GROUP BY pair_id
      ORDER BY pair_id
    `, [botId]);

    const pools = result.rows.map(r => {
      const closed = parseInt(r.closed_trades) || 0;
      const total = parseInt(r.total_trades) || 0;
      const wins = parseInt(r.wins) || 0;
      const pnlGross = parseFloat(r.total_pnl_gross) || 0;
      const fees = parseFloat(r.total_fees) || 0;
      const errorCost = parseFloat(r.total_error_cost) || 0;
      const volume = parseFloat(r.total_volume) || 0;
      const avgHoldMs = parseFloat(r.avg_hold_ms) || 0;
      const errors = parseInt(r.error_count) || 0;
      const pnlNet = pnlGross - fees - errorCost;
      const winRate = closed > 0 ? wins / closed : 0;
      const errorRate = total > 0 ? errors / total : 0;
      const pnlPerVol = volume > 0 ? (pnlNet / volume) * 10000 : 0;
      const fillRate = total > 0 ? closed / total : 0;
      const avgHoldMin = avgHoldMs / 60000;
      const score = avgHoldMin > 0 && volume > 0
        ? (pnlPerVol * fillRate) / avgHoldMin
        : 0;
      return {
        pairId: r.pair_id, closed, total, wins, pnlNet, volume,
        winRate, errorRate, pnlPerVol, fillRate, avgHoldMs, errors, score,
      };
    });

    const riskMultipliers = { aggressive: 1.5, normal: 1.0, conservative: 0.6 };
    const riskMul = riskMultipliers[riskPref] || 1.0;

    const validPools = pools.filter(p => p.closed >= 3);
    if (validPools.length === 0) {
      return res.json({
        totalCapital, maxLeverage, riskPref,
        allocations: [],
        message: 'Pas assez de données (min 3 trades fermés par paire)',
      });
    }

    const rawWeights = validPools.map(p => {
      let w = 0;
      if (p.score > 0) w += p.score * 10;
      w += p.winRate * 2;
      w += p.pnlPerVol * 0.5;
      w *= (1 - p.errorRate);
      w *= riskMul;
      if (w < 0) w = 0;
      return { ...p, rawWeight: w };
    });

    const totalWeight = rawWeights.reduce((s, p) => s + p.rawWeight, 0);
    const maxNotional = totalCapital * maxLeverage;

    const allocations = rawWeights.map(p => {
      const pct = totalWeight > 0 ? p.rawWeight / totalWeight : 1 / rawWeights.length;
      const dollars = Math.round(maxNotional * pct * 100) / 100;
      const reasons = [];
      if (p.score > 0.5) reasons.push('Score élevé');
      else if (p.score > 0) reasons.push('Score positif');
      else reasons.push('Score faible');
      if (p.winRate > 0.6) reasons.push(`WR ${(p.winRate * 100).toFixed(0)}%`);
      if (p.errorRate > 0.15) reasons.push(`Erreurs ${(p.errorRate * 100).toFixed(0)}%`);
      if (p.pnlPerVol > 0) reasons.push(`PnL/Vol +${p.pnlPerVol.toFixed(1)}bps`);
      else if (p.pnlPerVol < 0) reasons.push(`PnL/Vol ${p.pnlPerVol.toFixed(1)}bps`);

      return {
        pairId: p.pairId,
        allocationPct: Math.round(pct * 10000) / 100,
        allocationUsd: dollars,
        score: Math.round(p.score * 1000) / 1000,
        winRate: Math.round(p.winRate * 1000) / 10,
        errorRate: Math.round(p.errorRate * 1000) / 10,
        pnlNet: Math.round(p.pnlNet * 10000) / 10000,
        pnlPerVolBps: Math.round(p.pnlPerVol * 100) / 100,
        closedTrades: p.closed,
        reasons,
      };
    });

    allocations.sort((a, b) => b.allocationUsd - a.allocationUsd);

    res.json({ totalCapital, maxLeverage, riskPref, maxNotional, allocations });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/bot/daily-stats', async (req, res) => {
  try {
    const result = await db.pool.query(`
      SELECT 
        TO_CHAR(TO_TIMESTAMP(entry_ts / 1000) AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD') as date,
        COUNT(*) as trades,
        COUNT(*) FILTER (WHERE (realized_pnl_usd - COALESCE(fees_usd, 0)) > 0) as wins,
        COUNT(*) FILTER (WHERE (realized_pnl_usd - COALESCE(fees_usd, 0)) <= 0 AND status != 'open') as losses,
        COALESCE(SUM(realized_pnl_usd), 0) as pnl_gross,
        COALESCE(SUM(fees_usd), 0) as fees,
        COALESCE(SUM(COALESCE(error_cost_usd, 0)), 0) as error_cost,
        COALESCE(SUM((CASE WHEN leg_a_fill_price IS NOT NULL THEN leg_a_size * leg_a_fill_price ELSE 0 END + CASE WHEN leg_b_fill_price IS NOT NULL THEN leg_b_size * leg_b_fill_price ELSE 0 END) / 2.0) FILTER (WHERE status = 'closed'), 0) as volume,
        COUNT(*) FILTER (WHERE status IN ('error','orphan_closed','closed_orphan')) as errors
      FROM bot_trades
      WHERE status != 'open' AND pair_id NOT LIKE 'dn_adjustment%' AND bot_id = 'bot1'
      GROUP BY TO_CHAR(TO_TIMESTAMP(entry_ts / 1000) AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD')
      ORDER BY date DESC
    `);
    const days = result.rows.map(r => ({
      date: r.date,
      trades: parseInt(r.trades),
      wins: parseInt(r.wins),
      losses: parseInt(r.losses),
      pnl_net: parseFloat(r.pnl_gross) - parseFloat(r.fees) - parseFloat(r.error_cost),
      pnl_gross: parseFloat(r.pnl_gross),
      fees: parseFloat(r.fees),
      volume: parseFloat(r.volume),
      errors: parseInt(r.errors),
      win_rate: parseInt(r.trades) > 0 ? Math.round((parseInt(r.wins) / parseInt(r.trades)) * 100) : 0,
    }));
    res.json(days);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/bot/errors-table', async (req, res) => {
  try {
    const errorType = req.query.errorType || '';
    const fromTs = req.query.from ? parseInt(req.query.from) : 0;
    const toTs = req.query.to ? parseInt(req.query.to) : Date.now();
    const limit = parseInt(req.query.limit || '100');

    let whereExtra = '';
    const params = ['bot1', fromTs, toTs, limit];
    if (errorType) {
      params.push(errorType);
      whereExtra = ` AND status = $${params.length}`;
    }

    const [tradesRes, groupRes] = await Promise.all([
      db.pool.query(`
        SELECT id, pair_id, direction, status, entry_ts, close_ts,
               error_msg, error_cost_usd, slippage_entry_bps,
               leg_a_coin, leg_a_side, leg_b_coin, leg_b_side,
               realized_pnl_usd, fees_usd
        FROM bot_trades
        WHERE bot_id = $1
          AND status IN ('error', 'orphan_closed', 'closed_orphan', 'slippage_guard', 'both_failed')
          AND entry_ts >= $2 AND entry_ts <= $3
          ${whereExtra}
        ORDER BY entry_ts DESC
        LIMIT $4
      `, params),
      db.pool.query(`
        SELECT status as error_type,
               COUNT(*)::int as count,
               COALESCE(SUM(COALESCE(error_cost_usd, 0)), 0) as total_cost,
               COALESCE(AVG(slippage_entry_bps), 0) as avg_slippage
        FROM bot_trades
        WHERE bot_id = 'bot1'
          AND status IN ('error', 'orphan_closed', 'closed_orphan', 'slippage_guard', 'both_failed')
          AND entry_ts >= $1 AND entry_ts <= $2
        GROUP BY status
        ORDER BY count DESC
      `, [fromTs, toTs])
    ]);

    const trades = tradesRes.rows.map(t => {
      let rootCause = t.status;
      const msg = (t.error_msg || '').toLowerCase();
      if (t.status === 'error') {
        if (msg.includes('orphan')) rootCause = 'orphan';
        else if (msg.includes('slippage')) rootCause = 'slippage_guard';
        else if (msg.includes('both') && msg.includes('fail')) rootCause = 'both_failed';
        else if (msg.includes('timeout')) rootCause = 'timeout';
        else if (msg.includes('margin')) rootCause = 'margin';
      }
      if (t.status === 'orphan_closed' || t.status === 'closed_orphan') rootCause = 'orphan';

      return {
        id: t.id,
        pairId: t.pair_id,
        direction: t.direction,
        status: t.status,
        rootCause,
        entryTs: parseInt(t.entry_ts),
        closeTs: t.close_ts ? parseInt(t.close_ts) : null,
        errorMsg: t.error_msg,
        errorCost: parseFloat(t.error_cost_usd || 0),
        slippage: parseFloat(t.slippage_entry_bps || 0),
        legA: t.leg_a_coin,
        legB: t.leg_b_coin,
        pnl: parseFloat(t.realized_pnl_usd || 0),
        fees: parseFloat(t.fees_usd || 0),
      };
    });

    const groups = groupRes.rows.map(r => ({
      errorType: r.error_type,
      count: r.count,
      totalCost: parseFloat(r.total_cost),
      avgSlippage: parseFloat(r.avg_slippage),
    }));

    const totalErrors = groups.reduce((s, g) => s + g.count, 0);
    const totalCost = groups.reduce((s, g) => s + g.totalCost, 0);

    res.json({ trades, groups, totalErrors, totalCost });
  } catch (err) {
    console.error('[API] errors-table error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/bot/corrections-stats', async (req, res) => {
  try {
    const [dnRes, errRes] = await Promise.all([
      db.pool.query(`
        SELECT 
          pair_id,
          COUNT(*) as dn_count,
          COALESCE(SUM(COALESCE(error_cost_usd, 0)), 0) as dn_cost
        FROM bot_trades
        WHERE pair_id LIKE 'dn_adjustment%' AND bot_id = 'bot1'
        GROUP BY pair_id
      `),
      db.pool.query(`
        SELECT 
          pair_id,
          COUNT(*) as err_count,
          COALESCE(SUM(COALESCE(error_cost_usd, 0)), 0) as err_cost,
          COUNT(*) FILTER (WHERE status = 'error') as errors,
          COUNT(*) FILTER (WHERE status IN ('orphan_closed','closed_orphan')) as orphans,
          COUNT(*) FILTER (WHERE status = 'slippage_guard') as slippage
        FROM bot_trades
        WHERE pair_id NOT LIKE 'dn_adjustment%'
          AND status IN ('error', 'orphan_closed', 'closed_orphan', 'slippage_guard')
          AND bot_id = 'bot1'
        GROUP BY pair_id
      `)
    ]);

    const coins = {};

    for (const r of dnRes.rows) {
      const coin = r.pair_id.replace(/^dn_adjustment_/, '') || 'unknown';
      if (!coins[coin]) coins[coin] = { coin, dnCount: 0, dnCostUsd: 0, errorCount: 0, orphanCount: 0, errCostUsd: 0 };
      coins[coin].dnCount += parseInt(r.dn_count);
      coins[coin].dnCostUsd += parseFloat(r.dn_cost);
    }

    for (const r of errRes.rows) {
      const parts = r.pair_id.split('-');
      const coin = parts.length >= 3 ? parts[parts.length - 1] : r.pair_id;
      if (!coins[coin]) coins[coin] = { coin, dnCount: 0, dnCostUsd: 0, errorCount: 0, orphanCount: 0, errCostUsd: 0 };
      coins[coin].errorCount += parseInt(r.errors);
      coins[coin].orphanCount += parseInt(r.orphans) + parseInt(r.slippage);
      coins[coin].errCostUsd += parseFloat(r.err_cost);
    }

    const rows = Object.values(coins).sort((a, b) => (b.dnCostUsd + b.errCostUsd) - (a.dnCostUsd + a.errCostUsd));
    const totals = rows.reduce((acc, r) => ({
      dnCount: acc.dnCount + r.dnCount,
      dnCostUsd: acc.dnCostUsd + r.dnCostUsd,
      errorCount: acc.errorCount + r.errorCount,
      orphanCount: acc.orphanCount + r.orphanCount,
      errCostUsd: acc.errCostUsd + r.errCostUsd,
      totalCostUsd: acc.totalCostUsd + r.dnCostUsd + r.errCostUsd,
    }), { dnCount: 0, dnCostUsd: 0, errorCount: 0, orphanCount: 0, errCostUsd: 0, totalCostUsd: 0 });

    res.json({ rows, totals });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

let _pairScanCache = { data: null, ts: 0 };
const PAIR_SCAN_CACHE_MS = 60000;

app.get('/pairs/scan', async (req, res) => {
  try {
    const now = Date.now();
    if (_pairScanCache.data && now - _pairScanCache.ts < PAIR_SCAN_CACHE_MS) {
      return res.json(_pairScanCache.data);
    }

    const hlApi = require('./hl_api');
    const dexs = await hlApi.getPerpDexs();
    if (!dexs || dexs.length === 0) return res.json({ pairs: [] });

    const dexCoins = {};
    const DEX_TIMEOUT = 8000;
    const dexPromises = dexs.map(dex => {
      const name = dex.name || dex;
      return Promise.race([
        hlApi.getDexMeta(name).then(meta => {
          if (meta && meta.universe) {
            dexCoins[name] = meta.universe.map(u => ({
              coin: u.name || u.coin,
              maxLeverage: u.maxLeverage,
              onlyIsolated: u.onlyIsolated,
            }));
          }
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout ${name}`)), DEX_TIMEOUT))
      ]).catch(e => console.warn(`[PairScan] ${name} skipped: ${e.message}`));
    });

    const mainlinePromise = Promise.race([
      hlApi.getMainlineMeta().then(meta => {
        if (meta && meta.universe) {
          dexCoins[''] = meta.universe.map(u => ({
            coin: u.name || u.coin,
            maxLeverage: u.maxLeverage,
            onlyIsolated: u.onlyIsolated,
          }));
        }
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout mainline')), DEX_TIMEOUT))
    ]).catch(e => console.warn(`[PairScan] mainline skipped: ${e.message}`));

    await Promise.allSettled([...dexPromises, mainlinePromise]);

    const coinDexMap = {};
    for (const [dexName, coins] of Object.entries(dexCoins)) {
      for (const c of coins) {
        let coinName = c.coin;
        if (coinName.includes(':')) coinName = coinName.split(':').pop();
        if (!coinDexMap[coinName]) coinDexMap[coinName] = [];
        coinDexMap[coinName].push({ deployer: dexName, maxLeverage: c.maxLeverage });
      }
    }

    const existingIds = new Set(pairs.map(p => p.id));
    const existingAlts = new Set();
    for (const p of pairs) {
      existingAlts.add(generatePairId(p.marketB, p.marketA));
    }
    const results = [];

    for (const [coin, deployers] of Object.entries(coinDexMap)) {
      if (deployers.length < 2) continue;
      for (let i = 0; i < deployers.length; i++) {
        for (let j = i + 1; j < deployers.length; j++) {
          const a = deployers[i];
          const b = deployers[j];
          if (a.deployer === '' || b.deployer === '') continue;
          let marketA = `${a.deployer}:${coin}`;
          let marketB = `${b.deployer}:${coin}`;
          if (a.deployer.toLowerCase() === 'xyz') {
            const tmp = marketA; marketA = marketB; marketB = tmp;
          }
          const id = generatePairId(marketA, marketB);
          const idAlt = generatePairId(marketB, marketA);
          const added = existingIds.has(id) || existingIds.has(idAlt) || existingAlts.has(id) || existingAlts.has(idAlt);
          let storedId = id;
          if (added) {
            if (existingIds.has(id)) storedId = id;
            else if (existingIds.has(idAlt)) storedId = idAlt;
            else {
              const found = pairs.find(p => p.id === id || p.id === idAlt);
              if (found) storedId = found.id;
            }
          }
          const depAFinal = marketA.split(':')[0];
          const depBFinal = marketB.split(':')[0];
          results.push({
            coin,
            deployerA: depAFinal,
            deployerB: depBFinal,
            marketA,
            marketB,
            id: storedId,
            added,
            maxLeverage: Math.min(a.maxLeverage || 10, b.maxLeverage || 10),
          });
        }
      }
    }

    results.sort((a, b) => {
      if (a.added !== b.added) return a.added ? 1 : -1;
      return a.coin.localeCompare(b.coin);
    });

    const response = { pairs: results, totalDexs: Object.keys(dexCoins).length };
    _pairScanCache = { data: response, ts: Date.now() };
    res.json(response);
  } catch (e) {
    console.error('[PairScan] Error:', e.message);
    if (_pairScanCache.data) return res.json(_pairScanCache.data);
    res.status(500).json({ error: e.message });
  }
});

app.get('/bot/edge-floors', async (req, res) => {
  try {
    const { hour: parisHour, dow: dayOfWeek } = getParisTime();
    const p50Mode = executionEngine.p50Mode || 'zscore';
    const now = Date.now();
    const maxAgeDays = 21;
    const tsMin = now - maxAgeDays * 24 * 3600 * 1000;

    const hourResult = await db.pool.query(`
      SELECT pair_id,
        EXTRACT(DOW FROM to_timestamp(ts / 1000.0) AT TIME ZONE '${TIMEZONE}')::int as dow,
        EXTRACT(HOUR FROM to_timestamp(ts / 1000.0) AT TIME ZONE '${TIMEZONE}')::int as hour_paris,
        ROUND(percentile_cont(0.50) WITHIN GROUP (ORDER BY dir1_edge_bps)::numeric, 2) as p50_dir1,
        ROUND(percentile_cont(0.50) WITHIN GROUP (ORDER BY dir2_edge_bps)::numeric, 2) as p50_dir2,
        COUNT(*) as cnt
      FROM edge_snapshots
      WHERE ts > $1
      GROUP BY pair_id, dow, hour_paris
      HAVING COUNT(*) >= 2
    `, [tsMin]);

    const result = {};
    for (const row of hourResult.rows) {
      const pid = row.pair_id;
      if (!result[pid]) {
        result[pid] = {
          currentHour: parisHour,
          currentDow: dayOfWeek,
          p50Mode,
          activeFloor: {
            d1: 0,
            d2: 0,
            mode: p50Mode,
          },
          feeRoundTripBps: executionEngine.getPairFeeRoundTripBps(pid),
          marginBps: executionEngine.marginBps,
          objectifBps: executionEngine.getPairObjectifBps(pid),
          byDow: {},
        };
      }
      const d = row.dow;
      const h = row.hour_paris;
      if (!result[pid].byDow[d]) result[pid].byDow[d] = {};
      result[pid].byDow[d][h] = {
        d1: parseFloat(row.p50_dir1),
        d2: parseFloat(row.p50_dir2),
      };
    }
    res.json(result);
  } catch (e) {
    console.error('[API] edge-floors error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/bot/edge-profile', async (req, res) => {
  try {
    const pairId = req.query.pair || null;
    const data = await db.getEdgeProfileByMinute(pairId);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/bot/edge-export.csv', async (req, res) => {
  try {
    const rows = await db.getEdgeExportCsv();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=edge_snapshots.csv');
    const header = 'pair_id,timestamp,datetime_utc,dir1_edge_bps,dir2_edge_bps,max_edge_bps,dir1_status,dir2_status,mid_a,mid_b\n';
    const lines = rows.map(r =>
      `${r.pair_id},${r.ts},${new Date(parseInt(r.ts)).toISOString()},${r.dir1_edge_bps},${r.dir2_edge_bps},${r.max_edge_bps},${r.dir1_status},${r.dir2_status},${r.mid_a},${r.mid_b}`
    ).join('\n');
    res.send(header + lines);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/export', async (req, res) => {
  try {
    const format = req.query.format || 'json';
    const csvDir = path.join(__dirname, '..', 'data', 'csv');
    const csvFiles = {};
    if (fs.existsSync(csvDir)) {
      const files = fs.readdirSync(csvDir).filter(f => f.endsWith('.csv'));
      for (const file of files) {
        csvFiles[file] = fs.readFileSync(path.join(csvDir, file), 'utf-8');
      }
    }

    let dbData = {};
    try {
      const edgeRows = await db.getEdgeExportCsv();
      dbData.edgeSnapshots = edgeRows;
    } catch (e) { dbData.edgeSnapshots = []; }
    try {
      const cyclesRes = await db.pool.query(`SELECT * FROM repeg_cycles ORDER BY open_ts DESC`);
      dbData.repegCycles = cyclesRes.rows;
    } catch (e) { dbData.repegCycles = []; }
    try {
      const tradesRes = await db.pool.query(`SELECT * FROM bot_trades ORDER BY entry_ts DESC`);
      dbData.botTrades = tradesRes.rows;
    } catch (e) { dbData.botTrades = []; }
    try {
      const configRes = await db.pool.query(`SELECT * FROM bot_config`);
      dbData.botConfig = configRes.rows;
    } catch (e) { dbData.botConfig = []; }

    const configData = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

    if (format === 'csv') {
      const archiver = require('archiver') || null;
      res.setHeader('Content-Type', 'application/json');
      res.json({
        config: configData,
        csvFiles,
        db: dbData,
        exportedAt: new Date().toISOString(),
      });
    } else {
      res.json({
        config: configData,
        csvFiles,
        db: dbData,
        exportedAt: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.error('[Export] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/export/csv/:filename', (req, res) => {
  const csvDir = path.join(__dirname, '..', 'data', 'csv');
  const filename = req.params.filename;
  if (filename.includes('..') || filename.includes('/')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  const filePath = path.join(csvDir, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
  fs.createReadStream(filePath).pipe(res);
});

app.get('/export/db/:table', async (req, res) => {
  const allowed = ['edge_snapshots', 'repeg_cycles', 'bot_trades', 'bot_config'];
  const table = req.params.table;
  if (!allowed.includes(table)) {
    return res.status(400).json({ error: `Table not allowed. Use: ${allowed.join(', ')}` });
  }
  try {
    const result = await db.pool.query(`SELECT * FROM ${table} ORDER BY 1 DESC LIMIT 10000`);
    const format = req.query.format || 'json';
    if (format === 'csv' && result.rows.length > 0) {
      const header = Object.keys(result.rows[0]).join(',');
      const lines = result.rows.map(r => Object.values(r).map(v => v === null ? '' : String(v)).join(','));
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=${table}.csv`);
      res.send(header + '\n' + lines.join('\n'));
    } else {
      res.json(result.rows);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/bot/reconcile', async (req, res) => {
  try {
    const result = await executionEngine.runPositionReconciliation();
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/bot/api-key', async (req, res) => {
  try {
    const { privateKey } = req.body;
    if (!privateKey || privateKey.length < 10) {
      return res.status(400).json({ error: 'Invalid private key' });
    }
    const wasEnabled = executionEngine.isEnabled();
    if (wasEnabled) executionEngine.stop();
    await bot1Api.reinit(privateKey);
    executionEngine._initialized = false;
    await executionEngine.initialize();
    await executionEngine.presetLeverage(pairs);
    if (wasEnabled) executionEngine.start();
    res.json({ ok: true, wallet: await bot1Api.getWalletAddress(), vault: bot1Api.getVaultAddress() || null, masked: bot1Api.getPrivateKeyMasked() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/bot/api-key', (req, res) => {
  res.json({ masked: bot1Api.getPrivateKeyMasked(), wallet: bot1Api._walletAddress || '', vault: bot1Api.getVaultAddress() || null });
});

app.post('/bot/vault', async (req, res) => {
  try {
    const { vaultAddress } = req.body;
    const addr = (vaultAddress || '').trim();
    if (addr && !/^0x[a-fA-F0-9]{40}$/.test(addr)) {
      return res.status(400).json({ error: 'Adresse vault invalide (format 0x...)' });
    }
    const wasEnabled = executionEngine.isEnabled();
    if (wasEnabled) executionEngine.stop();
    bot1Api.setVaultAddress(addr || null);
    executionEngine._initialized = false;
    executionEngine._activeAddress = bot1Api.getActiveAddress();
    await executionEngine.initialize();
    if (wasEnabled) executionEngine.start();
    await db.saveBotConfig('bot1_vault_address', addr || null);
    res.json({ ok: true, vault: bot1Api.getVaultAddress() || null, activeAddress: bot1Api.getActiveAddress() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/supervisor/status', async (req, res) => {
  try {
    const emptyStats = { openTrades: 0, totalPnlUsd: 0, totalFeesUsd: 0, walletFunding: 0, totalTrades: 0 };
    const bots = {};
    for (const [botId, reg] of Object.entries(botRegistry)) {
      if (!reg.engine) { bots[botId] = null; continue; }
      const cache = _statusCaches[botId];
      const stats = cache && cache.data ? cache.data.liveStats || emptyStats : emptyStats;
      const cfg = reg.engine.getConfig();
      bots[botId] = {
        enabled: cfg.enabled, deployer: reg.deployer, direction: reg.direction,
        openTrades: stats.openTrades || stats.open || 0, pnl: stats.totalPnlUsd || 0,
        fees: stats.totalFeesUsd || 0, funding: stats.walletFunding || 0, trades: stats.totalTrades || 0,
      };
    }
    res.json({ routing: { ...routingStats }, deployerMap: deployerDirectionMap, bots });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/supervisor/positions', async (req, res) => {
  try {
    const result = {};
    for (const botId of Object.keys(botRegistry)) {
      if (!botRegistry[botId].engine) { result[botId] = []; continue; }
      const positions = await db.pool.query(
        `SELECT id, pair_id, direction, leg_a_coin, leg_b_coin, size, vwap_entry_a, vwap_entry_b, avg_slippage_bps, total_fills, total_notional_usd, realized_pnl_usd, fees_usd, opened_at, status FROM positions WHERE bot_id = $1 AND status = 'open' ORDER BY opened_at DESC`,
        [botId]
      );
      result[botId] = positions.rows;
    }
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/supervisor/pair-analytics', async (req, res) => {
  try {
    const result = await db.pool.query(`
      WITH combined AS (
        SELECT pair_id, direction::text, status, realized_pnl_usd,
          COALESCE(leg_a_size * leg_a_fill_price, 0) + COALESCE(leg_b_size * leg_b_fill_price, 0) as volume,
          slippage_entry_bps, signal_edge_bps, fees_usd, error_msg
        FROM bot_trades
        UNION ALL
        SELECT pair_id, direction::text, status, realized_pnl_usd,
          total_notional_usd as volume,
          avg_slippage_bps as slippage_entry_bps, NULL::numeric as signal_edge_bps, fees_usd, NULL as error_msg
        FROM positions
      )
      SELECT
        pair_id,
        direction,
        COUNT(*) as trade_count,
        COUNT(*) FILTER (WHERE status = 'closed' AND realized_pnl_usd > 0) as wins,
        COUNT(*) FILTER (WHERE status = 'closed' AND realized_pnl_usd <= 0) as losses,
        COALESCE(SUM(realized_pnl_usd) FILTER (WHERE status = 'closed'), 0) as total_pnl,
        COALESCE(SUM(volume), 0) as total_volume,
        COALESCE(AVG(slippage_entry_bps) FILTER (WHERE slippage_entry_bps IS NOT NULL), 0) as avg_slippage_bps,
        COALESCE(MAX(slippage_entry_bps) FILTER (WHERE slippage_entry_bps IS NOT NULL), 0) as max_slippage_bps,
        COUNT(*) FILTER (WHERE error_msg IS NOT NULL AND error_msg != '') as error_count,
        COALESCE(AVG(signal_edge_bps), 0) as avg_edge_bps,
        COALESCE(SUM(fees_usd), 0) as total_fees
      FROM combined
      GROUP BY pair_id, direction
      ORDER BY pair_id, direction
    `);
    const rows = result.rows.map(r => {
      const closed = (parseInt(r.wins) || 0) + (parseInt(r.losses) || 0);
      const winRate = closed > 0 ? ((parseInt(r.wins) || 0) / closed * 100) : 0;
      const tradeCount = parseInt(r.trade_count) || 0;
      const errorCount = parseInt(r.error_count) || 0;
      const errorRate = tradeCount > 0 ? (errorCount / tradeCount * 100) : 0;
      return {
        pairId: r.pair_id,
        direction: parseInt(r.direction),
        tradeCount,
        wins: parseInt(r.wins) || 0,
        losses: parseInt(r.losses) || 0,
        winRate: Math.round(winRate * 10) / 10,
        totalPnl: parseFloat(r.total_pnl) || 0,
        totalVolume: parseFloat(r.total_volume) || 0,
        avgSlippageBps: parseFloat(r.avg_slippage_bps) || 0,
        maxSlippageBps: parseFloat(r.max_slippage_bps) || 0,
        errorCount,
        errorRate: Math.round(errorRate * 10) / 10,
        avgEdgeBps: parseFloat(r.avg_edge_bps) || 0,
        totalFees: parseFloat(r.total_fees) || 0,
      };
    });
    const topPnlPairs = [...rows].sort((a, b) => b.totalPnl - a.totalPnl).slice(0, 10);
    const topVolumePairs = [...rows].sort((a, b) => b.totalVolume - a.totalVolume).slice(0, 10);
    const mostFailedPairs = [...rows].filter(r => r.errorCount > 0).sort((a, b) => b.errorCount - a.errorCount).slice(0, 10);
    const worstSlippagePairs = [...rows].filter(r => r.avgSlippageBps !== 0).sort((a, b) => Math.abs(b.avgSlippageBps) - Math.abs(a.avgSlippageBps)).slice(0, 10);
    res.json({ topPnlPairs, topVolumePairs, mostFailedPairs, worstSlippagePairs });
  } catch (e) {
    console.error('[Supervisor] pair-analytics error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/supervisor/deployer-stats', async (req, res) => {
  try {
    const result = await db.pool.query(`
      WITH legs AS (
        SELECT
          LOWER(SPLIT_PART(leg_a_coin, ':', 1)) as deployer,
          ABS(COALESCE(leg_a_size, 0) * COALESCE(leg_a_fill_price, leg_a_price, 0)) as volume,
          COALESCE(fees_usd, 0) / 2.0 as fees,
          COALESCE(realized_pnl_usd, 0) / 2.0 as pnl
        FROM bot_trades
        UNION ALL
        SELECT
          LOWER(SPLIT_PART(leg_b_coin, ':', 1)) as deployer,
          ABS(COALESCE(leg_b_size, 0) * COALESCE(leg_b_fill_price, leg_b_price, 0)) as volume,
          COALESCE(fees_usd, 0) / 2.0 as fees,
          COALESCE(realized_pnl_usd, 0) / 2.0 as pnl
        FROM bot_trades
        UNION ALL
        SELECT
          LOWER(SPLIT_PART(leg_a_coin, ':', 1)) as deployer,
          COALESCE(total_notional_usd, 0) / 2.0 as volume,
          COALESCE(fees_usd, 0) / 2.0 as fees,
          COALESCE(realized_pnl_usd, 0) / 2.0 as pnl
        FROM positions
        UNION ALL
        SELECT
          LOWER(SPLIT_PART(leg_b_coin, ':', 1)) as deployer,
          COALESCE(total_notional_usd, 0) / 2.0 as volume,
          COALESCE(fees_usd, 0) / 2.0 as fees,
          COALESCE(realized_pnl_usd, 0) / 2.0 as pnl
        FROM positions
      )
      SELECT
        deployer,
        COUNT(*) as trade_count,
        COALESCE(SUM(volume), 0) as total_volume,
        COALESCE(SUM(fees), 0) as total_fees,
        COALESCE(SUM(pnl), 0) as total_pnl
      FROM legs
      WHERE deployer IN ('xyz', 'flx', 'km', 'cash')
      GROUP BY deployer
      ORDER BY total_volume DESC
    `);
    const deployers = {};
    for (const d of ['xyz', 'flx', 'km', 'cash']) {
      deployers[d] = { totalVolume: 0, totalFees: 0, tradeCount: 0, pnl: 0 };
    }
    for (const row of result.rows) {
      deployers[row.deployer] = {
        totalVolume: parseFloat(row.total_volume) || 0,
        totalFees: parseFloat(row.total_fees) || 0,
        tradeCount: parseInt(row.trade_count) || 0,
        pnl: parseFloat(row.total_pnl) || 0,
      };
    }
    res.json(deployers);
  } catch (e) {
    console.error('[deployer-stats] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/supervisor/close-deployer/:deployer', async (req, res) => {
  try {
    const deployer = req.params.deployer.toLowerCase();
    const validDeployers = ['flx', 'km', 'cash'];
    if (!validDeployers.includes(deployer)) {
      return res.status(400).json({ error: `Invalid deployer: ${deployer}. Must be one of: ${validDeployers.join(', ')}` });
    }
    const matchingBots = Object.entries(botRegistry).filter(([_, reg]) => reg.deployer === deployer && reg.engine);
    if (matchingBots.length === 0) {
      return res.json({ closed: {}, errors: [], message: `No active bots found for deployer ${deployer}` });
    }
    const closed = {};
    const errors = [];
    for (const [botId, reg] of matchingBots) {
      try {
        const result = await reg.engine.forceCloseAll();
        closed[botId] = (result.closedOnChain || 0) + (result.dbUpdated || 0);
        console.log(`[Supervisor] Emergency close ${deployer}/${botId}: closed=${closed[botId]}`);
      } catch (e) {
        errors.push({ botId, error: e.message });
        console.error(`[Supervisor] Emergency close ${deployer}/${botId} error:`, e.message);
      }
    }
    res.json({ closed, errors });
  } catch (e) {
    console.error('[Supervisor] close-deployer error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/supervisor/restart', async (req, res) => {
  try {
    console.log('[Supervisor] Restart requested — stopping all engines...');
    for (const [botId, reg] of Object.entries(botRegistry)) {
      if (!reg.engine) continue;
      reg.engine.stop();
      for (const iv of ['_rebalanceInterval', '_dnCheckInterval', '_fundingCheckInterval', '_orphanCloseInterval', '_feeRefreshInterval']) {
        if (reg.engine[iv]) { clearInterval(reg.engine[iv]); reg.engine[iv] = null; }
      }
      reg.engine._initialized = false;
    }
    console.log('[Supervisor] Engines stopped, reinitializing...');
    for (const [botId, reg] of Object.entries(botRegistry)) {
      if (!reg.engine) continue;
      await reg.engine.initialize();
    }
    console.log('[Supervisor] Restart complete');
    res.json({ ok: true, message: 'All engines restarted successfully' });
  } catch (e) {
    console.error('[Supervisor] Restart error:', e.message);
    res.status(500).json({ error: e.message });
  }
});


for (let bn = 2; bn <= 6; bn++) {
  const botId = `bot${bn}`;
  app.get(`/${botId}/available`, (req, res) => {
    const reg = botRegistry[botId];
    res.json({ available: !!(reg && reg.engine), configured: !!process.env[`HL_PRIVATE_KEY_${bn}`], deployer: reg ? reg.deployer : null, direction: reg ? reg.direction : null });
  });
}

const _farmingMetricsCache = {};
const FARMING_WINDOW_S = 1800;
const FARMING_RECALC_MS = 10000;
const BOT_LATENCY_S = 1;

function computeFarmingMetrics() {
  for (const [pairId, engine] of Object.entries(engines)) {
    const all = engine.ringBuffer1s.getAll();
    if (all.length < 10) {
      _farmingMetricsCache[pairId] = null;
      continue;
    }

    const windowData = all.slice(-FARMING_WINDOW_S);
    const windowSeconds = windowData.length;
    if (windowSeconds < 2) {
      _farmingMetricsCache[pairId] = null;
      continue;
    }

    const thresholdD1 = executionEngine.getPairObjectifBps(pairId) || executionEngine.minEdgeBps || 4.55;
    const thresholdD2 = thresholdD1;

    const targetSize = executionEngine.positionSizeUsd || 50;

    let d1Crossings = 0;
    let d2Crossings = 0;
    let d1FillProbSum = 0;
    let d2FillProbSum = 0;
    let d1SurvivedCount = 0;
    let d2SurvivedCount = 0;
    let d1TotalCrossings = 0;
    let d2TotalCrossings = 0;
    let d1EdgeSum = 0;
    let d2EdgeSum = 0;
    let d1EdgeCount = 0;
    let d2EdgeCount = 0;
    let totalDepthA = 0;
    let totalDepthB = 0;
    let depthSamples = 0;

    for (let i = 0; i < windowData.length; i++) {
      const cur = windowData[i];
      const prev = i > 0 ? windowData[i - 1] : null;

      totalDepthA += cur.depthA_2bps || 0;
      totalDepthB += cur.depthB_2bps || 0;
      depthSamples++;

      if (prev && prev.dir1EdgeBps < thresholdD1 && cur.dir1EdgeBps >= thresholdD1) {
        d1Crossings++;
        const depthAtSignal = Math.min(cur.depthA_2bps || 0, cur.depthB_2bps || 0);
        const fillProb = Math.min(1, depthAtSignal / targetSize);
        d1FillProbSum += fillProb;
        d1TotalCrossings++;

        if (i + 1 < windowData.length && windowData[i + 1].dir1EdgeBps >= thresholdD1) {
          d1SurvivedCount++;
        }
      }

      if (prev && prev.dir2EdgeBps < thresholdD2 && cur.dir2EdgeBps >= thresholdD2) {
        d2Crossings++;
        const depthAtSignal = Math.min(cur.depthA_2bps || 0, cur.depthB_2bps || 0);
        const fillProb = Math.min(1, depthAtSignal / targetSize);
        d2FillProbSum += fillProb;
        d2TotalCrossings++;

        if (i + 1 < windowData.length && windowData[i + 1].dir2EdgeBps >= thresholdD2) {
          d2SurvivedCount++;
        }
      }

      if (cur.dir1EdgeBps >= thresholdD1) {
        d1EdgeSum += cur.dir1EdgeBps;
        d1EdgeCount++;
      }
      if (cur.dir2EdgeBps >= thresholdD2) {
        d2EdgeSum += cur.dir2EdgeBps;
        d2EdgeCount++;
      }
    }

    const windowHours = windowSeconds / 3600;

    const d1CrossingsPerHour = windowHours > 0 ? d1Crossings / windowHours : 0;
    const d2CrossingsPerHour = windowHours > 0 ? d2Crossings / windowHours : 0;

    const d1AvgFillProb = d1TotalCrossings > 0 ? d1FillProbSum / d1TotalCrossings : 0;
    const d2AvgFillProb = d2TotalCrossings > 0 ? d2FillProbSum / d2TotalCrossings : 0;

    const d1SurvivalRate = d1TotalCrossings > 0 ? d1SurvivedCount / d1TotalCrossings : 0;
    const d2SurvivalRate = d2TotalCrossings > 0 ? d2SurvivedCount / d2TotalCrossings : 0;

    const d1TEF = d1CrossingsPerHour * d1AvgFillProb * d1SurvivalRate;
    const d2TEF = d2CrossingsPerHour * d2AvgFillProb * d2SurvivalRate;

    const feeRtBps = executionEngine.getPairFeeRoundTripBps(pairId) || (2 * executionEngine._takerFeeGrowth * 10000);
    const slippageEstBps = 0.5;

    const d1AvgEdge = d1EdgeCount > 0 ? d1EdgeSum / d1EdgeCount : 0;
    const d2AvgEdge = d2EdgeCount > 0 ? d2EdgeSum / d2EdgeCount : 0;
    const d1NetEdge = Math.max(0, d1AvgEdge - feeRtBps - slippageEstBps);
    const d2NetEdge = Math.max(0, d2AvgEdge - feeRtBps - slippageEstBps);

    const d1VWED = d1TEF * d1NetEdge;
    const d2VWED = d2TEF * d2NetEdge;

    const avgDepthA = depthSamples > 0 ? totalDepthA / depthSamples : 0;
    const avgDepthB = depthSamples > 0 ? totalDepthB / depthSamples : 0;

    const mrs = getMeanReversionMetrics(pairId);
    const marginalD1 = mrs.d1.tau !== null && mrs.d1.tau < BOT_LATENCY_S;
    const marginalD2 = mrs.d2.tau !== null && mrs.d2.tau < BOT_LATENCY_S;

    _farmingMetricsCache[pairId] = {
      d1: {
        tef: Math.round(d1TEF * 100) / 100,
        vwed: Math.round(d1VWED * 100) / 100,
        crossingsPerHour: Math.round(d1CrossingsPerHour * 10) / 10,
        avgFillProb: Math.round(d1AvgFillProb * 1000) / 1000,
        survivalRate: Math.round(d1SurvivalRate * 1000) / 1000,
        avgEdgeBps: Math.round(d1AvgEdge * 100) / 100,
        avgNetEdgeBps: Math.round(d1NetEdge * 100) / 100,
        rawCrossings: d1Crossings,
        meanReversion: {
          median: Math.round(mrs.d1.median * 100) / 100,
          p90: Math.round(mrs.d1.p90 * 100) / 100,
          count: mrs.d1.count,
          halfLife: mrs.d1.halfLife !== null ? Math.round(mrs.d1.halfLife * 100) / 100 : null,
          tau: mrs.d1.tau !== null ? Math.round(mrs.d1.tau * 100) / 100 : null,
          survivalCurve: mrs.d1.survivalCurve,
          marginal: marginalD1,
        },
      },
      d2: {
        tef: Math.round(d2TEF * 100) / 100,
        vwed: Math.round(d2VWED * 100) / 100,
        crossingsPerHour: Math.round(d2CrossingsPerHour * 10) / 10,
        avgFillProb: Math.round(d2AvgFillProb * 1000) / 1000,
        survivalRate: Math.round(d2SurvivalRate * 1000) / 1000,
        avgEdgeBps: Math.round(d2AvgEdge * 100) / 100,
        avgNetEdgeBps: Math.round(d2NetEdge * 100) / 100,
        rawCrossings: d2Crossings,
        meanReversion: {
          median: Math.round(mrs.d2.median * 100) / 100,
          p90: Math.round(mrs.d2.p90 * 100) / 100,
          count: mrs.d2.count,
          halfLife: mrs.d2.halfLife !== null ? Math.round(mrs.d2.halfLife * 100) / 100 : null,
          tau: mrs.d2.tau !== null ? Math.round(mrs.d2.tau * 100) / 100 : null,
          survivalCurve: mrs.d2.survivalCurve,
          marginal: marginalD2,
        },
      },
      avgDepthA: Math.round(avgDepthA * 100) / 100,
      avgDepthB: Math.round(avgDepthB * 100) / 100,
      thresholdD1: Math.round(thresholdD1 * 100) / 100,
      thresholdD2: Math.round(thresholdD2 * 100) / 100,
      windowSeconds,
      feeRtBps: Math.round(feeRtBps * 100) / 100,
      lastUpdated: Date.now(),
    };
  }
}

let _capitalTurnoverCache = { ts: 0, data: {} };
const CTR_RECALC_MS = 30000;

async function computeCapitalTurnover() {
  try {
    const ctrRes = await db.pool.query(`
      SELECT pair_id,
        COALESCE(SUM(realized_pnl_usd - COALESCE(fees_usd, 0)), 0) as pnl_net,
        COALESCE(SUM(
          CASE WHEN leg_a_fill_price IS NOT NULL THEN leg_a_size * leg_a_fill_price ELSE 0 END +
          CASE WHEN leg_b_fill_price IS NOT NULL THEN leg_b_size * leg_b_fill_price ELSE 0 END
        ), 0) as total_volume,
        COUNT(*)::int as closed_trades,
        MIN(entry_ts) as first_ts,
        MAX(COALESCE(close_ts, entry_ts)) as last_ts
      FROM bot_trades
      WHERE status = 'closed' AND pair_id NOT LIKE 'dn_adjustment%' AND bot_id = 'bot1'
      GROUP BY pair_id
    `);

    const result = {};
    for (const row of ctrRes.rows) {
      const pid = row.pair_id;
      const pnlNet = parseFloat(row.pnl_net) || 0;
      const volume = parseFloat(row.total_volume) || 0;
      const firstTs = parseInt(row.first_ts) || 0;
      const lastTs = parseInt(row.last_ts) || 0;
      const hours = (lastTs - firstTs) / 3600000;
      const capitalUsed = volume > 0 ? volume / (executionEngine.maxLeverage || 10) : 0;

      const engine = engines[pid];
      let avgDepthA = 0, avgDepthB = 0;
      if (engine) {
        const bufData = engine.ringBuffer1s.getAll();
        if (bufData.length > 0) {
          avgDepthA = bufData.reduce((s, e) => s + (e.depthA_2bps || 0), 0) / bufData.length;
          avgDepthB = bufData.reduce((s, e) => s + (e.depthB_2bps || 0), 0) / bufData.length;
        }
      }
      const avgDepthMin = Math.min(avgDepthA, avgDepthB);
      const targetSize = executionEngine.positionSizeUsd || 50;
      const capacityFactor = Math.min(1, avgDepthMin > 0 ? avgDepthMin / targetSize : 1);

      let ctr = 0;
      if (capitalUsed > 0 && hours > 0) {
        ctr = (pnlNet / capitalUsed) / hours * capacityFactor;
      }

      result[pid] = {
        pnlNet: Math.round(pnlNet * 10000) / 10000,
        capitalUsed: Math.round(capitalUsed * 100) / 100,
        hours: Math.round(hours * 10) / 10,
        capacityFactor: Math.round(capacityFactor * 1000) / 1000,
        ctr: Math.round(ctr * 1000000) / 1000000,
        closedTrades: parseInt(row.closed_trades),
      };
    }
    _capitalTurnoverCache = { ts: Date.now(), data: result };
  } catch (e) {
    console.error('[FarmingMetrics] CTR query error:', e.message);
  }
}

setInterval(computeFarmingMetrics, FARMING_RECALC_MS);
setInterval(computeCapitalTurnover, CTR_RECALC_MS);

let _fillQualityCache = { ts: 0, data: {} };
const FQ_RECALC_MS = 60000;

async function computeFillQuality() {
  try {
    const fqRes = await db.pool.query(`
      SELECT pair_id,
        COUNT(*)::int as trades,
        ROUND(AVG(slippage_entry_bps)::numeric, 4) as avg_slippage_bps,
        ROUND((PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY slippage_entry_bps))::numeric, 4) as p50_slippage_bps,
        ROUND((PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY slippage_entry_bps))::numeric, 4) as p90_slippage_bps,
        ROUND(AVG(signal_edge_bps)::numeric, 4) as avg_signal_edge_bps,
        ROUND(AVG(
          CASE WHEN leg_a_fill_price IS NOT NULL AND leg_a_size > 0 AND leg_b_fill_price IS NOT NULL AND leg_b_size > 0
          THEN (leg_a_fill_price * leg_a_size + leg_b_fill_price * leg_b_size) / 2
          ELSE NULL END
        )::numeric, 4) as avg_notional,
        ROUND(AVG(
          CASE WHEN leg_a_fill_price IS NOT NULL AND leg_a_size > 0
          THEN leg_a_size * leg_a_fill_price
          ELSE NULL END
        )::numeric, 2) as avg_leg_size_usd
      FROM bot_trades
      WHERE status IN ('open','closed') AND slippage_entry_bps IS NOT NULL
        AND bot_id = 'bot1' AND pair_id NOT LIKE 'dn_adjustment%'
      GROUP BY pair_id
    `);

    const sizeBucketsRes = await db.pool.query(`
      SELECT pair_id,
        CASE
          WHEN (leg_a_fill_price * leg_a_size + leg_b_fill_price * leg_b_size) / 2 < 30 THEN 'small'
          WHEN (leg_a_fill_price * leg_a_size + leg_b_fill_price * leg_b_size) / 2 < 80 THEN 'medium'
          ELSE 'large'
        END as size_bucket,
        ROUND(AVG(slippage_entry_bps)::numeric, 4) as avg_slip,
        COUNT(*)::int as cnt
      FROM bot_trades
      WHERE status IN ('open','closed') AND slippage_entry_bps IS NOT NULL
        AND bot_id = 'bot1' AND pair_id NOT LIKE 'dn_adjustment%'
        AND leg_a_fill_price IS NOT NULL AND leg_a_size > 0
      GROUP BY pair_id, size_bucket
    `);

    const result = {};
    for (const row of fqRes.rows) {
      const avgSlip = parseFloat(row.avg_slippage_bps) || 0;
      const p50Slip = parseFloat(row.p50_slippage_bps) || 0;
      const p90Slip = parseFloat(row.p90_slippage_bps) || 0;
      const avgSignalEdge = parseFloat(row.avg_signal_edge_bps) || 0;
      const captureRatio = avgSignalEdge > 0 ? (avgSignalEdge - avgSlip) / avgSignalEdge : 1;

      result[row.pair_id] = {
        trades: row.trades,
        avgSlippageBps: avgSlip,
        p50SlippageBps: p50Slip,
        p90SlippageBps: p90Slip,
        avgSignalEdgeBps: avgSignalEdge,
        captureRatio: Math.round(captureRatio * 1000) / 1000,
        avgLegSizeUsd: parseFloat(row.avg_leg_size_usd) || 0,
        sizeBuckets: {},
      };
    }

    for (const row of sizeBucketsRes.rows) {
      if (result[row.pair_id]) {
        result[row.pair_id].sizeBuckets[row.size_bucket] = {
          avgSlippageBps: parseFloat(row.avg_slip) || 0,
          trades: row.cnt,
        };
      }
    }

    for (const pid of Object.keys(result)) {
      const buckets = result[pid].sizeBuckets;
      const smallSlip = buckets.small?.avgSlippageBps || 0;
      const medSlip = buckets.medium?.avgSlippageBps || 0;
      const largeSlip = buckets.large?.avgSlippageBps || 0;
      const isConvex = largeSlip > medSlip * 1.5 && medSlip > smallSlip;
      result[pid].convexSlippage = isConvex;
      if (isConvex && buckets.medium && buckets.large) {
        result[pid].recommendedMaxSizeUsd = 80;
      }
    }

    _fillQualityCache = { ts: Date.now(), data: result };
  } catch (e) {
    console.error('[FarmingMetrics] FQ compute error:', e.message);
  }
}

let _correlationRiskCache = { ts: 0, data: {} };
const CORR_RECALC_MS = 30000;

function computeCorrelationRisk() {
  const coinGroups = {};
  for (const p of pairs) {
    const coin = p.marketA.split(':')[1];
    if (!coinGroups[coin]) coinGroups[coin] = [];
    coinGroups[coin].push(p.id);
  }

  const result = { groups: {}, pairCorrelations: {} };

  for (const [coin, pairIds] of Object.entries(coinGroups)) {
    result.groups[coin] = pairIds;
    if (pairIds.length < 2) continue;

    for (let i = 0; i < pairIds.length; i++) {
      for (let j = i + 1; j < pairIds.length; j++) {
        const pA = pairIds[i];
        const pB = pairIds[j];
        const engA = engines[pA];
        const engB = engines[pB];
        if (!engA || !engB) continue;

        const dataA = engA.ringBuffer1s.getAll();
        const dataB = engB.ringBuffer1s.getAll();
        if (dataA.length < 60 || dataB.length < 60) continue;

        const windowA = dataA.slice(-1800);
        const windowB = dataB.slice(-1800);

        const thresholdA = executionEngine.getPairObjectifBps(pA) || executionEngine.minEdgeBps || 4.55;
        const thresholdB = executionEngine.getPairObjectifBps(pB) || executionEngine.minEdgeBps || 4.55;

        const signalsA = new Set();
        for (let k = 1; k < windowA.length; k++) {
          const maxEdge = Math.max(windowA[k].dir1EdgeBps, windowA[k].dir2EdgeBps);
          const prevMax = Math.max(windowA[k-1].dir1EdgeBps, windowA[k-1].dir2EdgeBps);
          if (maxEdge >= thresholdA && prevMax < thresholdA) {
            signalsA.add(Math.floor(windowA[k].ts / 1000));
          }
        }

        let overlap = 0;
        let totalSignalsB = 0;
        for (let k = 1; k < windowB.length; k++) {
          const maxEdge = Math.max(windowB[k].dir1EdgeBps, windowB[k].dir2EdgeBps);
          const prevMax = Math.max(windowB[k-1].dir1EdgeBps, windowB[k-1].dir2EdgeBps);
          if (maxEdge >= thresholdB && prevMax < thresholdB) {
            totalSignalsB++;
            const tsSec = Math.floor(windowB[k].ts / 1000);
            for (let delta = -5; delta <= 5; delta++) {
              if (signalsA.has(tsSec + delta)) {
                overlap++;
                break;
              }
            }
          }
        }

        const totalSignals = signalsA.size + totalSignalsB;
        const overlapPct = totalSignals > 0 ? (overlap * 2 / totalSignals) * 100 : 0;
        const conflictRisk = overlapPct > 30 ? 'high' : overlapPct > 15 ? 'medium' : 'low';

        const key = `${pA}|${pB}`;
        result.pairCorrelations[key] = {
          pairA: pA,
          pairB: pB,
          coin,
          signalsA: signalsA.size,
          signalsB: totalSignalsB,
          overlap,
          overlapPct: Math.round(overlapPct * 10) / 10,
          conflictRisk,
        };
      }
    }
  }

  _correlationRiskCache = { ts: Date.now(), data: result };
}

let _pairTierCaches = { bot1: { ts: 0, data: [] }, bot2: { ts: 0, data: [] }, bot3: { ts: 0, data: [] }, bot4: { ts: 0, data: [] }, bot5: { ts: 0, data: [] }, bot6: { ts: 0, data: [] } };
const PAIR_TIER_RECALC_MS = 30000;

function _pearsonCorrServer(x, y) {
  const n = x.length;
  if (n < 10) return 0;
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sx += x[i]; sy += y[i]; sxx += x[i]*x[i]; syy += y[i]*y[i]; sxy += x[i]*y[i]; }
  const d = Math.sqrt((n*sxx - sx*sx) * (n*syy - sy*sy));
  return d > 0 ? (n*sxy - sx*sy) / d : 0;
}

function computePairTiers(execEngine) {
  const botKey = execEngine._botId || 'bot1';
  const tierCfg = execEngine.tierConfig || { thresholds: { allIn: 0.97, normal: 0.90 }, marginPct: { normal: 5, prudent: 2 } };
  const totalBalance = execEngine.getTotalBalance();
  const results = [];

  for (const p of pairs) {
    const eng = engines[p.id];
    if (!eng) continue;

    const data = eng.ringBuffer1s.getAll();
    if (data.length < 30) {
      const usedPct = execEngine.getPairMarginUsedPct(p.id);
      results.push({ pairId: p.id, label: p.label || p.id, correlation: null, tier: 'unknown', marginPct: tierCfg.marginPct.prudent, currentMarginPct: Math.round(usedPct * 100) / 100, currentOpen: execEngine.getOpenPositionCount(p.id) });
      continue;
    }

    const window = data.slice(-1800);
    const midAs = [], midBs = [];
    for (const d of window) {
      if (d.midA > 0 && d.midB > 0) { midAs.push(d.midA); midBs.push(d.midB); }
    }

    if (midAs.length < 30) {
      const usedPct = execEngine.getPairMarginUsedPct(p.id);
      results.push({ pairId: p.id, label: p.label || p.id, correlation: null, tier: 'unknown', marginPct: tierCfg.marginPct.prudent, currentMarginPct: Math.round(usedPct * 100) / 100, currentOpen: execEngine.getOpenPositionCount(p.id) });
      continue;
    }

    const rho = _pearsonCorrServer(midAs, midBs);
    const absRho = Math.abs(rho);
    let tier, marginPct;
    if (absRho >= tierCfg.thresholds.allIn) { tier = 'all-in'; marginPct = null; }
    else if (absRho >= tierCfg.thresholds.normal) { tier = 'normal'; marginPct = tierCfg.marginPct.normal; }
    else { tier = 'prudent'; marginPct = tierCfg.marginPct.prudent; }

    const usedPct = execEngine.getPairMarginUsedPct(p.id);
    results.push({ pairId: p.id, label: p.label || p.id, correlation: Math.round(absRho * 10000) / 10000, tier, marginPct, currentMarginPct: Math.round(usedPct * 100) / 100, currentOpen: execEngine.getOpenPositionCount(p.id) });
  }

  results.sort((a, b) => (b.correlation || 0) - (a.correlation || 0));
  _pairTierCaches[botKey] = { ts: Date.now(), data: results, totalBalance: Math.round(totalBalance * 100) / 100 };

  const tierMap = {};
  for (const r of results) { tierMap[r.pairId] = { tier: r.tier, marginPct: r.marginPct }; }
  execEngine.updatePairTiers(tierMap);

  return results;
}

let _opportunityCostCache = { ts: 0, data: {} };
const OPP_COST_RECALC_MS = 30000;

function computeOpportunityCost() {
  const result = {};
  const missedStats = executionEngine.getMissedStats();

  for (const pairId of Object.keys(engines)) {
    const mrs = getMeanReversionMetrics(pairId);
    const avgHoldTimeS = (mrs.d1.median + mrs.d2.median) / 2 || 0;

    let missedDuringLock = 0;
    let missedEdgeBpsTotal = 0;
    const todayStats = missedStats.today || {};
    for (const [reason, data] of Object.entries(todayStats)) {
      if (reason === 'max_positions_pair' || reason === 'max_positions_global') {
        const pairMissed = data.pairs?.[pairId] || 0;
        missedDuringLock += pairMissed;
        if (pairMissed > 0 && data.count > 0) {
          missedEdgeBpsTotal += (data.totalEdgeBps / data.count) * pairMissed;
        }
      }
    }

    const farmingMetrics = _farmingMetricsCache[pairId];
    const totalCrossingsPerHour = farmingMetrics
      ? (farmingMetrics.d1.crossingsPerHour + farmingMetrics.d2.crossingsPerHour)
      : 0;

    const holdTimeHours = avgHoldTimeS / 3600;
    const missedRate = holdTimeHours > 0 && totalCrossingsPerHour > 0
      ? missedDuringLock / Math.max(1, totalCrossingsPerHour * holdTimeHours)
      : 0;

    const penalty = avgHoldTimeS * missedRate;

    result[pairId] = {
      avgHoldTimeS: Math.round(avgHoldTimeS * 100) / 100,
      missedDuringLock,
      missedEdgeBpsTotal: Math.round(missedEdgeBpsTotal * 100) / 100,
      missedRate: Math.round(missedRate * 1000) / 1000,
      capitalLockPenalty: Math.round(penalty * 100) / 100,
    };
  }

  _opportunityCostCache = { ts: Date.now(), data: result };
}

let _atoCache = { ts: 0, data: {}, regimes: {} };
const ATO_RECALC_MS = 1800000;
let _lastAtoRecalcTs = 0;

function computeRegimeForPair(pairId) {
  const engine = engines[pairId];
  if (!engine) return { regime: 'unknown', sigma5m: 0, sigma15m: 0, sigma1h: 0 };

  const data = engine.ringBuffer1s.getAll();
  if (data.length < 60) return { regime: 'unknown', sigma5m: 0, sigma15m: 0, sigma1h: 0 };

  function rollingStd(arr, window) {
    if (arr.length < window) return 0;
    const recent = arr.slice(-window);
    const mean = recent.reduce((s, v) => s + v, 0) / recent.length;
    const variance = recent.reduce((s, v) => s + (v - mean) * (v - mean), 0) / recent.length;
    return Math.sqrt(variance);
  }

  const edges = data.map(d => Math.max(d.dir1EdgeBps, d.dir2EdgeBps));
  const sigma5m = rollingStd(edges, 300);
  const sigma15m = rollingStd(edges, 900);
  const sigma1h = rollingStd(edges, Math.min(3600, edges.length));

  const sortedEdges = [...edges].sort((a, b) => a - b);
  const p25Idx = Math.floor(sortedEdges.length * 0.25);
  const p75Idx = Math.floor(sortedEdges.length * 0.75);
  const p25 = sortedEdges[p25Idx] || 0;
  const p75 = sortedEdges[p75Idx] || 0;

  const sigmaRef = sigma15m;
  let regime = 'active';
  if (sigmaRef <= p25 * 0.8) regime = 'calm';
  else if (sigmaRef >= p75 * 1.2) regime = 'explosive';

  return {
    regime,
    sigma5m: Math.round(sigma5m * 100) / 100,
    sigma15m: Math.round(sigma15m * 100) / 100,
    sigma1h: Math.round(sigma1h * 100) / 100,
  };
}

async function computeATOMetrics() {
  const now = Date.now();
  if (now - _lastAtoRecalcTs < ATO_RECALC_MS && Object.keys(_atoCache.data).length > 0) return;
  _lastAtoRecalcTs = now;

  const regimes = {};
  const atoResults = {};

  let slippageByPair = {};
  try {
    const slipRes = await db.pool.query(`
      SELECT pair_id,
        ROUND((PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY slippage_entry_bps))::numeric, 4) as p50_slip
      FROM bot_trades
      WHERE status IN ('open','closed') AND slippage_entry_bps IS NOT NULL
        AND bot_id = 'bot1' AND pair_id NOT LIKE 'dn_adjustment%'
      GROUP BY pair_id
    `);
    for (const row of slipRes.rows) {
      slippageByPair[row.pair_id] = parseFloat(row.p50_slip) || 0;
    }
  } catch (e) {
    console.error('[ATO] Slippage query error:', e.message);
  }

  for (const [pairId, engine] of Object.entries(engines)) {
    const regimeData = computeRegimeForPair(pairId);
    regimes[pairId] = regimeData;

    const data = engine.ringBuffer1s.getAll();
    const windowData = data.slice(-FARMING_WINDOW_S);
    if (windowData.length < 60) {
      atoResults[pairId] = { optimal: null, regime: regimeData.regime, reason: 'insufficient_data' };
      continue;
    }

    const feeRtBps = executionEngine.getPairFeeRoundTripBps(pairId) || (2 * executionEngine._takerFeeGrowth * 10000);
    const slippageP50 = slippageByPair[pairId] || 0.5;
    const currentP50 = executionEngine.getPairObjectifBps(pairId);
    const targetSize = executionEngine.positionSizeUsd || 50;

    const asData = _farmingMetricsCache[pairId]?.adverseSelection;
    const asAvg = asData ? Math.abs(asData.avg1s || 0) : 0;

    const seuilMin = Math.round((feeRtBps + slippageP50 + 1) * 100) / 100;
    const seuilMax = Math.max(seuilMin + 1, currentP50 * 1.5);
    const step = 0.5;

    let bestNet = -Infinity;
    let bestThreshold = currentP50;
    const sweepResults = [];

    for (let seuil = seuilMin; seuil <= seuilMax; seuil += step) {
      let crossings = 0;
      let fillProbSum = 0;
      let edgeSum = 0;
      let survivedCount = 0;
      let crossingCount = 0;

      for (let i = 1; i < windowData.length; i++) {
        const cur = windowData[i];
        const prev = windowData[i - 1];
        const maxEdge = Math.max(cur.dir1EdgeBps, cur.dir2EdgeBps);
        const prevMax = Math.max(prev.dir1EdgeBps, prev.dir2EdgeBps);

        if (prevMax < seuil && maxEdge >= seuil) {
          crossings++;
          crossingCount++;
          const depth = Math.min(cur.depthA_2bps || 0, cur.depthB_2bps || 0);
          fillProbSum += Math.min(1, depth / targetSize);
          edgeSum += maxEdge;

          if (i + 1 < windowData.length) {
            const nextMax = Math.max(windowData[i+1].dir1EdgeBps, windowData[i+1].dir2EdgeBps);
            if (nextMax >= seuil) survivedCount++;
          }
        }
      }

      const windowHours = windowData.length / 3600;
      const frequency = windowHours > 0 ? crossings / windowHours : 0;
      const fillRate = crossingCount > 0 ? fillProbSum / crossingCount : 0;
      const avgEdge = crossingCount > 0 ? edgeSum / crossingCount : 0;
      const survivalRate = crossingCount > 0 ? survivedCount / crossingCount : 0;

      const netEdge = avgEdge - feeRtBps - slippageP50 - asAvg;
      const expectedNet = netEdge * fillRate * frequency * survivalRate;

      sweepResults.push({
        threshold: Math.round(seuil * 100) / 100,
        expectedNet: Math.round(expectedNet * 1000) / 1000,
        frequency: Math.round(frequency * 10) / 10,
        fillRate: Math.round(fillRate * 1000) / 1000,
        avgEdge: Math.round(avgEdge * 100) / 100,
        netEdge: Math.round(netEdge * 100) / 100,
        crossings,
      });

      if (expectedNet > bestNet) {
        bestNet = expectedNet;
        bestThreshold = seuil;
      }
    }

    const regimeMultiplier = regimeData.regime === 'calm' ? 1.1 : regimeData.regime === 'explosive' ? 0.9 : 1.0;
    let adjustedThreshold = bestThreshold * regimeMultiplier;
    adjustedThreshold = Math.max(seuilMin, Math.min(seuilMax, adjustedThreshold));
    adjustedThreshold = Math.round(adjustedThreshold * 100) / 100;

    atoResults[pairId] = {
      optimal: {
        threshold: adjustedThreshold,
        rawThreshold: Math.round(bestThreshold * 100) / 100,
        expectedNet: Math.round(bestNet * 1000) / 1000,
        regimeAdjusted: regimeData.regime !== 'active',
      },
      current: Math.round(currentP50 * 100) / 100,
      guardRails: {
        min: Math.round(seuilMin * 100) / 100,
        max: Math.round(seuilMax * 100) / 100,
        feeRtBps: Math.round(feeRtBps * 100) / 100,
        slippageP50: Math.round(slippageP50 * 100) / 100,
        adverseSelectionAvg: Math.round(asAvg * 100) / 100,
      },
      regime: regimeData.regime,
      sweepTop5: sweepResults.sort((a, b) => b.expectedNet - a.expectedNet).slice(0, 5),
      lastCalibrated: now,
      nextCalibration: now + ATO_RECALC_MS,
      confidence: windowData.length >= 1800 ? 'high' : windowData.length >= 600 ? 'medium' : 'low',
    };
  }

  _atoCache = { ts: now, data: atoResults, regimes };

  if (executionEngine.atoEnabled) {
    let autoApplied = 0;
    for (const [pairId, ato] of Object.entries(atoResults)) {
      if (ato.optimal && ato.confidence !== 'low') {
        const threshold = ato.optimal.threshold;
        autoApplied++;
      }
    }
    if (autoApplied > 0) {
      console.log(`[ATO] Computed optimal thresholds for ${autoApplied} pairs`);
    }
  }
}

setInterval(computeFillQuality, FQ_RECALC_MS);
setInterval(computeCorrelationRisk, CORR_RECALC_MS);
setInterval(computeOpportunityCost, OPP_COST_RECALC_MS);
setInterval(() => { computePairTiers(executionEngine); }, PAIR_TIER_RECALC_MS);
setInterval(() => { computeATOMetrics().catch(e => console.error('[ATO] Error:', e.message)); }, 60000);

setTimeout(() => {
  computeFillQuality().catch(e => console.error('[FillQuality] Error:', e.message));
  computeCorrelationRisk();
  computeOpportunityCost();
  computePairTiers(executionEngine);
  computeATOMetrics().catch(e => console.error('[ATO] Init error:', e.message));
}, 15000);

app.get('/bot/farming-optimizer', async (req, res) => {
  try {
    if (_atoCache.ts === 0) {
      await computeATOMetrics();
    }

    const regimeSummary = { calm: 0, active: 0, explosive: 0, unknown: 0 };
    for (const [pid, regime] of Object.entries(_atoCache.regimes)) {
      regimeSummary[regime.regime] = (regimeSummary[regime.regime] || 0) + 1;
    }

    res.json({
      optimizer: _atoCache.data,
      regimes: _atoCache.regimes,
      regimeSummary,
      correlations: _correlationRiskCache.data,
      opportunityCost: _opportunityCostCache.data,
      fillQuality: _fillQualityCache.data,
      lastCalibrated: _atoCache.ts,
      nextCalibration: _atoCache.ts + ATO_RECALC_MS,
      config: {
        recalibrationIntervalMs: ATO_RECALC_MS,
        farmingWindowS: FARMING_WINDOW_S,
        botLatencyS: BOT_LATENCY_S,
      },
    });
  } catch (err) {
    console.error('[API] farming-optimizer error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/bot/farming-optimizer/apply', async (req, res) => {
  try {
    const { pairIds, applyAll } = req.body;
    const atoData = _atoCache.data;
    if (!atoData || Object.keys(atoData).length === 0) {
      return res.status(400).json({ error: 'No ATO data available. Wait for calibration.' });
    }

    const applied = [];
    const targetPairs = applyAll
      ? Object.keys(atoData)
      : (pairIds || []);

    for (const pairId of targetPairs) {
      const ato = atoData[pairId];
      if (!ato || !ato.optimal) continue;

      const threshold = ato.optimal.threshold;
      applied.push({ pairId, threshold, previous: ato.current });
    }

    console.log(`[ATO] Applied thresholds to ${applied.length} pairs`);
    res.json({ ok: true, applied, count: applied.length });
  } catch (err) {
    console.error('[API] ATO apply error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/bot/farming-optimizer/toggle', async (req, res) => {
  try {
    const { enabled } = req.body;
    await executionEngine.updateConfig({ atoEnabled: !!enabled });
    res.json({ ok: true, atoEnabled: executionEngine.atoEnabled });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/bot/farming-metrics', async (req, res) => {
  try {
    const botId = req.query.botId || 'bot1';
    const result = {};
    for (const [pairId, metrics] of Object.entries(_farmingMetricsCache)) {
      if (metrics) {
        result[pairId] = { ...metrics };
      }
    }

    const [netCaptureRes, slippageRes, assRes] = await Promise.all([
      db.pool.query(`
        SELECT pair_id,
          COUNT(*)::int as closed_trades,
          ROUND(AVG(CASE WHEN realized_pnl_bps IS NOT NULL AND fees_usd IS NOT NULL
            THEN realized_pnl_bps - (fees_usd / NULLIF(
              (leg_a_fill_price * leg_a_size + leg_b_fill_price * leg_b_size) / 2, 0
            )) * 10000
            ELSE realized_pnl_bps END)::numeric, 2) as avg_net_capture_bps,
          ROUND(AVG(realized_pnl_bps)::numeric, 2) as avg_gross_pnl_bps,
          ROUND(AVG(CASE WHEN fees_usd IS NOT NULL
            THEN (fees_usd / NULLIF(
              (leg_a_fill_price * leg_a_size + leg_b_fill_price * leg_b_size) / 2, 0
            )) * 10000
            ELSE 0 END)::numeric, 2) as avg_fees_bps
        FROM bot_trades
        WHERE status = 'closed' AND bot_id = $1 AND pair_id NOT LIKE 'dn_adjustment%'
        GROUP BY pair_id
      `, [botId]),
      db.pool.query(`
        SELECT pair_id,
          COUNT(*)::int as trades,
          ROUND(AVG(slippage_entry_bps)::numeric, 2) as avg_slippage_bps,
          ROUND((PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY slippage_entry_bps))::numeric, 2) as p50_slippage_bps,
          ROUND((PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY slippage_entry_bps))::numeric, 2) as p90_slippage_bps,
          ROUND(MAX(slippage_entry_bps)::numeric, 2) as max_slippage_bps
        FROM bot_trades
        WHERE status IN ('open','closed') AND slippage_entry_bps IS NOT NULL AND bot_id = $1
          AND pair_id NOT LIKE 'dn_adjustment%'
        GROUP BY pair_id
      `, [botId]),
      db.pool.query(`
        SELECT pair_id,
          COUNT(*)::int as trades_with_as,
          ROUND(AVG(as_1s)::numeric, 4) as avg_as_1s,
          ROUND(AVG(as_3s)::numeric, 4) as avg_as_3s,
          ROUND(AVG(as_5s)::numeric, 4) as avg_as_5s,
          ROUND((PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY as_1s))::numeric, 4) as p50_as_1s,
          ROUND((PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY as_1s))::numeric, 4) as p90_as_1s
        FROM bot_trades
        WHERE as_1s IS NOT NULL AND bot_id = $1 AND pair_id NOT LIKE 'dn_adjustment%'
        GROUP BY pair_id
      `, [botId]),
    ]);

    for (const row of netCaptureRes.rows) {
      if (!result[row.pair_id]) result[row.pair_id] = {};
      result[row.pair_id].netCaptureBps = parseFloat(row.avg_net_capture_bps) || 0;
      result[row.pair_id].grossPnlBps = parseFloat(row.avg_gross_pnl_bps) || 0;
      result[row.pair_id].avgFeesBps = parseFloat(row.avg_fees_bps) || 0;
      result[row.pair_id].closedTrades = row.closed_trades;
    }

    for (const row of slippageRes.rows) {
      if (!result[row.pair_id]) result[row.pair_id] = {};
      result[row.pair_id].slippage = {
        trades: row.trades,
        avgBps: parseFloat(row.avg_slippage_bps) || 0,
        p50Bps: parseFloat(row.p50_slippage_bps) || 0,
        p90Bps: parseFloat(row.p90_slippage_bps) || 0,
        maxBps: parseFloat(row.max_slippage_bps) || 0,
      };
    }

    for (const row of assRes.rows) {
      if (!result[row.pair_id]) result[row.pair_id] = {};
      result[row.pair_id].adverseSelection = {
        tradesWithAS: row.trades_with_as,
        avg1s: parseFloat(row.avg_as_1s) || 0,
        avg3s: parseFloat(row.avg_as_3s) || 0,
        avg5s: parseFloat(row.avg_as_5s) || 0,
        p50_1s: parseFloat(row.p50_as_1s) || 0,
        p90_1s: parseFloat(row.p90_as_1s) || 0,
        score: parseFloat(row.avg_as_1s) || 0,
      };
    }

    for (const [pairId, ctr] of Object.entries(_capitalTurnoverCache.data)) {
      if (!result[pairId]) result[pairId] = {};
      result[pairId].capitalTurnover = ctr;
    }

    for (const [pairId, fq] of Object.entries(_fillQualityCache.data)) {
      if (!result[pairId]) result[pairId] = {};
      result[pairId].fillQuality = fq;
    }

    for (const [pairId, opp] of Object.entries(_opportunityCostCache.data)) {
      if (!result[pairId]) result[pairId] = {};
      result[pairId].opportunityCost = opp;
    }

    for (const [pairId, regime] of Object.entries(_atoCache.regimes)) {
      if (!result[pairId]) result[pairId] = {};
      result[pairId].regime = regime;
    }

    if (_atoCache.data) {
      for (const [pairId, ato] of Object.entries(_atoCache.data)) {
        if (!result[pairId]) result[pairId] = {};
        result[pairId].atoRecommendation = ato?.optimal || null;
      }
    }

    res.json({
      pairs: result,
      correlations: _correlationRiskCache.data,
      config: {
        windowSeconds: FARMING_WINDOW_S,
        recalcIntervalMs: FARMING_RECALC_MS,
        botLatencyS: BOT_LATENCY_S,
        targetSizeUsd: executionEngine.positionSizeUsd || 50,
      },
    });
  } catch (err) {
    console.error('[API] farming-metrics error:', err.message);
    res.status(500).json({ error: err.message });
  }
});


function _registerAllBotRoutes() {
  const hlApi = hlApiModule.getDefaultInstance();
  for (const [botId, reg] of Object.entries(botRegistry)) {
    if (botId === 'bot1') continue;
    const pfx = botId;
    registerGenericBotRoutes(app, {
      prefix: pfx, botId, deployer: reg.deployer, direction: reg.direction,
      getEngine: () => reg.engine, getApi: () => reg.api,
      getWalletAddr: () => reg.walletAddr(),
      getStatusCache: () => _statusCaches[botId],
      setStatusCache: (v) => { _statusCaches[botId] = v; },
      getPairTierCache: () => _pairTierCaches[botId] || { ts: 0, data: [], totalBalance: 0 },
      computePairTiers, buildHedgeStatus, pairs, engines, hlApi,
    });
  }
}
_registerAllBotRoutes();



const _botApiRefs = {
  bot2: { getApi: () => bot2Api, setApi: (a) => { bot2Api = a; }, getEngine: () => executionEngine2, setEngine: (e) => { executionEngine2 = e; }, botNum: 2 },
  bot3: { getApi: () => bot3Api, setApi: (a) => { bot3Api = a; }, getEngine: () => executionEngine3, setEngine: (e) => { executionEngine3 = e; }, botNum: 3 },
  bot4: { getApi: () => bot4Api, setApi: (a) => { bot4Api = a; }, getEngine: () => executionEngine4, setEngine: (e) => { executionEngine4 = e; }, botNum: 4 },
  bot5: { getApi: () => bot5Api, setApi: (a) => { bot5Api = a; }, getEngine: () => executionEngine5, setEngine: (e) => { executionEngine5 = e; }, botNum: 5 },
  bot6: { getApi: () => bot6Api, setApi: (a) => { bot6Api = a; }, getEngine: () => executionEngine6, setEngine: (e) => { executionEngine6 = e; }, botNum: 6 },
};

for (const [botId, refs] of Object.entries(_botApiRefs)) {
  const prefix = botId === 'bot1' ? '/bot' : `/${botId}`;

  app.post(`${prefix}/api-key`, async (req, res) => {
    try {
      const { privateKey } = req.body;
      if (!privateKey || privateKey.length < 10) return res.status(400).json({ error: 'Invalid private key' });
      const existingApi = refs.getApi();
      const existingEngine = refs.getEngine();
      if (existingEngine && existingApi) {
        const wasEnabled = existingEngine.isEnabled();
        if (wasEnabled) existingEngine.stop();
        await existingApi.reinit(privateKey);
        existingEngine._initialized = false;
        await existingEngine.initialize();
        await existingEngine.presetLeverage(pairs);
        if (wasEnabled) existingEngine.start();
        return res.json({ ok: true, wallet: await existingApi.getWalletAddress(), vault: existingApi.getVaultAddress() || null, masked: existingApi.getPrivateKeyMasked() });
      }
      const newApi = hlApiModule.createInstance(privateKey, botId, botEnv(refs.botNum, 'VAULT_ADDRESS') || null);
      refs.setApi(newApi);
      const regEntry = botRegistry[botId];
      const botDeployer = regEntry ? regEntry.deployer : 'flx';
      const newEngine = new ExecutionEngine({
        minEdgeBps: config.minEdgeOpenBpsOverride || 8,
        positionSizeUsd: config.notionals?.[0] || 50,
        slippagePct: config.slippagePct || 0.005,
        crossRate: 0.00045,
        addRate: 0.00015,
        botId: botId,
        dexFilter: ['xyz', botDeployer],
      }, newApi);
      refs.setEngine(newEngine);
      newEngine._allPairIds = pairs.map(p => p.id);
      newEngine.setRingBufferAccessor((pairId) => {
        const eng = engines[pairId];
        return eng ? eng.ringBuffer1s : null;
      });
      for (const pairDef of pairs) {
        const growthA = wsPool._growthModes?.[pairDef.marketA] ?? true;
        const growthB = wsPool._growthModes?.[pairDef.marketB] ?? true;
        newEngine.registerPairGrowthModes(pairDef.id, growthA, growthB);
      }
      await newEngine.initialize();
      await newEngine.presetLeverage(pairs);
      console.log(`[${botId.toUpperCase()}] Dynamically initialized via UI`);
      res.json({ ok: true, wallet: await newApi.getWalletAddress(), vault: newApi.getVaultAddress() || null, masked: newApi.getPrivateKeyMasked() });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get(`${prefix}/api-key`, (req, res) => {
    const api = refs.getApi();
    if (!api) return res.json({ masked: '--', wallet: '', vault: null });
    res.json({ masked: api.getPrivateKeyMasked(), wallet: api._walletAddress || '', vault: api.getVaultAddress() || null });
  });
}

app.listen(PORT, '0.0.0.0', async () => {
  const thresholds = computeThresholds(config);
  console.log(`[Server] Listening on 0.0.0.0:${PORT}`);
  console.log(`[Config] Pairs: ${pairs.map(p => p.id).join(', ')}`);
  const feeRates = executionEngine.getFeeRates();
  console.log(`[Config] TakerFee Growth: ${feeRates.takerFeeGrowth} (${feeRates.takerFeeGrowthBps}bps) | NoGrowth: ${feeRates.takerFeeNoGrowth} (${feeRates.takerFeeNoGrowthBps}bps)`);
  console.log(`[Config] feeOpenBps: ${thresholds.feeOpenBps.toFixed(4)}, minEdgeOpenBps: ${thresholds.minEdgeOpenBps.toFixed(4)}, safetySpreadBps: ${thresholds.safetySpreadBps}`);

  for (const engine of Object.values(engines)) {
    engine.start();
  }

  wsPool.connectAll();

  const ringBufferAccessor = (pairId) => {
    const eng = engines[pairId];
    return eng ? eng.ringBuffer1s : null;
  };
  for (const [botId, reg] of Object.entries(botRegistry)) {
    if (!reg.engine) continue;
    reg.engine._allPairIds = pairs.map(p => p.id);
    reg.engine.setRingBufferAccessor(ringBufferAccessor);
  }

  setTimeout(async () => {
    try {
      for (const [botId, reg] of Object.entries(botRegistry)) {
        if (!reg.engine) continue;
        const ls = await reg.engine.getLiveStats();
        _statusCaches[botId] = { data: { ...reg.engine.getConfig(), liveStats: ls }, ts: Date.now() };
      }
    } catch (e) {}
  }, 2000);

  try {
    for (const [botId, reg] of Object.entries(botRegistry)) {
      if (!reg.api) continue;
      const vault = await db.loadBotConfig(`${botId}_vault_address`);
      if (vault) {
        reg.api.setVaultAddress(vault);
        console.log(`[Vault] ${botId} restored sub-account: ${vault}`);
      }
    }
  } catch (e) {
    console.error('[Vault] Error restoring vault addresses:', e.message);
  }

  const regimeAccessor = (pairId) => computeRegimeForPair(pairId);
  const atoAccessor = (pairId) => _atoCache.data[pairId] || null;
  const meanReversionAccessor = (pairId) => getMeanReversionMetrics(pairId);

  const zScoreAccessor = (pairId, dir) => {
    const eng = engines[pairId];
    if (!eng || !eng.store) return null;
    const zs = eng.store.getZScores(dir);
    return zs ? zs.short : null;
  };

  for (const [botId, reg] of Object.entries(botRegistry)) {
    if (!reg.engine) continue;
    reg.engine.setRegimeAccessor(regimeAccessor);
    reg.engine.setATOAccessor(atoAccessor);
    reg.engine.setMeanReversionAccessor(meanReversionAccessor);
    reg.engine.setZScoreAccessor(zScoreAccessor);
  }

  executionEngine.initialize().then(async () => {
    for (const pairDef of pairs) {
      const eng = engines[pairDef.id];
      if (eng) {
        const growthA = hlApiModule.getGrowthMode(pairDef.marketA);
        const growthB = hlApiModule.getGrowthMode(pairDef.marketB);
        eng.config.growthModeA = growthA;
        eng.config.growthModeB = growthB;
        for (const [botId, reg] of Object.entries(botRegistry)) {
          if (reg.engine) reg.engine.registerPairGrowthModes(pairDef.id, growthA, growthB);
        }
        if (!growthA || !growthB) {
          console.log(`[PairEngine] ${pairDef.id}: growth mode A=${growthA}, B=${growthB} — non-growth legs use higher (add) fees`);
        }
      }
    }
    await executionEngine.presetLeverage(pairs);
    console.log(`[bot1] Ready. ${executionEngine.isEnabled() ? 'ENABLED' : 'DISABLED'} (use /bot/start to enable)`);
    for (const botId of ['bot2','bot3','bot4','bot5','bot6']) {
      const reg = botRegistry[botId];
      if (!reg || !reg.engine) continue;
      try {
        await new Promise(r => setTimeout(r, 2000));
        await reg.engine.initialize();
        await reg.engine.presetLeverage(pairs);
        console.log(`${reg.engine._logPrefix} Ready. ${reg.engine.isEnabled() ? 'ENABLED' : 'DISABLED'} (use /${botId}/start to enable)`);
      } catch (e) { console.error(`[${botId}] init failed:`, e.message); }
    }

    setInterval(() => {
      if (!executionEngine.isEnabled()) return;
      const enabledIds = Object.keys(executionEngine.enabledPairs).filter(p => executionEngine.enabledPairs[p]);
      const lines = [];
      let bestPct = -Infinity, bestPair = '', bestDir = '', bestEdge = 0, bestObj = 0, bestKz = 0;
      const isZ = executionEngine._isZScoreMode();
      const minEdges = {};
      for (const id of enabledIds) {
        const eng = engines[id];
        if (!eng || !eng.store.state.metrics) continue;
        const m = eng.store.state.metrics;
        const results = m.results || [];
        if (results.length === 0) continue;
        const r = results[0];
        const e1 = r.dir1?.grossOpenEdgeBps ?? 0;
        const e2 = r.dir2?.grossOpenEdgeBps ?? 0;
        const label = (pairs.find(p => p.id === id) || {}).label || id;
        const micro = r.micro || {};
        const iA = micro.intraCostAbps != null ? micro.intraCostAbps.toFixed(1) : '?';
        const iB = micro.intraCostBbps != null ? micro.intraCostBbps.toFixed(1) : '?';
        const arb = micro.arbImpossible ? ' [NO ARB]' : '';
        const obj1 = minEdges[`${id}:d1`] || executionEngine.minEdgeBps || 7;
        const obj2 = minEdges[`${id}:d2`] || executionEngine.minEdgeBps || 7;
        const pct1 = obj1 > 0 ? (e1 / obj1) * 100 : 0;
        const pct2 = obj2 > 0 ? (e2 / obj2) * 100 : 0;
        const kz1 = r.dir1?.kalmanZ ?? 0;
        const kz2 = r.dir2?.kalmanZ ?? 0;
        const zTag = isZ ? ` kZ=${kz1.toFixed(2)}/${kz2.toFixed(2)}` : '';
        let sigmaTag = '';
        if (eng.store && eng.store.getZScores) {
          const zd1 = eng.store.getZScores(1);
          const zd2 = eng.store.getZScores(2);
          const s1 = zd1.short.stdBps || 0;
          const s2 = zd2.short.stdBps || 0;
          const feesRT = executionEngine.getPairFeeRoundTripBps(id);
          const adaptiveMin = feesRT + executionEngine.slippageMarginBps;
          const zmin1 = s1 > 0 ? (adaptiveMin / s1) : Infinity;
          const zmin2 = s2 > 0 ? (adaptiveMin / s2) : Infinity;
          sigmaTag = ` σ=${s1.toFixed(1)}/${s2.toFixed(1)}bps Zmin=${zmin1 < 99 ? zmin1.toFixed(1) : '∞'}/${zmin2 < 99 ? zmin2.toFixed(1) : '∞'}`;
        }
        lines.push(`  ${label.padEnd(22)} d1: ${e1 >= 0 ? '+' : ''}${e1.toFixed(1)}/${obj1.toFixed(1)}bps (${pct1.toFixed(0)}%)  d2: ${e2 >= 0 ? '+' : ''}${e2.toFixed(1)}/${obj2.toFixed(1)}bps (${pct2.toFixed(0)}%)  spread: A=${iA} B=${iB}bps${zTag}${sigmaTag}${arb}`);
        if (pct1 > bestPct) { bestPct = pct1; bestPair = label; bestDir = 'd1'; bestEdge = e1; bestObj = obj1; bestKz = kz1; }
        if (pct2 > bestPct) { bestPct = pct2; bestPair = label; bestDir = 'd2'; bestEdge = e2; bestObj = obj2; bestKz = kz2; }
      }
      const openPos = executionEngine.getTotalOpenPositions();
      const pctStr = bestPct > -Infinity ? `${bestPct.toFixed(0)}%` : '?';
      const modeTag = isZ ? ` [${executionEngine.p50Mode}]` : '';
      const kzInfo = isZ && bestKz ? ` kZ=${bestKz.toFixed(2)}/${executionEngine.zThreshold}` : '';
      console.log(`\n[Recap 30s] Bot ON | ${enabledIds.length} pairs | ${openPos} pos | Closest: ${bestPair} ${bestDir} ${bestEdge >= 0 ? '+' : ''}${bestEdge.toFixed(1)}/${isZ ? 'fees' : bestObj.toFixed(1)}bps (${pctStr})${kzInfo}${modeTag}`);
      lines.forEach(l => console.log(l));
      if (executionEngine.getHedgeRecapLine) {
        console.log(`  ${executionEngine.getHedgeRecapLine()}`);
      }
      console.log('');

      executionEngine._logActivity('recap', null, null, 'periodic_30s',
        `${enabledIds.length} pairs | ${openPos} pos | closest: ${bestPair} ${bestDir} ${bestEdge >= 0 ? '+' : ''}${bestEdge.toFixed(1)}/${isZ ? 'fees' : bestObj.toFixed(1)}bps (${pctStr})${modeTag}`);
    }, 30000);

  }).catch(e => {
    console.error('[Execution] Init failed:', e.message);
  });
});

async function gracefulShutdown(signal) {
  console.log(`[Server] ${signal} received — shutting down`);
  executionEngine.stop();
  if (executionEngine2) executionEngine2.stop();
  if (executionEngine3) executionEngine3.stop();
  if (executionEngine4) executionEngine4.stop();
  for (const conn of wsPool.connections) {
    try { if (conn.ws) conn.ws.close(); } catch (e) {}
    conn._stopHeartbeat();
  }
  try {
    const flushPromises = [executionEngine.flushPendingDbWrites()];
    if (executionEngine2) flushPromises.push(executionEngine2.flushPendingDbWrites());
    if (executionEngine3) flushPromises.push(executionEngine3.flushPendingDbWrites());
    if (executionEngine4) flushPromises.push(executionEngine4.flushPendingDbWrites());
    await Promise.race([
      Promise.allSettled(flushPromises),
      new Promise(resolve => setTimeout(resolve, 5000)),
    ]);
    console.log('[Server] Pending DB writes flushed (or timed out after 5s)');
  } catch (e) {
    console.error('[Server] Error flushing DB writes:', e.message);
  }
  releaseLock();
  await db.pool.end().catch(e => console.error('[Shutdown] DB pool end error:', e.message));
  process.exit(0);
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
