class RingBuffer {
  constructor(size) {
    this.size = size;
    this.buffer = new Array(size);
    this._head = 0;
    this._count = 0;
  }

  push(item) {
    if (this._count < this.size) {
      this.buffer[this._count] = item;
      this._count++;
    } else {
      this.buffer[this._head] = item;
      this._head = (this._head + 1) % this.size;
    }
  }

  getAll() {
    if (this._count < this.size) {
      return this.buffer.slice(0, this._count);
    }
    const result = new Array(this.size);
    for (let i = 0; i < this.size; i++) {
      result[i] = this.buffer[(this._head + i) % this.size];
    }
    return result;
  }

  getLast(n) {
    const total = this._count;
    if (total === 0) return [];
    const count = Math.min(n, total);
    if (total < this.size) {
      return this.buffer.slice(total - count, total);
    }
    const result = new Array(count);
    const writePos = (this._head + this.size - 1) % this.size;
    for (let i = 0; i < count; i++) {
      result[count - 1 - i] = this.buffer[(writePos - i + this.size) % this.size];
    }
    return result;
  }

  clear() {
    this.buffer = new Array(this.size);
    this._head = 0;
    this._count = 0;
  }
}

class RollingStats {
  constructor() {
    this.samples = [];
    this.reservoir = [];
    this.reservoirSize = 1000;
    this.sampleCount = 0;
  }

  add(ts, value) {
    this.samples.push({ ts, value });
    const cutoff = ts - 3600000;
    while (this.samples.length > 0 && this.samples[0].ts < cutoff) {
      this.samples.shift();
    }
    if (this.samples.length > 10000) {
      this.samples = this.samples.slice(-10000);
    }

    this.sampleCount++;
    if (this.reservoir.length < this.reservoirSize) {
      this.reservoir.push(value);
    } else {
      const j = Math.floor(Math.random() * this.sampleCount);
      if (j < this.reservoirSize) {
        this.reservoir[j] = value;
      }
    }
  }

  maxOverWindow(windowMs) {
    if (this.samples.length === 0) return null;
    const cutoff = Date.now() - windowMs;
    let max = -Infinity;
    for (let i = this.samples.length - 1; i >= 0; i--) {
      if (this.samples[i].ts < cutoff) break;
      if (this.samples[i].value > max) max = this.samples[i].value;
    }
    return max === -Infinity ? null : max;
  }

  percentile(p) {
    if (this.reservoir.length === 0) return null;
    const sorted = [...this.reservoir].sort((a, b) => a - b);
    const idx = Math.min(Math.floor(p / 100 * sorted.length), sorted.length - 1);
    return sorted[idx];
  }

  getStats() {
    return {
      max1m: this.maxOverWindow(60000),
      max5m: this.maxOverWindow(300000),
      max1h: this.maxOverWindow(3600000),
      p90: this.percentile(90),
      p95: this.percentile(95),
      p99: this.percentile(99),
    };
  }
}

class SpikeTracker {
  constructor() {
    this.spikes = {};
  }

  update(key, ts, isAboveThreshold) {
    if (!this.spikes[key]) {
      this.spikes[key] = { startTs: null, count: 0, currentDurationMs: 0, fired: false };
    }
    const s = this.spikes[key];

    if (isAboveThreshold) {
      if (s.startTs === null) {
        s.startTs = ts;
        s.fired = false;
      }
      s.currentDurationMs = ts - s.startTs;
    } else {
      if (s.startTs !== null && s.currentDurationMs > 0) {
        s.count++;
      }
      s.startTs = null;
      s.currentDurationMs = 0;
      s.fired = false;
    }
  }

  markFired(key) {
    if (this.spikes[key]) {
      this.spikes[key].fired = true;
    }
  }

  get(key) {
    const s = this.spikes[key];
    if (!s) return { startTs: null, count: 0, currentDurationMs: 0, fired: false };
    return { ...s };
  }
}

class RepegTracker {
  constructor(closeThresholdBps = 1.0, minHoldMs = 10000, takerFee = 0.000082) {
    this.closeThresholdBps = closeThresholdBps;
    this.minHoldMs = minHoldMs;
    this.feeRoundTripRate = 4 * takerFee;
    this.openPositions = {};
    this.completedCycles = [];
    this.maxCompleted = 500;
    this.stats = {
      totalOpened: 0,
      totalRepegged: 0,
      totalFailedLiquidity: 0,
      theoreticalPnlBps: 0,
      totalVolumeUsd: 0,
      cyclesByHour: {},
    };
  }

  openPosition(key, ts, signal) {
    if (this.openPositions[key]) return;
    this.openPositions[key] = {
      openTs: ts,
      direction: signal.direction,
      Q: signal.Q,
      openGrossEdgeBps: signal.grossOpenEdgeBps,
      openNetEdgeBps: signal.netOpenEdgeBps,
      openBuyVWAP: signal.buyVWAP,
      openSellVWAP: signal.sellVWAP,
      openFeeOpenBps: signal.feeOpenBps,
    };
    this.stats.totalOpened++;
  }

  checkClose(key, ts, currentGrossEdgeBps, capacityOk, feeRoundTripBps) {
    const pos = this.openPositions[key];
    if (!pos) return null;

    if (ts <= pos.openTs) return null;

    const elapsed = ts - pos.openTs;
    if (elapsed < this.minHoldMs) return null;

    const edgeConverged = Math.abs(currentGrossEdgeBps) <= this.closeThresholdBps;
    if (!edgeConverged) return null;

    const durationMs = ts - pos.openTs;
    const theoreticalPnlBps = pos.openGrossEdgeBps - feeRoundTripBps;

    const cycle = {
      key,
      direction: pos.direction,
      Q: pos.Q,
      openTs: pos.openTs,
      closeTs: ts,
      durationMs,
      openGrossEdgeBps: pos.openGrossEdgeBps,
      closeGrossEdgeBps: currentGrossEdgeBps,
      theoreticalPnlBps,
      closeLiquidityOk: capacityOk,
      success: capacityOk && theoreticalPnlBps > 0,
    };

    delete this.openPositions[key];

    this.completedCycles.push(cycle);
    if (this.completedCycles.length > this.maxCompleted) {
      this.completedCycles.shift();
    }

    this.stats.totalVolumeUsd += pos.Q;

    if (capacityOk) {
      this.stats.totalRepegged++;
      this.stats.theoreticalPnlBps += theoreticalPnlBps;
    } else {
      this.stats.totalFailedLiquidity++;
    }

    const hourKey = new Date(ts).toISOString().slice(0, 13);
    if (!this.stats.cyclesByHour[hourKey]) {
      this.stats.cyclesByHour[hourKey] = { repegged: 0, failed: 0, pnlBps: 0 };
    }
    const h = this.stats.cyclesByHour[hourKey];
    if (capacityOk) {
      h.repegged++;
      h.pnlBps += theoreticalPnlBps;
    } else {
      h.failed++;
    }

    const hourKeys = Object.keys(this.stats.cyclesByHour).sort();
    while (hourKeys.length > 24) {
      delete this.stats.cyclesByHour[hourKeys.shift()];
    }

    return cycle;
  }

  hasOpenPosition(key) {
    return !!this.openPositions[key];
  }

  getOpenPositions() {
    return { ...this.openPositions };
  }

  getStats() {
    const successRate = this.stats.totalOpened > 0
      ? ((this.stats.totalRepegged / this.stats.totalOpened) * 100)
      : 0;
    const avgPnlBps = this.stats.totalRepegged > 0
      ? this.stats.theoreticalPnlBps / this.stats.totalRepegged
      : 0;

    const totalVolumeUsd = this.stats.totalVolumeUsd;
    const totalFeesUsd = this.completedCycles.reduce((sum, c) => {
      const feePerCycle = c.Q * this.feeRoundTripRate;
      return sum + feePerCycle;
    }, 0);
    const totalPnlUsd = this.completedCycles.reduce((sum, c) => {
      if (!c.success) return sum;
      return sum + (c.theoreticalPnlBps / 10000) * c.Q;
    }, 0);
    const netPerM = totalVolumeUsd > 0 ? ((totalPnlUsd - totalFeesUsd) / totalVolumeUsd) * 1000000 : 0;

    const profitableCycles = this.completedCycles.filter(c => c.success).length;

    return {
      totalOpened: this.stats.totalOpened,
      totalRepegged: this.stats.totalRepegged,
      totalFailedLiquidity: this.stats.totalFailedLiquidity,
      profitableCycles,
      pendingOpen: Object.keys(this.openPositions).length,
      successRate: Math.round(successRate * 10) / 10,
      theoreticalPnlBps: Math.round(this.stats.theoreticalPnlBps * 100) / 100,
      avgPnlBps: Math.round(avgPnlBps * 100) / 100,
      totalVolumeUsd: Math.round(totalVolumeUsd * 100) / 100,
      totalFeesUsd: Math.round(totalFeesUsd * 100) / 100,
      cpmUsd: Math.round(netPerM * 100) / 100,
      cyclesByHour: this.stats.cyclesByHour,
    };
  }

  getRecentCycles(n = 20) {
    return this.completedCycles.slice(-n);
  }

  loadHistoricalCycles(cycles) {
    for (const c of cycles) {
      this.completedCycles.push(c);
      this.stats.totalOpened++;
      this.stats.totalVolumeUsd += c.Q;
      if (c.closeLiquidityOk) {
        this.stats.totalRepegged++;
        this.stats.theoreticalPnlBps += c.theoreticalPnlBps;
      } else {
        this.stats.totalFailedLiquidity++;
      }
      const hourKey = new Date(c.closeTs).toISOString().slice(0, 13);
      if (!this.stats.cyclesByHour[hourKey]) {
        this.stats.cyclesByHour[hourKey] = { repegged: 0, failed: 0, pnlBps: 0 };
      }
      const h = this.stats.cyclesByHour[hourKey];
      if (c.closeLiquidityOk) {
        h.repegged++;
        h.pnlBps += c.theoreticalPnlBps;
      } else {
        h.failed++;
      }
    }
    const hourKeys = Object.keys(this.stats.cyclesByHour).sort();
    while (hourKeys.length > 24) {
      delete this.stats.cyclesByHour[hourKeys.shift()];
    }
    if (this.completedCycles.length > this.maxCompleted) {
      this.completedCycles = this.completedCycles.slice(-this.maxCompleted);
    }
    console.log(`[RepegTracker] Loaded ${cycles.length} historical cycles`);
  }
}

class DynamicPeg {
  constructor(windowMs = 600000, ewmaAlpha = 0.005) {
    this.windowMs = windowMs;
    this.ewmaAlpha = ewmaAlpha;
    this.samples = [];
    this.ewma = null;
    this.median = 0;
    this.peg = 0;
    this.ready = false;
    this.warmupSamples = 60;
  }

  update(ts, value) {
    this.samples.push({ ts, value });

    const cutoff = ts - this.windowMs;
    while (this.samples.length > 0 && this.samples[0].ts < cutoff) {
      this.samples.shift();
    }
    if (this.samples.length > 10000) {
      this.samples = this.samples.slice(-10000);
    }

    if (this.samples.length < 2) {
      this.peg = value;
      this.ewma = value;
      this.median = value;
      return this.peg;
    }

    const sorted = this.samples.map(s => s.value).sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    this.median = sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];

    if (this.ewma === null) {
      this.ewma = value;
    } else {
      this.ewma = this.ewmaAlpha * value + (1 - this.ewmaAlpha) * this.ewma;
    }

    this.peg = 0.7 * this.median + 0.3 * this.ewma;
    this.ready = this.samples.length >= this.warmupSamples;

    return this.peg;
  }

  getPeg() {
    return this.peg;
  }

  isReady() {
    return this.ready;
  }

  getState() {
    return {
      peg: Math.round(this.peg * 100) / 100,
      median: Math.round(this.median * 100) / 100,
      ewma: this.ewma !== null ? Math.round(this.ewma * 100) / 100 : null,
      ready: this.ready,
      samples: this.samples.length,
    };
  }
}

class Store {
  constructor(config) {
    this.config = { ...config };
    this.signals = new RingBuffer(config.signalRingSize || 500);
    this.spreadHistory = new RingBuffer(36000);
    this.rollingStats = {};
    this.spikeTracker = new SpikeTracker();
    this.repegTracker = new RepegTracker(config.repegCloseThresholdBps ?? 1.0, config.minRepegHoldMs ?? 10000, config.takerFee ?? 0.000082);
    const pegWindowMs = config.pegWindowMs ?? 600000;
    const pegAlpha = config.pegEwmaAlpha ?? 0.005;
    this.dynamicPeg = {
      d1: new DynamicPeg(pegWindowMs, pegAlpha),
      d2: new DynamicPeg(pegWindowMs, pegAlpha),
    };
    this.zScoreShort = {
      d1: new ZScoreTracker(config.zWindowSize || 60),
      d2: new ZScoreTracker(config.zWindowSize || 60),
    };
    this.zScoreLong = {
      d1: new ZScoreTracker(1800),
      d2: new ZScoreTracker(1800),
    };
    this.state = {
      marketA: config.marketA,
      marketB: config.marketB,
      connectionA: 'disconnected',
      connectionB: 'disconnected',
      lastUpdateA: null,
      lastUpdateB: null,
      bookA: null,
      bookB: null,
      metrics: {},
      opportunityCounts: { date: null, dir1: 0, dir2: 0, total: 0 },
      bigEdgeCounts: { date: null, d1: 0, d2: 0 },
    };
    this.resetDailyCounterIfNeeded();
  }

  resetDailyCounterIfNeeded() {
    const today = new Date().toISOString().slice(0, 10);
    if (this.state.opportunityCounts.date !== today) {
      this.state.opportunityCounts = { date: today, dir1: 0, dir2: 0, total: 0 };
    }
    if (this.state.bigEdgeCounts.date !== today) {
      this.state.bigEdgeCounts = { date: today, d1: 0, d2: 0 };
    }
  }

  incrementOpportunity(direction) {
    this.resetDailyCounterIfNeeded();
    if (direction === 1) this.state.opportunityCounts.dir1++;
    else this.state.opportunityCounts.dir2++;
    this.state.opportunityCounts.total++;
  }

  incrementBigEdge(direction) {
    this.resetDailyCounterIfNeeded();
    if (direction === 1) this.state.bigEdgeCounts.d1++;
    else this.state.bigEdgeCounts.d2++;
  }

  updateBook(market, book) {
    if (market === this.config.marketA) {
      this.state.bookA = book;
      this.state.lastUpdateA = Date.now();
    } else if (market === this.config.marketB) {
      this.state.bookB = book;
      this.state.lastUpdateB = Date.now();
    }
  }

  setConnection(market, status) {
    if (market === this.config.marketA) {
      this.state.connectionA = status;
    } else if (market === this.config.marketB) {
      this.state.connectionB = status;
    }
  }

  updateMetrics(metrics) {
    this.state.metrics = metrics;
    this.state.lastComputed = Date.now();
  }

  addSignal(signal) {
    this.signals.push(signal);
  }

  addSpreadSample(ts, dir1EdgeBps, dir2EdgeBps, dir1CapOk, dir2CapOk) {
    this.spreadHistory.push({ ts, dir1: dir1EdgeBps, dir2: dir2EdgeBps });
    if (dir1CapOk) this.dynamicPeg.d1.update(ts, dir1EdgeBps);
    if (dir2CapOk) this.dynamicPeg.d2.update(ts, dir2EdgeBps);
    this.zScoreShort.d1.addSample(dir1EdgeBps);
    this.zScoreShort.d2.addSample(dir2EdgeBps);
    this.zScoreLong.d1.addSample(dir1EdgeBps);
    this.zScoreLong.d2.addSample(dir2EdgeBps);
  }

  getZScores(dir) {
    const dk = dir === 1 ? 'd1' : 'd2';
    return {
      short: this.zScoreShort[dk].getScores(),
      long: this.zScoreLong[dk].getScores(),
    };
  }

  setZScoreWindowSize(n) {
    this.zScoreShort.d1.setWindowSize(n);
    this.zScoreShort.d2.setWindowSize(n);
  }

  setZScoreKalmanParams(Q, R) {
    this.zScoreShort.d1.setKalmanParams(Q, R);
    this.zScoreShort.d2.setKalmanParams(Q, R);
    this.zScoreLong.d1.setKalmanParams(Q, R);
    this.zScoreLong.d2.setKalmanParams(Q, R);
  }

  getDynamicPeg(dir) {
    const dp = dir === 1 ? this.dynamicPeg.d1 : this.dynamicPeg.d2;
    return dp.getPeg();
  }

  getDynamicPegState() {
    return {
      d1: this.dynamicPeg.d1.getState(),
      d2: this.dynamicPeg.d2.getState(),
    };
  }

  getSpreadHistory(n = 36000) {
    return this.spreadHistory.getLast(n);
  }

  getRollingStats(key) {
    if (!this.rollingStats[key]) {
      this.rollingStats[key] = new RollingStats();
    }
    return this.rollingStats[key];
  }

  addEdgeSample(key, ts, value) {
    this.getRollingStats(key).add(ts, value);
  }

  updateSpike(key, ts, isAbove) {
    this.spikeTracker.update(key, ts, isAbove);
  }

  markSpikeFired(key) {
    this.spikeTracker.markFired(key);
  }

  getSpikeInfo(key) {
    return this.spikeTracker.get(key);
  }

  openRepegPosition(key, ts, signal) {
    this.repegTracker.openPosition(key, ts, signal);
  }

  checkRepegClose(key, ts, grossEdgeBps, capacityOk, feeCloseBps) {
    return this.repegTracker.checkClose(key, ts, grossEdgeBps, capacityOk, feeCloseBps);
  }

  hasRepegOpen(key) {
    return this.repegTracker.hasOpenPosition(key);
  }

  getRepegStats() {
    return this.repegTracker.getStats();
  }

  getRecentRepegCycles(n) {
    return this.repegTracker.getRecentCycles(n);
  }

  getDislocationStats() {
    const stats = {};
    for (const key of Object.keys(this.rollingStats)) {
      stats[key] = this.rollingStats[key].getStats();
    }
    return stats;
  }

  getState() {
    this.resetDailyCounterIfNeeded();
    return {
      ...this.state,
      bookA: this.state.bookA ? {
        bidsCount: this.state.bookA.bids.length,
        asksCount: this.state.bookA.asks.length,
        bestBid: this.state.bookA.bids[0],
        bestAsk: this.state.bookA.asks[0],
      } : null,
      bookB: this.state.bookB ? {
        bidsCount: this.state.bookB.bids.length,
        asksCount: this.state.bookB.asks.length,
        bestBid: this.state.bookB.bids[0],
        bestAsk: this.state.bookB.asks[0],
      } : null,
    };
  }

  getConfig() {
    return { ...this.config };
  }

  updateConfig(updates) {
    Object.assign(this.config, updates);
  }
}

class ZScoreTracker {
  constructor(windowSize = 60, kalmanQ = 0.01, kalmanR = 0.5) {
    this.windowSize = windowSize;
    this._buf = new Float64Array(windowSize);
    this._head = 0;
    this._count = 0;
    this._last = 0;
    this._kXhat = 0;
    this._kP = 1.0;
    this._kQ = kalmanQ;
    this._kR = kalmanR;
    this._kReady = false;
    this._ewmaFast = null;
    this._ewmaSlow = null;
    this._ewmaVol = 0;
    this._ewmaAlphaFast = 2 / 13;
    this._ewmaAlphaSlow = 2 / 27;
  }

  addSample(val) {
    this._last = val;
    if (this._count < this.windowSize) {
      this._buf[this._count] = val;
      this._count++;
    } else {
      this._buf[this._head] = val;
      this._head = (this._head + 1) % this.windowSize;
    }
    const pPred = this._kP + this._kQ;
    const K = pPred / (pPred + this._kR);
    const innovation = val - this._kXhat;
    this._kXhat = this._kXhat + K * innovation;
    this._kP = (1 - K) * pPred;
    if (!this._kReady && this._count >= 3) this._kReady = true;
    this._lastInnovation = innovation;
    this._lastUncertainty = Math.sqrt(this._kP + this._kR);
    if (this._ewmaFast === null) {
      this._ewmaFast = val;
      this._ewmaSlow = val;
    } else {
      this._ewmaFast = this._ewmaAlphaFast * val + (1 - this._ewmaAlphaFast) * this._ewmaFast;
      this._ewmaSlow = this._ewmaAlphaSlow * val + (1 - this._ewmaAlphaSlow) * this._ewmaSlow;
      this._ewmaVol = this._ewmaAlphaSlow * Math.abs(val - this._ewmaSlow) + (1 - this._ewmaAlphaSlow) * this._ewmaVol;
    }
  }

  getStaticZ() {
    if (this._count < 5) return 0;
    const n = Math.min(this._count, this.windowSize);
    let sum = 0;
    for (let i = 0; i < n; i++) sum += this._buf[i];
    const mean = sum / n;
    let varSum = 0;
    for (let i = 0; i < n; i++) {
      const d = this._buf[i] - mean;
      varSum += d * d;
    }
    const std = Math.sqrt(varSum / n);
    if (std < 0.001) return 0;
    return (this._last - mean) / std;
  }

  getKalmanZ() {
    if (!this._kReady) return 0;
    if (this._lastUncertainty < 0.001) return 0;
    return this._lastInnovation / this._lastUncertainty;
  }

  getKalmanMid() {
    return this._kReady ? this._kXhat : 0;
  }

  getMeanStd() {
    if (this._count < 5) return { meanBps: 0, stdBps: 0 };
    const n = Math.min(this._count, this.windowSize);
    let sum = 0;
    for (let i = 0; i < n; i++) sum += this._buf[i];
    const mean = sum / n;
    let varSum = 0;
    for (let i = 0; i < n; i++) {
      const d = this._buf[i] - mean;
      varSum += d * d;
    }
    const std = Math.sqrt(varSum / n);
    return { meanBps: Math.round(mean * 100) / 100, stdBps: Math.round(std * 100) / 100 };
  }

  getScores() {
    const { meanBps, stdBps } = this.getMeanStd();
    return {
      staticZ: Math.round(this.getStaticZ() * 1000) / 1000,
      kalmanZ: Math.round(this.getKalmanZ() * 1000) / 1000,
      kalmanMid: Math.round(this.getKalmanMid() * 100) / 100,
      ewmaFast: this._ewmaFast !== undefined ? Math.round((this._ewmaFast || 0) * 100) / 100 : null,
      ewmaSlow: this._ewmaSlow !== undefined ? Math.round((this._ewmaSlow || 0) * 100) / 100 : null,
      ewmaDelta: this._ewmaFast !== undefined && this._ewmaSlow !== undefined ? Math.round(((this._ewmaFast || 0) - (this._ewmaSlow || 0)) * 100) / 100 : null,
      meanBps,
      stdBps,
    };
  }

  setWindowSize(n) {
    if (n === this.windowSize) return;
    const old = this._getAll();
    this.windowSize = n;
    this._buf = new Float64Array(n);
    this._head = 0;
    this._count = 0;
    const start = Math.max(0, old.length - n);
    for (let i = start; i < old.length; i++) {
      this._buf[this._count] = old[i];
      this._count++;
    }
  }

  setKalmanParams(Q, R) {
    this._kQ = Q;
    this._kR = R;
  }

  _getAll() {
    if (this._count < this.windowSize) return Array.from(this._buf.subarray(0, this._count));
    const result = new Array(this.windowSize);
    for (let i = 0; i < this.windowSize; i++) {
      result[i] = this._buf[(this._head + i) % this.windowSize];
    }
    return result;
  }
}

module.exports = { Store, RingBuffer, RollingStats, SpikeTracker, RepegTracker, DynamicPeg, ZScoreTracker };
