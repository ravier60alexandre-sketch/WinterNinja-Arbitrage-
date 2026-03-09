const hlApiModule = require('./hl_api');
const { pool, saveBotConfig, loadBotConfig, saveActivityLog, withTransaction } = require('./db');
const { getParisTime, TIMEZONE } = require('./tz');
const { buyVWAP, sellVWAP } = require('./orderbook');
const EventEmitter = require('events');


const DEPLOYER_COLLATERAL = {
  xyz: 'usdc',
  flx: 'usdh',
  km: 'usdh',
  vntl: 'usdh',
  hyna: 'usdh',
  abcd: 'usdh',
  cash: 'usdt',
};

const MIN_DEPLOYER_COLLATERAL_DEFAULT = 5;

class ExecutionEngine {
  constructor(config = {}, apiInstance = null) {
    this._hlApi = apiInstance || hlApiModule;
    this._botId = config.botId || 'bot1';
    this._eventEmitter = new EventEmitter();
    this._eventEmitter.setMaxListeners(50);
    this.enabled = false;
    this.enabledPairs = {};
    this.maxGlobalPositions = config.maxGlobalPositions || 1000;
    this.maxPositionUsd = config.maxPositionUsd || 500;
    this.positionSizeUsd = config.positionSizeUsd || 25;
    this._leverageSet = {};
    this.minEdgeBps = config.minEdgeBps || 4.55;

    this._pairGrowthModes = {};
    this._crossRate = config.crossRate || 0.00045;
    this._addRate = config.addRate || 0.00015;
    this._growthMultiplier = 0.1;
    this._takerFeeGrowth = this._crossRate * this._growthMultiplier;
    this._takerFeeNoGrowth = this._addRate;
    this._growthFeeOverride = null;
    this._feeRoundTripBps = 2 * this._takerFeeGrowth * 10000;
    this._onFeeUpdateCallbacks = [];
    this.slippagePct = config.slippagePct || 0.005;
    this.minProfitCloseBps = config.minProfitCloseBps ?? 0.5;
    this.maxLeverage = config.maxLeverage || 10;
    this._maxSlippageBps = config.maxSlippageBps ?? 8;
    this.stopLossBps = config.stopLossBps ?? 0;
    this.marginBps = config.marginBps ?? config.costsBps ?? 3;
    this._pairTierMarginPct = {};
    this.tierConfig = { thresholds: { allIn: 0.97, normal: 0.90 }, marginPct: { normal: 5, prudent: 2 } };
    this.tierConfigDefaults = { thresholds: { allIn: 0.97, normal: 0.90 }, marginPct: { normal: 5, prudent: 2 } };
    this.p50Mode = config.p50Mode ?? 'zscore';
    this.bufferBps = config.bufferBps ?? 3.5;
    this.slippageMarginBps = config.slippageMarginBps ?? 2;
    this.dataTimer = config.dataTimer ?? '6h';
    this.closeBufferBps = config.closeBufferBps ?? 1;
    this.maxLossBps = config.maxLossBps ?? 50;
    this.zMeanRevert = config.zMeanRevert ?? false;
    this.tiersEnabled = config.tiersEnabled ?? true;
    this._pairZThresholds = {};
    this._pairBufferBps = {};
    this.pendingOrders = {};
    this._pairErrorCooldown = {};
    this.stats = {
      totalExecuted: 0,
      totalFilled: 0,
      totalFailed: 0,
      totalPnlUsd: 0,
    };
    this._initialized = false;
    this._dexFilter = config.dexFilter || null;
    this._botNum = parseInt((config.botId || 'bot1').replace('bot', ''), 10) || 1;
    this._staggerMs = (this._botNum - 1) * 2000;
    this._cachedBalances = null;
    this._balanceCacheTs = 0;
    this._collateralOk = false;
    this._lastKnownMids = {};
    this._execTimeRing = [];
    this._execTimeRingMax = 50;
    this._e2eLatencyRing = [];
    this._e2eLatencyRingMax = 100;
    this._activityLog = [];
    this._activityLogMax = 200;
    this._missedStats = {};
    this._peakPositions = {};
    this._peakGlobalPositions = 0;
    this._marginBlocked = {};
    this._coinFailCounts = {};
    this._legFailCounts = {};
    this._symbolCooldownUntil = {};
    this._symbolFailCounts = {};
    this._allPairIds = [];
    this._pendingDbInsertCoins = new Set();
    this._recentlyTradedCoins = {};
    this._orphanCloseDelayMs = 25000;
    this._orphanClosing = new Set();
    this._alertCooldowns = {};
    this._alertWebhookUrl = process.env.ALERT_WEBHOOK_URL || '';
    this.minDeployerCollateralUsd = config.minDeployerCollateralUsd || MIN_DEPLOYER_COLLATERAL_DEFAULT;
    this.liquidationMode = false;
    this._closingCoins = {};
    this._feeSource = 'config';
    this._feeLastRefresh = 0;
    this._feeRefreshInterval = null;
    this._initialCrossRate = config.crossRate || 0.00045;
    this._initialAddRate = config.addRate || 0.00015;
    this._fundingCache = { entries: [], byDexCoin: {}, lastFetchMs: 0 };
    this._sessionStartMs = Date.now();
    this._realtimeEdgeRing = {};
    this._realtimeWindowMs = config.realtimeWindowMs || 600000;
    this._realtimeRingMaxAge = 3600000;
    this._fundingCacheTtlMs = 300000;
    this._dustFactor = config.dustFactor || 0.1;
    this._stableTargets = config.stableTargets || { usdc: 0.5, usdt: 0.25, usdh: 0.25 };
    this._driftThreshold = config.driftThreshold || 0.1;
    this._stableRebalancing = false;
    this._lastRebalanceTs = 0;
    this._intraRebalanceIntervalSec = config.intraRebalanceIntervalSec || 60;
    this._intraRebalanceCooldownSec = config.intraRebalanceCooldownSec || 180;
    this._dryThresholdPct = config.dryThresholdPct || 5;
    this._donateThresholdPct = config.donateThresholdPct || 10;
    this._closeLatencyRing = [];
    this._closeLatencyRingMax = 100;
    this._pendingDbWrites = new Set();
    this._ringBufferAccessor = null;
    this.atoEnabled = false;
    this.zThreshold = config.zThreshold ?? 0.5;
    this.zWindowSec = config.zWindowSec ?? 60;
    this.zKalmanSensitivity = config.zKalmanSensitivity ?? 'normal';
    this.minHoldMs = config.minHoldMs ?? 3000;

    this._positions = new Map();
    this._closingPositions = new Set();
  }

  get _logPrefix() {
    return `[${this._botId}]`;
  }

  _persistOrphanSeen() {
    const p = saveBotConfig(this._cfgKey('orphan_on_chain_seen'), this._orphanOnChainSeen || {}).catch(e => console.error(`${this._logPrefix} persistOrphanSeen error:`, e.message));
    this._pendingDbWrites.add(p);
    p.finally(() => this._pendingDbWrites.delete(p));
  }

  async flushPendingDbWrites() {
    if (this._pendingDbWrites.size === 0) return;
    console.log(`${this._logPrefix} Flushing ${this._pendingDbWrites.size} pending DB writes...`);
    await Promise.allSettled([...this._pendingDbWrites]);
    console.log(`${this._logPrefix} DB writes flushed.`);
  }

  setRingBufferAccessor(accessor) { this._ringBufferAccessor = accessor; }
  setRegimeAccessor(accessor) { this._regimeAccessor = accessor; }
  setATOAccessor(accessor) { this._atoAccessor = accessor; }
  setMeanReversionAccessor(accessor) { this._meanReversionAccessor = accessor; }
  setZScoreAccessor(accessor) { this._zScoreAccessor = accessor; }

  _checkZScoreEntry(signal, pairId) {
    const mode = this.p50Mode;
    const gross = signal.grossOpenEdgeBps || 0;
    const feesRT = this.getPairFeeRoundTripBps(pairId);
    const pairBuffer = this._pairBufferBps[pairId] ?? this.bufferBps;
    const minEdge = feesRT + pairBuffer;
    const pairZ = this._pairZThresholds[pairId] ?? this.zThreshold;

    let score = 0;
    if (mode === 'ewma') {
      score = Math.abs(signal.ewmaDelta || 0);
    } else {
      score = signal.kalmanZ || 0;
    }

    if (score < pairZ) {
      return { allowed: false, reason: `${mode}_below`, detail: `${mode === 'ewma' ? 'EWMA delta' : 'Z'} ${score.toFixed(2)} < ${pairZ} (mode=${mode})` };
    }

    if (this.slippageMarginBps > 0) {
      if (gross < feesRT) {
        return { allowed: false, reason: `${mode}_grossedge`, detail: `gross edge ${gross.toFixed(2)}bps < feesRT ${feesRT.toFixed(2)}bps — spread doesn't cover fees` };
      }
      const stdBps = signal.stdBps || 0;
      const deviationBps = score * stdBps;
      const adaptiveMinEdge = feesRT + this.slippageMarginBps;
      if (deviationBps < adaptiveMinEdge) {
        return { allowed: false, reason: `${mode}_devfees`, detail: `dev ${deviationBps.toFixed(2)}bps (${score.toFixed(2)}×σ${stdBps.toFixed(1)}) < fees ${feesRT.toFixed(2)} + slip ${this.slippageMarginBps}bps = ${adaptiveMinEdge.toFixed(2)}bps` };
      }
      return { allowed: true, reason: `${mode}_pass` };
    }

    if (gross < minEdge) {
      return { allowed: false, reason: `${mode}_fees`, detail: `edge ${gross.toFixed(2)} < fees ${feesRT.toFixed(2)} + buffer ${pairBuffer}bps` };
    }
    return { allowed: true, reason: `${mode}_pass` };
  }

  _isZScoreMode() { return true; }

  _cfgKey(key) {
    return this._botId === 'bot1' ? key : `${this._botId}_${key}`;
  }

  _sendAlert(type, message) {
    const cooldownMs = 300000;
    const now = Date.now();
    if (this._alertCooldowns[type] && now - this._alertCooldowns[type] < cooldownMs) return;
    this._alertCooldowns[type] = now;
    const url = this._alertWebhookUrl;
    if (!url) {
      console.warn(`${this._logPrefix}[Alert] ${type}: ${message} (no webhook URL configured)`);
      return;
    }
    const payload = JSON.stringify({ text: `[${this._botId}] ${type}: ${message}` });
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      signal: AbortSignal.timeout(5000),
    }).then(r => {
      if (!r.ok) console.error(`${this._logPrefix}[Alert] Webhook returned ${r.status}`);
    }).catch(e => {
      console.error(`${this._logPrefix}[Alert] Webhook error: ${e.message}`);
    });
  }

  _logActivity(type, pairId, signal, reason, detail, extra) {
    const entry = {
      ts: Date.now(),
      type,
      pairId,
      direction: signal?.direction,
      Q: signal?.Q,
      edgeBps: signal?.grossOpenEdgeBps,
      reason: reason || null,
      detail: detail || null,
      botId: this._botId,
      latencyMs: extra?.latencyMs ?? signal?.latencyMs ?? null,
      motif: extra?.motif ?? null,
      p50Used: extra?.p50Used ?? null,
      feesEstimate: extra?.feesEstimate ?? null,
      kalmanZ: signal?.kalmanZ ?? null,
      kalmanZLong: signal?.kalmanZLong ?? null,
      entryMode: this.p50Mode,
    };
    this._activityLog.push(entry);
    if (this._activityLog.length > this._activityLogMax) {
      this._activityLog.shift();
    }
    saveActivityLog(entry).catch(e => console.error(`${this._logPrefix} saveActivityLog error:`, e.message));
    if (type === 'blocked' || (type === 'reject' && reason !== 'edge_too_small' && reason !== 'pair_disabled')) {
      this._trackMissed(pairId, reason, signal);
    }
    return entry;
  }

  _emitEvent(eventType, data) {
    const event = { type: eventType, ts: Date.now(), botId: this._botId, ...data };
    this._eventEmitter.emit('sse', event);
  }

  onEvent(listener) {
    this._eventEmitter.on('sse', listener);
    return () => this._eventEmitter.removeListener('sse', listener);
  }

  _trackMissed(pairId, reason, signal) {
    const day = new Date().toISOString().slice(0, 10);
    if (!this._missedStats[day]) this._missedStats[day] = {};
    if (!this._missedStats[day][reason]) this._missedStats[day][reason] = { count: 0, pairs: {}, totalEdgeBps: 0 };
    const bucket = this._missedStats[day][reason];
    bucket.count++;
    bucket.totalEdgeBps += signal?.grossOpenEdgeBps || 0;
    bucket.pairs[pairId] = (bucket.pairs[pairId] || 0) + 1;

    const current = this.getTotalOpenPositions();
    if (current > this._peakGlobalPositions) this._peakGlobalPositions = current;
  }

  getMissedStats() {
    const days = Object.keys(this._missedStats).sort().reverse();
    const today = new Date().toISOString().slice(0, 10);
    const todayStats = this._missedStats[today] || {};
    const allTime = {};
    for (const day of days) {
      for (const [reason, data] of Object.entries(this._missedStats[day])) {
        if (!allTime[reason]) allTime[reason] = { count: 0, totalEdgeBps: 0, pairs: {} };
        allTime[reason].count += data.count;
        allTime[reason].totalEdgeBps += data.totalEdgeBps;
        for (const [pid, cnt] of Object.entries(data.pairs)) {
          allTime[reason].pairs[pid] = (allTime[reason].pairs[pid] || 0) + cnt;
        }
      }
    }
    const totalMissedToday = Object.values(todayStats).reduce((s, d) => s + d.count, 0);
    const totalMissedAllTime = Object.values(allTime).reduce((s, d) => s + d.count, 0);
    const peakGlobal = this._peakGlobalPositions;

    return {
      today: todayStats,
      allTime,
      totalMissedToday,
      totalMissedAllTime,
      peakGlobalPositions: peakGlobal,
      currentGlobal: this.getTotalOpenPositions(),
      maxGlobalConfig: this.maxGlobalPositions,
      daily: days.map(d => ({
        date: d,
        missed: Object.values(this._missedStats[d]).reduce((s, x) => s + x.count, 0),
        byReason: this._missedStats[d],
      })),
    };
  }

  getActivityLog(n = 50) {
    return this._activityLog.slice(-n).reverse();
  }

  async initialize() {
    if (this._initialized) return;
    try {
      if (!this._hlApi.isConfigured()) {
        console.log(`${this._logPrefix} HL_PRIVATE_KEY not set, bot disabled`);
        return;
      }
      await this._hlApi.init();
      const addr = this._hlApi.getActiveAddress();
      const vault = this._hlApi.getVaultAddress();
      this._activeAddress = addr;
      console.log(`${this._logPrefix} Initialized with wallet ${addr}${vault ? ` (sub-account: ${vault})` : ''}`);
      this._initialized = true;

      await this._loadPositionsFromDb();

      this._startBalanceRefreshLoop();
      this._startBalanceRebalancer();
      this._startReconciliationLoop();
      this._startPositionCloseLoop();

      setTimeout(async () => {
        await this._refreshFeeRates();
        this._feeRefreshInterval = setInterval(() => this._refreshFeeRates(), 300000);
      }, this._staggerMs);

      this.enabled = false;
      console.log(`${this._logPrefix} Bot starts STOPPED — manual start required`);

      const savedLiquidation = await loadBotConfig(this._cfgKey('bot_liquidation'));
      if (savedLiquidation === true) {
        this.liquidationMode = true;
        this.enabled = true;
        console.log(`${this._logPrefix} Restored LIQUIDATION MODE: active (overrides stop)`);
      }

      this._allPairIds = this._allPairIds || [];
      if (this._allPairIds.length > 0) {
        for (const p of this._allPairIds) this.enabledPairs[p] = true;
        console.log(`${this._logPrefix} All ${this._allPairIds.length} pairs enabled`);
      }

      const savedParams = await loadBotConfig(this._cfgKey('bot_params'));
      if (savedParams && typeof savedParams === 'object') {
        if (savedParams.maxGlobalPositions !== undefined) this.maxGlobalPositions = savedParams.maxGlobalPositions;
        if (savedParams.maxPositionUsd !== undefined) this.maxPositionUsd = savedParams.maxPositionUsd;
        if (savedParams.positionSizeUsd !== undefined) this.positionSizeUsd = savedParams.positionSizeUsd;
        if (savedParams.minEdgeBps !== undefined) this.minEdgeBps = savedParams.minEdgeBps;
        if (savedParams.maxLeverage !== undefined) this.maxLeverage = savedParams.maxLeverage;
        if (savedParams.stopLossBps !== undefined) this.stopLossBps = savedParams.stopLossBps;
        if (savedParams.marginBps !== undefined) {
          this.marginBps = savedParams.marginBps;
        }
        if (savedParams.p50Mode !== undefined || savedParams.entryMode !== undefined) {
          const raw = savedParams.entryMode || savedParams.p50Mode;
          const validModes = ['zscore', 'ou', 'kalman', 'ewma'];
          if (validModes.includes(raw)) this.p50Mode = raw;
          else this.p50Mode = 'zscore';
        }
        if (savedParams.zThreshold !== undefined) this.zThreshold = Math.max(0.5, Math.min(5.0, parseFloat(savedParams.zThreshold) || 2.0));
        if (savedParams.zWindowSec !== undefined) this.zWindowSec = Math.max(10, Math.min(300, parseInt(savedParams.zWindowSec) || 60));
        if (savedParams.zKalmanSensitivity !== undefined && ['fast', 'normal', 'slow'].includes(savedParams.zKalmanSensitivity)) this.zKalmanSensitivity = savedParams.zKalmanSensitivity;
        if (savedParams.minHoldMs !== undefined) this.minHoldMs = Math.max(1000, Math.min(30000, parseInt(savedParams.minHoldMs) || 3000));
        if (savedParams.realtimeWindowMin !== undefined) this._realtimeWindowMs = Math.max(60000, Math.min(3600000, parseFloat(savedParams.realtimeWindowMin) * 60000));
        if (savedParams.closeBufferBps !== undefined) this.closeBufferBps = savedParams.closeBufferBps;
        if (savedParams.maxLossBps !== undefined) this.maxLossBps = savedParams.maxLossBps;
        if (savedParams.minDeployerCollateralUsd !== undefined) this.minDeployerCollateralUsd = savedParams.minDeployerCollateralUsd;
        if (savedParams.growthFeeOverride !== undefined && savedParams.growthFeeOverride !== null) {
          this._growthFeeOverride = savedParams.growthFeeOverride;
          this._takerFeeGrowth = this._growthFeeOverride;
          this._feeRoundTripBps = 2 * this._takerFeeGrowth * 10000;
        }
        if (savedParams.stableTargets !== undefined && typeof savedParams.stableTargets === 'object') {
          this._stableTargets = savedParams.stableTargets;
        }
        if (savedParams.atoEnabled !== undefined) this.atoEnabled = !!savedParams.atoEnabled;
        if (savedParams.driftThreshold !== undefined) this._driftThreshold = savedParams.driftThreshold;
        if (savedParams.intraRebalanceIntervalSec !== undefined) this._intraRebalanceIntervalSec = savedParams.intraRebalanceIntervalSec;
        if (savedParams.intraRebalanceCooldownSec !== undefined) this._intraRebalanceCooldownSec = savedParams.intraRebalanceCooldownSec;
        if (savedParams.dryThresholdPct !== undefined) this._dryThresholdPct = savedParams.dryThresholdPct;
        if (savedParams.donateThresholdPct !== undefined) this._donateThresholdPct = savedParams.donateThresholdPct;
        if (savedParams.alertWebhookUrl !== undefined) this._alertWebhookUrl = savedParams.alertWebhookUrl || '';
        if (savedParams.tierConfig !== undefined && typeof savedParams.tierConfig === 'object') {
          if (savedParams.tierConfig.marginPct) {
            this.tierConfig = savedParams.tierConfig;
          } else {
            if (savedParams.tierConfig.thresholds) this.tierConfig.thresholds = savedParams.tierConfig.thresholds;
          }
        }
        if (savedParams.tiersEnabled !== undefined) this.tiersEnabled = !!savedParams.tiersEnabled;
        if (savedParams.pairZThresholds && typeof savedParams.pairZThresholds === 'object') this._pairZThresholds = savedParams.pairZThresholds;
        if (savedParams.pairBufferBps && typeof savedParams.pairBufferBps === 'object') this._pairBufferBps = savedParams.pairBufferBps;
        console.log(`${this._logPrefix} Restored bot params: maxGlobal=${this.maxGlobalPositions}, maxPosUsd=$${this.maxPositionUsd}, maxLev=${this.maxLeverage}x, SL=${this.stopLossBps}bps, marginBps=${this.marginBps}, mode=${this.p50Mode}, closeBuffer=${this.closeBufferBps}bps, maxLoss=${this.maxLossBps}bps, zThreshold=${this.zThreshold}, tiersEnabled=${this.tiersEnabled}`);
      }

    } catch (err) {
      console.error(`${this._logPrefix} Init error:`, err.message, err.stack);
    }
  }

  async _loadPositionsFromDb() {
    try {
      const res = await pool.query(
        `SELECT * FROM positions WHERE bot_id = $1 AND status = 'open'`, [this._botId]
      );
      for (const row of res.rows) {
        this._positions.set(row.pair_id, {
          id: row.id,
          pairId: row.pair_id,
          direction: row.direction,
          legACoin: row.leg_a_coin,
          legBCoin: row.leg_b_coin,
          size: parseFloat(row.size) || 0,
          vwapA: parseFloat(row.vwap_entry_a) || 0,
          vwapB: parseFloat(row.vwap_entry_b) || 0,
          avgSlipBps: parseFloat(row.avg_slippage_bps) || 0,
          totalFills: parseInt(row.total_fills) || 0,
          totalNotionalUsd: parseFloat(row.total_notional_usd) || 0,
          realizedPnlUsd: parseFloat(row.realized_pnl_usd) || 0,
          feesUsd: parseFloat(row.fees_usd) || 0,
          openedAt: parseInt(row.opened_at) || Date.now(),
          updatedAt: parseInt(row.updated_at) || Date.now(),
          status: row.status,
        });
      }
      console.log(`${this._logPrefix} Loaded ${this._positions.size} open positions from DB`);
    } catch (err) {
      console.error(`${this._logPrefix} _loadPositionsFromDb error:`, err.message);
    }
  }

  updatePairTiers(tierMap) {
    this._pairTierMarginPct = tierMap || {};
  }

  async updateTierConfig({ thresholds, marginPct }) {
    if (thresholds) {
      if (thresholds.allIn !== undefined) this.tierConfig.thresholds.allIn = parseFloat(thresholds.allIn);
      if (thresholds.normal !== undefined) this.tierConfig.thresholds.normal = parseFloat(thresholds.normal);
    }
    if (marginPct) {
      if (marginPct.normal !== undefined) this.tierConfig.marginPct.normal = parseFloat(marginPct.normal);
      if (marginPct.prudent !== undefined) this.tierConfig.marginPct.prudent = parseFloat(marginPct.prudent);
    }
    saveBotConfig(this._cfgKey('bot_params'), {
      ...await loadBotConfig(this._cfgKey('bot_params')),
      tierConfig: this.tierConfig,
    });
    console.log(`${this._logPrefix} Tier config updated: thresholds=${JSON.stringify(this.tierConfig.thresholds)}, marginPct=${JSON.stringify(this.tierConfig.marginPct)}`);
  }

  resetTierConfig() {
    this.tierConfig = JSON.parse(JSON.stringify(this.tierConfigDefaults));
    saveBotConfig(this._cfgKey('bot_params'), { tierConfig: this.tierConfig });
    console.log(`${this._logPrefix} Tier config RESET to defaults: ${JSON.stringify(this.tierConfig)}`);
  }

  getPositionNotionalUsd(pairId) {
    const pos = this._positions.get(pairId);
    if (!pos || pos.size <= 0) return 0;
    return pos.size * ((pos.vwapA + pos.vwapB) / 2);
  }

  getPairMarginUsedPct(pairId) {
    const notional = this.getPositionNotionalUsd(pairId);
    if (notional === 0) return 0;
    const b = this._cachedBalances;
    const totalBalance = b ? (b.usdc || 0) + (b.usdt || 0) + (b.usdh || 0) : 0;
    if (totalBalance <= 0) return 100;
    return (notional / (this.maxLeverage || 10) / totalBalance) * 100;
  }

  getTotalBalance() {
    const b = this._cachedBalances;
    return b ? (b.usdc || 0) + (b.usdt || 0) + (b.usdh || 0) : 0;
  }

  async presetLeverage(allPairConfigs) {
    if (!this._initialized) return;
    const coins = new Set();
    for (const pc of allPairConfigs) {
      coins.add(pc.marketA);
      coins.add(pc.marketB);
    }
    console.log(`${this._logPrefix} Pre-setting max leverage for ${coins.size} coins...`);
    for (const coin of coins) {
      await this._ensureLeverage(coin);
      await new Promise(r => setTimeout(r, 200));
    }
    console.log(`${this._logPrefix} Leverage set:`, { ...this._leverageSet });
  }

  isEnabled() { return this.enabled && this._initialized; }

  start() {
    if (!this._initialized) {
      console.log(`${this._logPrefix} Cannot start: not initialized`);
      return false;
    }
    this.enabled = true;
    saveBotConfig(this._cfgKey('bot_enabled'), true);
    const activePairs = Object.keys(this.enabledPairs).filter(p => this.enabledPairs[p]);
    saveBotConfig(this._cfgKey('enabled_pairs'), activePairs);
    console.log(`${this._logPrefix} Bot STARTED with ${activePairs.length} pairs: ${activePairs.join(', ')} | mode=${this.p50Mode}`);
    return true;
  }

  stop() {
    this.enabled = false;
    this.liquidationMode = false;
    saveBotConfig(this._cfgKey('bot_enabled'), false);
    saveBotConfig(this._cfgKey('bot_liquidation'), false);
    console.log(`${this._logPrefix} Bot STOPPED`);
    return true;
  }

  startLiquidation() {
    if (!this._initialized) {
      console.log(`${this._logPrefix} Cannot start liquidation: not initialized`);
      return false;
    }
    this.liquidationMode = true;
    this.enabled = true;
    saveBotConfig(this._cfgKey('bot_liquidation'), true);
    saveBotConfig(this._cfgKey('bot_enabled'), true);
    console.log(`${this._logPrefix} LIQUIDATION MODE STARTED — no new entries, close monitoring active`);
    return true;
  }

  stopLiquidation() {
    this.liquidationMode = false;
    saveBotConfig(this._cfgKey('bot_liquidation'), false);
    console.log(`${this._logPrefix} LIQUIDATION MODE STOPPED — normal trading resumed`);
    return true;
  }

  enablePair(pairId) {
    this.enabledPairs[pairId] = true;
    if (this._legFailCounts) this._legFailCounts[pairId] = 0;
    saveBotConfig(this._cfgKey('enabled_pairs'), Object.keys(this.enabledPairs).filter(p => this.enabledPairs[p]));
  }

  disablePair(pairId) {
    delete this.enabledPairs[pairId];
    saveBotConfig(this._cfgKey('enabled_pairs'), Object.keys(this.enabledPairs).filter(p => this.enabledPairs[p]));
  }

  isPairEnabled(pairId) { return !!this.enabledPairs[pairId]; }

  getOpenPositionCount(pairId) {
    const pos = this._positions.get(pairId);
    return (pos && pos.size > 0) ? 1 : 0;
  }

  getTotalOpenPositions() {
    let count = 0;
    for (const [, pos] of this._positions) {
      if (pos.size > 0) count++;
    }
    return count;
  }

  getPositionsMap() {
    const result = {};
    for (const [pairId, pos] of this._positions) {
      if (pos.size > 0) {
        result[pairId] = { ...pos };
      }
    }
    return result;
  }

  async refreshBalances() {
    const now = Date.now();
    if (this._cachedBalances && now - this._balanceCacheTs < 2500) return this._cachedBalances;
    try {
      const addr = this._hlApi.getActiveAddress() || this._activeAddress;
      this._cachedBalances = await this._hlApi.getBalances(addr);
      this._balanceCacheTs = now;
    } catch (e) {
      console.error(`${this._logPrefix} Balance fetch error:`, e.message);
    }
    return this._cachedBalances;
  }

  canTrade(pairId, signal, pairConfig) {
    if (!this.isEnabled()) return { ok: false, reason: 'bot_disabled' };
    if (this.liquidationMode) return { ok: false, reason: 'liquidation_mode' };
    if (!this.isPairEnabled(pairId)) return { ok: false, reason: 'pair_disabled' };
    if (this.tiersEnabled) {
      const tierInfo = this._pairTierMarginPct[pairId];
      if (tierInfo && tierInfo.tier !== 'all-in') {
        const maxPct = tierInfo.marginPct || this.tierConfig.marginPct.prudent;
        const usedPct = this.getPairMarginUsedPct(pairId);
        if (usedPct >= maxPct) return { ok: false, reason: 'margin_pct_exceeded', detail: `${pairId} uses ${usedPct.toFixed(1)}% >= ${maxPct}%` };
      } else if (!tierInfo) {
        const fallbackPct = this.tierConfig.marginPct.prudent;
        const usedPct = this.getPairMarginUsedPct(pairId);
        if (usedPct >= fallbackPct) return { ok: false, reason: 'margin_pct_exceeded', detail: `${pairId} unknown tier, uses ${usedPct.toFixed(1)}% >= ${fallbackPct}%` };
      }
    }
    if (this.getTotalOpenPositions() >= this.maxGlobalPositions) return { ok: false, reason: 'max_positions_global' };

    if (signal && pairConfig) {
      const newCoinA = pairConfig.marketA;
      const newCoinB = pairConfig.marketB;

      if (this._closingCoins[newCoinA]) return { ok: false, reason: 'coin_closing', detail: `${newCoinA} close in progress` };
      if (this._closingCoins[newCoinB]) return { ok: false, reason: 'coin_closing', detail: `${newCoinB} close in progress` };
      if (this._isCoinCoolingDown(newCoinA)) {
        const remaining = Math.ceil((this._coinCooldownUntil[newCoinA] - Date.now()) / 1000);
        return { ok: false, reason: 'coin_cooldown', detail: `${newCoinA} cooldown (${remaining}s)` };
      }
      if (this._isCoinCoolingDown(newCoinB)) {
        const remaining = Math.ceil((this._coinCooldownUntil[newCoinB] - Date.now()) / 1000);
        return { ok: false, reason: 'coin_cooldown', detail: `${newCoinB} cooldown (${remaining}s)` };
      }
      const symA = this._extractSymbol(newCoinA);
      const symB = this._extractSymbol(newCoinB);
      if (this._isSymbolCoolingDown(symA)) {
        const remaining = Math.ceil((this._symbolCooldownUntil[symA] - Date.now()) / 1000);
        return { ok: false, reason: 'symbol_cooldown', detail: `${symA} cooldown (${remaining}s) after leg fail` };
      }
      if (symB !== symA && this._isSymbolCoolingDown(symB)) {
        const remaining = Math.ceil((this._symbolCooldownUntil[symB] - Date.now()) / 1000);
        return { ok: false, reason: 'symbol_cooldown', detail: `${symB} cooldown (${remaining}s) after leg fail` };
      }

      const existingPos = this._positions.get(pairId);
      if (existingPos && existingPos.size > 0 && existingPos.direction !== signal.direction) {
        return { ok: false, reason: 'direction_conflict', detail: `existing pos dir=${existingPos.direction}, signal dir=${signal.direction}` };
      }
    }

    return { ok: true };
  }

  _recordE2ELatency(signalTs, orderSentTs, fillTs, pairId) {
    const signalToOrder = orderSentTs - signalTs;
    const orderToFill = fillTs - orderSentTs;
    const total = fillTs - signalTs;
    const entry = { signalTs, signalToOrder, orderToFill, total, pairId, ts: Date.now() };
    this._e2eLatencyRing.push(entry);
    if (this._e2eLatencyRing.length > this._e2eLatencyRingMax) this._e2eLatencyRing.shift();
    return entry;
  }

  getE2ELatencyStats() {
    const ring = this._e2eLatencyRing;
    if (ring.length === 0) return { count: 0, last: null, avg: null, min: null, max: null, p50: null, p95: null, avgSignalToOrder: null, avgOrderToFill: null };
    const totals = ring.map(e => e.total).sort((a, b) => a - b);
    const n = totals.length;
    const sumTotal = totals.reduce((s, v) => s + v, 0);
    const sumS2O = ring.reduce((s, e) => s + e.signalToOrder, 0);
    const sumO2F = ring.reduce((s, e) => s + e.orderToFill, 0);
    return {
      count: n,
      last: ring[n - 1].total,
      lastDetail: ring[n - 1],
      avg: Math.round(sumTotal / n),
      min: totals[0],
      max: totals[n - 1],
      p50: totals[Math.min(Math.floor(n * 0.5), n - 1)],
      p95: totals[Math.min(Math.floor(n * 0.95), n - 1)],
      avgSignalToOrder: Math.round(sumS2O / n),
      avgOrderToFill: Math.round(sumO2F / n),
    };
  }

  _pushRealtimeEdge(pairId, direction, edgeBps) {
    const key = `${pairId}:d${direction}`;
    if (!this._realtimeEdgeRing[key]) this._realtimeEdgeRing[key] = [];
    const ring = this._realtimeEdgeRing[key];
    const now = Date.now();
    ring.push({ ts: now, edge: edgeBps });
    if (ring.length > 500) {
      const cutoff = now - this._realtimeRingMaxAge;
      this._realtimeEdgeRing[key] = ring.filter(e => e.ts > cutoff);
      if (this._realtimeEdgeRing[key].length > 500) {
        this._realtimeEdgeRing[key] = this._realtimeEdgeRing[key].slice(-500);
      }
    }
  }

  _getRealtimeFloor(pairId, direction) {
    const key = `${pairId}:d${direction}`;
    const ring = this._realtimeEdgeRing[key];
    if (!ring || ring.length === 0) return null;
    const cutoff = Date.now() - this._realtimeWindowMs;
    const recent = ring.filter(e => e.ts > cutoff);
    if (recent.length < 3) return null;
    const sum = recent.reduce((s, e) => s + e.edge, 0);
    return sum / recent.length;
  }

  async onSignal(pairId, signal, pairConfig) {
    if (!this.enabled || !this._initialized) return null;
    this._pushRealtimeEdge(pairId, signal.direction, signal.grossOpenEdgeBps);
    if (this.liquidationMode) {
      this._logActivity('reject', pairId, signal, 'LIQUIDATION_MODE');
      return null;
    }
    if (signal.status !== 'TRADEABLE' && signal.status !== 'Z_CANDIDATE') return null;
    signal._signalReceivedTs = Date.now();

    if (!this.enabledPairs[pairId]) return null;
    const cooldownUntil = this._pairErrorCooldown[pairId];
    if (cooldownUntil && Date.now() < cooldownUntil) return null;
    if (cooldownUntil) delete this._pairErrorCooldown[pairId];
    if (this.pendingOrders[pairId]) return null;
    if (!this._collateralOk) {
      this._logActivity('reject', pairId, signal, 'no_collateral');
      return null;
    }

    const deployerCheck = this._checkDeployerCollateral(pairConfig.marketA, pairConfig.marketB);
    if (!deployerCheck.ok) {
      this._logActivity('blocked', pairId, signal, deployerCheck.reason, deployerCheck.detail);
      return null;
    }

    if (this._isZScoreMode()) {
      const zCheck = this._checkZScoreEntry(signal, pairId);
      if (!zCheck.allowed) {
        this._logActivity('reject', pairId, signal, zCheck.reason, zCheck.detail);
        return null;
      }
    }

    console.log(`${this._logPrefix} SIGNAL ${pairId} dir=${signal.direction} Q=${signal.Q} edge=${signal.grossOpenEdgeBps.toFixed(2)}bps mode=${this.p50Mode}${signal.kalmanZ ? ` kZ=${signal.kalmanZ.toFixed(2)}` : ''} — checking canTrade...`);
    this.pendingOrders[pairId] = true;

    const check = this.canTrade(pairId, signal, pairConfig);
    if (!check.ok) {
      this._logActivity('blocked', pairId, signal, check.reason, check.detail);
      console.log(`${this._logPrefix} BLOCKED ${pairId}: ${check.reason} ${check.detail || ''}`);
      delete this.pendingOrders[pairId];
      return null;
    }

    const _frtA = this.getPairFeeRoundTripBps(pairId);
    this._logActivity('accepted', pairId, signal, 'executing', null, { motif: 'z_entry', feesEstimate: _frtA });
    try {
      const result = await this.executeEntry(pairId, signal, pairConfig);
      if (result && result.status === 'open') {
        this._logActivity('filled', pairId, signal, 'trade_executed', `legA=${result.statusA?.status} legB=${result.statusB?.status} ${result.execMs}ms sz=${result.fillSize}`, { latencyMs: result.execMs, motif: 'z_entry', feesEstimate: _frtA });
        this._emitEvent('ENTRY_FILLED', { pairId, direction: signal.direction, edgeBps: signal.grossOpenEdgeBps, execMs: result.execMs, fillSize: result.fillSize });
      } else {
        this._logActivity('failed', pairId, signal, 'trade_failed', result?.error, { latencyMs: result?.execMs, motif: 'z_entry', feesEstimate: _frtA });
        this._emitEvent('ENTRY_FAILED', { pairId, direction: signal.direction, error: result?.error, execMs: result?.execMs });
      }
      return result;
    } catch (err) {
      this._logActivity('error', pairId, signal, 'exception', err.message);
      throw err;
    } finally {
      delete this.pendingOrders[pairId];
    }
  }

  async executeEntry(pairId, signal, pairConfig) {
    const legACoin = pairConfig.marketA;
    const legBCoin = pairConfig.marketB;
    const legABuy = signal.direction === 1;

    if (this._orphanOnChainSeen?.[legACoin] || this._orphanOnChainSeen?.[legBCoin]) {
      const orphanCoin = this._orphanOnChainSeen[legACoin] ? legACoin : legBCoin;
      console.warn(`${this._logPrefix} BLOCKED ENTRY ${pairId}: orphan position pending for ${orphanCoin}`);
      return { status: 'blocked', error: 'orphan_pending' };
    }

    const liveBookA = signal._liveBookA;
    const liveBookB = signal._liveBookB;
    if (!liveBookA || !liveBookB) {
      return { status: 'error', error: 'no_book_data' };
    }

    const asksA = liveBookA.asks;
    const bidsA = liveBookA.bids;
    const asksB = liveBookB.asks;
    const bidsB = liveBookB.bids;

    const topSideA = legABuy ? asksA : bidsA;
    const topSideB = !legABuy ? asksB : bidsB;

    if (!topSideA?.[0] || !topSideB?.[0]) {
      return { status: 'error', error: 'empty_book' };
    }

    const topSzA = parseFloat(topSideA[0].sz) || 0;
    const topSzB = parseFloat(topSideB[0].sz) || 0;
    const topPxA = parseFloat(topSideA[0].px) || 0;
    const topPxB = parseFloat(topSideB[0].px) || 0;

    if (topSzA <= 0 || topSzB <= 0 || topPxA <= 0 || topPxB <= 0) {
      return { status: 'error', error: 'invalid_book_top' };
    }

    let rawSize = Math.min(topSzA, topSzB);
    let roundedSize = Math.min(this._hlApi.roundSize(legACoin, rawSize), this._hlApi.roundSize(legBCoin, rawSize));

    const avgPrice = (topPxA + topPxB) / 2;
    const notionalUsd = roundedSize * avgPrice;

    if (notionalUsd < 10) {
      return { status: 'error', error: 'below_min_notional', detail: `$${notionalUsd.toFixed(2)} < $10` };
    }

    const existingPos = this._positions.get(pairId);
    const currentNotional = existingPos ? existingPos.size * ((existingPos.vwapA + existingPos.vwapB) / 2) : 0;
    const maxAllowedNotional = this.maxPositionUsd - currentNotional;
    if (maxAllowedNotional <= 10) {
      return { status: 'blocked', error: 'max_position_reached', detail: `current=$${currentNotional.toFixed(0)} max=$${this.maxPositionUsd}` };
    }
    if (notionalUsd > maxAllowedNotional) {
      roundedSize = Math.min(this._hlApi.roundSize(legACoin, maxAllowedNotional / avgPrice), this._hlApi.roundSize(legBCoin, maxAllowedNotional / avgPrice));
      if (roundedSize <= 0 || roundedSize * avgPrice < 10) {
        return { status: 'blocked', error: 'max_position_cap', detail: `capped to $${maxAllowedNotional.toFixed(0)} — too small` };
      }
    }

    this._ensureLeverageBg(legACoin);
    this._ensureLeverageBg(legBCoin);

    const slippagePct = this._maxSlippageBps / 10000;
    const limitPxA = this._hlApi.roundPrice(legACoin, topPxA * (legABuy ? 1 + slippagePct : 1 - slippagePct));
    const limitPxB = this._hlApi.roundPrice(legBCoin, topPxB * (!legABuy ? 1 + slippagePct : 1 - slippagePct));
    const t0 = Date.now();

    console.log(`${this._logPrefix} ENTRY ${pairId} dir=${signal.direction} edge=${signal.grossOpenEdgeBps.toFixed(2)}bps topLiq=${rawSize.toFixed(4)} sz=${roundedSize} $${(roundedSize * avgPrice).toFixed(0)} | A:${legABuy?'BUY':'SELL'} ${roundedSize}@${limitPxA} B:${!legABuy?'BUY':'SELL'} ${roundedSize}@${limitPxB}`);

    try {
      const bulkResults = await this._hlApi.placeBulkOrderNative([
        { coin: legACoin, isBuy: legABuy, sz: roundedSize, limitPx: limitPxA, reduceOnly: false },
        { coin: legBCoin, isBuy: !legABuy, sz: roundedSize, limitPx: limitPxB, reduceOnly: false },
      ]);
      let statusA = bulkResults[0] || { status: 'sdk_error', oid: null, fillPx: null, error: 'no_result' };
      let statusB = bulkResults[1] || { status: 'sdk_error', oid: null, fillPx: null, error: 'no_result' };
      const execMs = Date.now() - t0;
      console.log(`${this._logPrefix} BULK-ENTRY ${pairId} 2 legs in ${execMs}ms | A: ${statusA.status} @ ${statusA.fillPx} | B: ${statusB.status} @ ${statusB.fillPx}`);

      const aFilled = statusA.status === 'filled';
      const bFilled = statusB.status === 'filled';

      if (!aFilled && !bFilled) {
        const bothUnknown = ['unknown', 'parse_error'].includes(statusA.status) && ['unknown', 'parse_error'].includes(statusB.status);
        if (bothUnknown) {
          const recovered = await this._verifyOnChain(legACoin, legBCoin, legABuy, roundedSize, topPxA, topPxB, statusA, statusB);
          if (!recovered) {
            console.warn(`${this._logPrefix} Both unknown — not recovered after 4s.`);
            this._trackCoinFail(legACoin);
            this.stats.totalFailed++;
            return { status: 'error', error: 'both_unknown' };
          }
          roundedSize = Math.min(statusA.fillSz || roundedSize, statusB.fillSz || roundedSize);
        } else {
          const isApiError = statusA.status === 'api_error' || statusB.status === 'api_error';
          this.stats.totalFailed++;
          if (isApiError) {
            this._pairErrorCooldown[pairId] = Date.now() + 15000;
          }
          return { status: 'error', error: 'both_failed' };
        }
      }

      if (!(statusA.status === 'filled' && statusB.status === 'filled')) {
        const filledLeg = statusA.status === 'filled' ? 'A' : 'B';
        const failedCoin = statusA.status === 'filled' ? legBCoin : legACoin;
        const failedError = (statusA.status === 'filled' ? statusB : statusA).error || 'unknown';
        console.warn(`${this._logPrefix} Leg ${filledLeg === 'A' ? 'B' : 'A'} (${failedCoin}) FAILED: ${failedError} — waiting 4s to verify on-chain...`);

        const recovered = await this._verifyOnChain(legACoin, legBCoin, legABuy, roundedSize, topPxA, topPxB, statusA, statusB);
        if (recovered) {
          roundedSize = Math.min(statusA.fillSz || roundedSize, statusB.fillSz || roundedSize);
        } else {
          const filledCoin = filledLeg === 'A' ? legACoin : legBCoin;
          const filledIsBuy = filledLeg === 'A' ? legABuy : !legABuy;
          const filledPx = filledLeg === 'A' ? (statusA.fillPx || topPxA) : (statusB.fillPx || topPxB);
          const unwindSlips = [0.003, 0.0075, 0.015];
          let unwindSuccess = false;
          for (const slip of unwindSlips) {
            const unwindPx = this._hlApi.roundPrice(filledCoin, filledPx * (filledIsBuy ? 1 - slip : 1 + slip));
            try {
              const unwindResult = await this._hlApi.placeOrderRaw(filledCoin, !filledIsBuy, roundedSize, unwindPx);
              const unwindParsed = this.parseOrderResult(unwindResult);
              if (unwindParsed.status === 'filled') {
                console.log(`${this._logPrefix} ORPHAN UNWIND SUCCESS: ${filledCoin} closed @ ${unwindParsed.fillPx} (${(slip*10000).toFixed(0)}bps)`);
                if (!this.stats.orphanUnwinds) this.stats.orphanUnwinds = 0;
                this.stats.orphanUnwinds++;
                unwindSuccess = true;
                break;
              }
            } catch (unwindErr) {
              console.error(`${this._logPrefix} ORPHAN UNWIND error ${(slip*10000).toFixed(0)}bps: ${filledCoin} — ${unwindErr.message}`);
            }
          }
          if (!unwindSuccess) {
            console.error(`${this._logPrefix} ORPHAN UNWIND FAILED after 3 retries: ${filledCoin}`);
            if (!this._orphanOnChainSeen) this._orphanOnChainSeen = {};
            this._orphanOnChainSeen[filledCoin] = Date.now();
            this._persistOrphanSeen();
            this._sendAlert('orphan_unwind_fail', `Entry orphan unwind failed for ${filledCoin} sz=${roundedSize} on ${pairId}`);
          }
          this._trackCoinFail(failedCoin);
          this._trackLegFailure(pairId, signal, failedCoin, failedError);
          this.stats.totalFailed++;
          return { status: 'error', error: `orphan_unwound` };
        }
      }

      this._resetLegFailure(pairId);

      const fillPxA = statusA.fillPx || topPxA;
      const fillPxB = statusB.fillPx || topPxB;

      const actualFillSzA = statusA.fillSz && statusA.fillSz > 0 ? statusA.fillSz : roundedSize;
      const actualFillSzB = statusB.fillSz && statusB.fillSz > 0 ? statusB.fillSz : roundedSize;
      let fillSz = Math.min(actualFillSzA, actualFillSzB);

      if (Math.abs(actualFillSzA - actualFillSzB) / Math.max(actualFillSzA, actualFillSzB) > 0.01) {
        const excessLeg = actualFillSzA > actualFillSzB ? 'A' : 'B';
        const excessCoin = excessLeg === 'A' ? legACoin : legBCoin;
        const excessIsBuy = excessLeg === 'A' ? legABuy : !legABuy;
        const excessSz = this._hlApi.roundSize(excessCoin, Math.abs(actualFillSzA - actualFillSzB));
        console.warn(`${this._logPrefix} PARTIAL-FILL-IMBALANCE ${pairId}: A=${actualFillSzA} B=${actualFillSzB} — unwinding ${excessSz} on ${excessCoin}`);
        if (excessSz > 0) {
          try {
            const unwindPx = this._hlApi.roundPrice(excessCoin, (excessLeg === 'A' ? fillPxA : fillPxB) * (excessIsBuy ? 0.997 : 1.003));
            const unwindResult = await this._hlApi.placeOrderRaw(excessCoin, !excessIsBuy, excessSz, unwindPx);
            const unwindParsed = this.parseOrderResult(unwindResult);
            if (unwindParsed.status === 'filled') {
              console.log(`${this._logPrefix} EXCESS-UNWIND SUCCESS: ${excessCoin} ${excessSz} @ ${unwindParsed.fillPx}`);
            } else {
              console.error(`${this._logPrefix} EXCESS-UNWIND MISSED: ${excessCoin} ${excessSz} — tracking as orphan`);
              if (!this._orphanOnChainSeen) this._orphanOnChainSeen = {};
              this._orphanOnChainSeen[excessCoin] = Date.now();
              this._persistOrphanSeen();
            }
          } catch (unwindErr) {
            console.error(`${this._logPrefix} EXCESS-UNWIND ERROR: ${excessCoin} — ${unwindErr.message}`);
          }
        }
      }

      if (fillSz !== roundedSize) {
        console.log(`${this._logPrefix} FILL-SIZE-ADJUSTED ${pairId}: requested=${roundedSize} actualA=${actualFillSzA} actualB=${actualFillSzB} effective=${fillSz}`);
      }

      const entrySlippage = this.computeEntrySlippage(signal, statusA, statusB, legABuy);
      if (entrySlippage > this._maxSlippageBps) {
        console.warn(`${this._logPrefix} SLIPPAGE WARNING ${pairId}: ${entrySlippage.toFixed(2)}bps > max ${this._maxSlippageBps}bps`);
      }

      const pairFees = this._getPairTakerFees(pairId);
      const entryFeesUsd = (fillPxA * fillSz * pairFees.feeA) + (fillPxB * fillSz * pairFees.feeB);

      const pos = this._positions.get(pairId);
      const oldSize = pos ? pos.size : 0;
      const newSize = oldSize + fillSz;

      let newVwapA, newVwapB, newAvgSlip;
      if (oldSize > 0 && pos) {
        newVwapA = (oldSize * pos.vwapA + fillSz * fillPxA) / newSize;
        newVwapB = (oldSize * pos.vwapB + fillSz * fillPxB) / newSize;
        newAvgSlip = (oldSize * pos.avgSlipBps + fillSz * entrySlippage) / newSize;
      } else {
        newVwapA = fillPxA;
        newVwapB = fillPxB;
        newAvgSlip = entrySlippage;
      }

      const now = Date.now();
      const fillNotional = fillSz * (fillPxA + fillPxB) / 2;
      const totalFills = (pos ? pos.totalFills : 0) + 1;
      const totalNotional = (pos ? pos.totalNotionalUsd : 0) + fillNotional;
      const realizedPnl = pos ? pos.realizedPnlUsd : 0;
      const totalFees = (pos ? pos.feesUsd : 0) + entryFeesUsd;
      const openedAt = pos ? pos.openedAt : now;

      let posId;
      try {
        const upsertRes = await pool.query(
          `INSERT INTO positions (pair_id, bot_id, direction, leg_a_coin, leg_b_coin, size, vwap_entry_a, vwap_entry_b, avg_slippage_bps, total_fills, total_notional_usd, realized_pnl_usd, fees_usd, opened_at, updated_at, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'open')
           ON CONFLICT (pair_id, bot_id) DO UPDATE SET
             direction = $3, size = $6, vwap_entry_a = $7, vwap_entry_b = $8,
             avg_slippage_bps = $9, total_fills = $10, total_notional_usd = $11,
             fees_usd = $13, updated_at = $15, status = 'open'
           RETURNING id`,
          [pairId, this._botId, signal.direction, legACoin, legBCoin,
           newSize, newVwapA, newVwapB, newAvgSlip, totalFills, totalNotional,
           realizedPnl, totalFees, openedAt, now]
        );
        posId = upsertRes.rows[0].id;
      } catch (dbErr) {
        console.error(`${this._logPrefix} Position upsert error for ${pairId}:`, dbErr.message);
        posId = pos?.id || null;
      }

      try {
        await pool.query(
          `INSERT INTO position_fills (position_id, pair_id, bot_id, fill_type, direction, size, price_a, price_b, edge_bps, slippage_bps, pnl_usd, fees_usd, ts)
           VALUES ($1,$2,$3,'entry',$4,$5,$6,$7,$8,$9,0,$10,$11)`,
          [posId, pairId, this._botId, signal.direction, fillSz, fillPxA, fillPxB,
           signal.grossOpenEdgeBps, entrySlippage, entryFeesUsd, now]
        );
      } catch (dbErr) {
        console.error(`${this._logPrefix} Position fill insert error for ${pairId}:`, dbErr.message);
      }

      this._positions.set(pairId, {
        id: posId,
        pairId,
        direction: signal.direction,
        legACoin,
        legBCoin,
        size: newSize,
        vwapA: newVwapA,
        vwapB: newVwapB,
        avgSlipBps: newAvgSlip,
        totalFills,
        totalNotionalUsd: totalNotional,
        realizedPnlUsd: realizedPnl,
        feesUsd: totalFees,
        openedAt,
        updatedAt: now,
        status: 'open',
      });

      this.stats.totalFilled++;
      this.stats.totalExecuted++;
      this._execTimeRing.push(execMs);
      if (this._execTimeRing.length > this._execTimeRingMax) this._execTimeRing.shift();

      this._recentlyTradedCoins[legACoin] = Date.now();
      this._recentlyTradedCoins[legBCoin] = Date.now();

      const fillTs = Date.now();
      const signalTs = signal._signalReceivedTs || signal.ts || t0;
      const e2e = this._recordE2ELatency(signalTs, t0, fillTs, pairId);
      const feesRT = this.getPairFeeRoundTripBps(pairId);
      console.log(`${this._logPrefix} FILLED ${pairId} in ${execMs}ms | E2E: total=${e2e.total}ms | A:${fillPxA} B:${fillPxB} | slip:${entrySlippage.toFixed(2)}bps | sz=${fillSz} pos_sz=${newSize.toFixed(4)} vwapA=${newVwapA.toFixed(6)} vwapB=${newVwapB.toFixed(6)} | feesRT=${feesRT.toFixed(1)}bps`);

      this._refreshCollateralNow();

      return { status: 'open', statusA, statusB, execMs, fillSize: fillSz, positionSize: newSize };

    } catch (err) {
      console.error(`${this._logPrefix} ${pairId} ERROR (${Date.now() - t0}ms):`, err.message, err.stack);
      this.stats.totalFailed++;
      return { status: 'error', error: err.message };
    }
  }

  async _verifyOnChain(legACoin, legBCoin, legABuy, roundedSize, legABestPx, legBBestPx, statusA, statusB) {
    await new Promise(r => setTimeout(r, 4000));
    try {
      const positions = await this._hlApi.getDeployerPositions(this._hlApi.getActiveAddress() || this._activeAddress, this._dexFilter);
      const failedDexes = positions._failedDexes || new Set();
      const dexA = legACoin.split(':')[0];
      const dexB = legBCoin.split(':')[0];
      if (failedDexes.has(dexA) || failedDexes.has(dexB)) {
        console.warn(`${this._logPrefix} ON-CHAIN CHECK @4s: API unreliable (${[...failedDexes].join(', ')}) — cannot verify`);
        return false;
      }
      const posA = positions[legACoin];
      const posB = positions[legBCoin];
      const onA = posA && Math.abs(posA.size) >= roundedSize * 0.5;
      const onB = posB && Math.abs(posB.size) >= roundedSize * 0.5;
      console.log(`${this._logPrefix} ON-CHAIN CHECK @4s: ${legACoin}=${onA ? posA.size : 'none'} ${legBCoin}=${onB ? posB.size : 'none'}`);
      if (onA && onB) {
        console.warn(`${this._logPrefix} RECOVERED @4s: BOTH legs on-chain!`);
        statusA.status = 'filled'; statusA.fillPx = parseFloat(posA.entryPx || legABestPx); statusA.fillSz = Math.min(Math.abs(posA.size), roundedSize);
        statusB.status = 'filled'; statusB.fillPx = parseFloat(posB.entryPx || legBBestPx); statusB.fillSz = Math.min(Math.abs(posB.size), roundedSize);
        return true;
      }
      return false;
    } catch (e) {
      console.error(`${this._logPrefix} On-chain verify error: ${e.message}`);
      return false;
    }
  }

  computeSpreadPnlBps(pos, midA, midB) {
    if (!pos || pos.size <= 0 || !pos.vwapA || !pos.vwapB || !midA || !midB) return null;
    const legABuy = pos.direction === 1;
    let pnlUsd;
    if (legABuy) {
      pnlUsd = (midA - pos.vwapA) * pos.size + (pos.vwapB - midB) * pos.size;
    } else {
      pnlUsd = (pos.vwapA - midA) * pos.size + (midB - pos.vwapB) * pos.size;
    }
    const entryNotional = pos.vwapA * pos.size + pos.vwapB * pos.size;
    if (entryNotional <= 0) return null;
    return (pnlUsd / entryNotional) * 10000;
  }

  computeSpreadPnlUsd(pos, midA, midB) {
    if (!pos || pos.size <= 0 || !pos.vwapA || !pos.vwapB || !midA || !midB) return 0;
    const legABuy = pos.direction === 1;
    if (legABuy) {
      return (midA - pos.vwapA) * pos.size + (pos.vwapB - midB) * pos.size;
    } else {
      return (pos.vwapA - midA) * pos.size + (midB - pos.vwapB) * pos.size;
    }
  }

  _startPositionCloseLoop() {
    setTimeout(() => {
      this._posCloseInterval = setInterval(() => {
        if (!this._initialized) return;
        if (!this.enabled && this._positions.size === 0) return;
      }, 1000);
    }, 5000 + this._staggerMs);
  }

  checkAndClosePositions(pairId, dirEdges, closeThresholdBps, pairConfig, bookMids, books) {
    if (!this._initialized) return;
    const pos = this._positions.get(pairId);
    if (!pos || pos.size <= 0) return;
    if (this._closingPositions.has(pairId)) return;

    const midA = bookMids?.midA || 0;
    const midB = bookMids?.midB || 0;
    if (!midA || !midB) return;
    if (midA && !isNaN(midA) && pos.legACoin) this._lastKnownMids[pos.legACoin] = midA;
    if (midB && !isNaN(midB) && pos.legBCoin) this._lastKnownMids[pos.legBCoin] = midB;

    const holdTime = Date.now() - pos.openedAt;
    if (holdTime < (this.minHoldMs || 3000)) return;

    const spreadPnlBps = this.computeSpreadPnlBps(pos, midA, midB);
    if (spreadPnlBps === null) return;

    const feesRT = this.getPairFeeRoundTripBps(pairId);
    const closeThreshold = feesRT + this.closeBufferBps;

    if (holdTime > 5000 && holdTime % 10000 < 300) {
      console.log(`${this._logPrefix} MONITOR ${pairId} d${pos.direction} | spread=${spreadPnlBps.toFixed(2)}bps target=${closeThreshold.toFixed(1)}bps | sz=${pos.size.toFixed(4)} fills=${pos.totalFills} | held ${(holdTime/1000).toFixed(0)}s`);
    }

    if (spreadPnlBps >= closeThreshold) {
      const bookA = books?.bookA;
      const bookB = books?.bookB;
      if (!bookA || !bookB) return;
      console.log(`${this._logPrefix} CLOSE-TRIGGER ${pairId} — spread ${spreadPnlBps.toFixed(2)}bps >= threshold ${closeThreshold.toFixed(1)}bps (fees=${feesRT.toFixed(1)} + buf=${this.closeBufferBps})`);
      this._executePositionClose(pairId, pos, books, 'target_close', spreadPnlBps).catch(e => {
        console.error(`${this._logPrefix} Close error ${pairId}:`, e.message);
      });
      return;
    }

    if (this.maxLossBps > 0 && spreadPnlBps <= -this.maxLossBps) {
      console.error(`${this._logPrefix} MAX-LOSS ${pairId} | ${spreadPnlBps.toFixed(2)}bps <= -${this.maxLossBps}bps, force closing`);
      this._logActivity('margin_fail', pairId, null, 'max_loss',
        `Position ${pairId}: PnL ${spreadPnlBps.toFixed(2)}bps <= -${this.maxLossBps}bps — force close`);
      this._executePositionClose(pairId, pos, books, 'max_loss', spreadPnlBps).catch(e => {
        console.error(`${this._logPrefix} Max-loss close error ${pairId}:`, e.message);
      });
      return;
    }

    if (this.stopLossBps > 0 && spreadPnlBps <= -this.stopLossBps) {
      console.error(`${this._logPrefix} STOP-LOSS ${pairId} | ${spreadPnlBps.toFixed(2)}bps <= -${this.stopLossBps}bps`);
      this._executePositionClose(pairId, pos, books, 'stop_loss', spreadPnlBps).catch(e => {
        console.error(`${this._logPrefix} Stop-loss close error ${pairId}:`, e.message);
      });
      return;
    }
  }

  async _executePositionClose(pairId, pos, books, reason, spreadPnlBps) {
    if (this._closingPositions.has(pairId)) return;
    this._closingPositions.add(pairId);

    const coinA = pos.legACoin;
    const coinB = pos.legBCoin;
    this._closingCoins[coinA] = true;
    this._closingCoins[coinB] = true;

    const t0close = Date.now();

    try {
      const legABuy = pos.direction === 1;
      const closeAisBuy = !legABuy;
      const closeBisBuy = legABuy;

      const bookA = books?.bookA;
      const bookB = books?.bookB;
      const sideA = closeAisBuy ? bookA?.asks : bookA?.bids;
      const sideB = closeBisBuy ? bookB?.asks : bookB?.bids;

      if (!sideA?.[0] || !sideB?.[0]) {
        console.log(`${this._logPrefix} Close ${pairId} — no book data, retry next tick`);
        return;
      }

      const basePxA = parseFloat(sideA[0].px);
      const basePxB = parseFloat(sideB[0].px);
      const topLiqA = parseFloat(sideA[0].sz) || 0;
      const topLiqB = parseFloat(sideB[0].sz) || 0;

      let closeSize = Math.min(pos.size, topLiqA, topLiqB);
      closeSize = Math.min(this._hlApi.roundSize(coinA, closeSize), this._hlApi.roundSize(coinB, closeSize));
      if (closeSize <= 0) {
        console.log(`${this._logPrefix} Close ${pairId} — closeSize rounds to 0, retry next tick`);
        return;
      }

      const isPartial = closeSize < pos.size * 0.999;
      const slippagePct = this._maxSlippageBps / 10000;
      const closeLimitPxA = this._hlApi.roundPrice(coinA, basePxA * (closeAisBuy ? 1 + slippagePct : 1 - slippagePct));
      const closeLimitPxB = this._hlApi.roundPrice(coinB, basePxB * (closeBisBuy ? 1 + slippagePct : 1 - slippagePct));

      console.log(`${this._logPrefix} CLOSE ${pairId} (${reason}${isPartial ? ' PARTIAL' : ''}) sz=${closeSize}/${pos.size.toFixed(4)} | A ${closeAisBuy?'BUY':'SELL'}@${closeLimitPxA} B ${closeBisBuy?'BUY':'SELL'}@${closeLimitPxB}`);

      let statusA, statusB;
      try {
        const bulkResults = await this._hlApi.placeBulkOrderNative([
          { coin: coinA, isBuy: closeAisBuy, sz: closeSize, limitPx: closeLimitPxA, reduceOnly: true },
          { coin: coinB, isBuy: closeBisBuy, sz: closeSize, limitPx: closeLimitPxB, reduceOnly: true },
        ]);
        statusA = bulkResults[0] || { status: 'sdk_error', fillPx: null };
        statusB = bulkResults[1] || { status: 'sdk_error', fillPx: null };
        console.log(`${this._logPrefix} BULK-CLOSE ${pairId} | A: ${statusA.status} @ ${statusA.fillPx} | B: ${statusB.status} @ ${statusB.fillPx}`);
      } catch (e) {
        console.error(`${this._logPrefix} Close FAILED ${pairId} (${reason}):`, e.message);
        return;
      }

      if (statusA.status !== 'filled' || statusB.status !== 'filled') {
        if (statusA.status !== 'filled' && statusB.status !== 'filled') {
          console.log(`${this._logPrefix} Close ${pairId} both legs missed — retry next tick`);
          return;
        }
        const failedIsA = statusA.status !== 'filled';
        const fbCoin = failedIsA ? coinA : coinB;
        const fbIsBuy = failedIsA ? closeAisBuy : closeBisBuy;
        const fbSz = closeSize;
        const fbBasePx = failedIsA ? basePxA : basePxB;
        const slippageLevels = [0.003, 0.0075, 0.015];
        let fallbackFilled = false;
        for (const slip of slippageLevels) {
          try {
            const fbPx = this._hlApi.roundPrice(fbCoin, fbBasePx * (fbIsBuy ? 1 + slip : 1 - slip));
            const fallback = await this._hlApi.placeOrderRaw(fbCoin, fbIsBuy, fbSz, fbPx);
            const fbParsed = this.parseOrderResult(fallback);
            if (fbParsed.status === 'filled') {
              if (failedIsA) statusA = fbParsed; else statusB = fbParsed;
              fallbackFilled = true;
              console.log(`${this._logPrefix} Close fallback SUCCESS ${pairId} ${fbCoin} @ ${fbParsed.fillPx}`);
              break;
            }
          } catch (fbErr) {
            console.error(`${this._logPrefix} Close fallback error ${fbCoin}: ${fbErr.message}`);
          }
        }
        if (!fallbackFilled) {
          console.error(`${this._logPrefix} Close fallback FAILED ${pairId} — orphan leg tracked`);
          if (!this._orphanOnChainSeen) this._orphanOnChainSeen = {};
          this._orphanOnChainSeen[fbCoin] = Date.now();
          this._persistOrphanSeen();
          this._sendAlert('close_fallback_fail', `Close fallback failed for ${fbCoin} on ${pairId}`);
          return;
        }
      }

      const exitA = statusA.fillPx;
      const exitB = statusB.fillPx;

      const closeFillSzA = statusA.fillSz && statusA.fillSz > 0 ? statusA.fillSz : closeSize;
      const closeFillSzB = statusB.fillSz && statusB.fillSz > 0 ? statusB.fillSz : closeSize;
      const effectiveCloseSize = Math.min(closeFillSzA, closeFillSzB);

      if (Math.abs(closeFillSzA - closeFillSzB) / Math.max(closeFillSzA, closeFillSzB) > 0.01) {
        const excessLeg = closeFillSzA > closeFillSzB ? 'A' : 'B';
        const excessCoin = excessLeg === 'A' ? coinA : coinB;
        const excessIsBuy = excessLeg === 'A' ? closeAisBuy : closeBisBuy;
        const excessSz = this._hlApi.roundSize(excessCoin, Math.abs(closeFillSzA - closeFillSzB));
        console.warn(`${this._logPrefix} CLOSE-PARTIAL-IMBALANCE ${pairId}: A=${closeFillSzA} B=${closeFillSzB} — re-opening ${excessSz} on ${excessCoin}`);
        if (excessSz > 0) {
          try {
            const reopenPx = this._hlApi.roundPrice(excessCoin, (excessLeg === 'A' ? exitA : exitB) * (excessIsBuy ? 0.997 : 1.003));
            const reopenResult = await this._hlApi.placeOrderRaw(excessCoin, !excessIsBuy, excessSz, reopenPx);
            const reopenParsed = this.parseOrderResult(reopenResult);
            if (reopenParsed.status === 'filled') {
              console.log(`${this._logPrefix} CLOSE-EXCESS-REBALANCE SUCCESS: ${excessCoin} ${excessSz} @ ${reopenParsed.fillPx}`);
            } else {
              console.error(`${this._logPrefix} CLOSE-EXCESS-REBALANCE MISSED: ${excessCoin} ${excessSz} — tracking as orphan`);
              if (!this._orphanOnChainSeen) this._orphanOnChainSeen = {};
              this._orphanOnChainSeen[excessCoin] = Date.now();
              this._persistOrphanSeen();
            }
          } catch (rebalErr) {
            console.error(`${this._logPrefix} CLOSE-EXCESS-REBALANCE ERROR: ${excessCoin} — ${rebalErr.message}`);
          }
        }
      }

      if (effectiveCloseSize !== closeSize) {
        console.log(`${this._logPrefix} CLOSE-SIZE-ADJUSTED ${pairId}: requested=${closeSize} actualA=${closeFillSzA} actualB=${closeFillSzB} effective=${effectiveCloseSize}`);
        closeSize = effectiveCloseSize;
      }

      let closePnlUsd;
      if (pos.direction === 1) {
        closePnlUsd = (exitA - pos.vwapA) * closeSize + (pos.vwapB - exitB) * closeSize;
      } else {
        closePnlUsd = (pos.vwapA - exitA) * closeSize + (exitB - pos.vwapB) * closeSize;
      }

      const pairFees = this._getPairTakerFees(pairId);
      const closeFeesUsd = (exitA * closeSize * pairFees.feeA) + (exitB * closeSize * pairFees.feeB);
      const entryFeesUsd = (pos.vwapA * closeSize * pairFees.feeA) + (pos.vwapB * closeSize * pairFees.feeB);
      const totalFeesThisClose = closeFeesUsd + entryFeesUsd;
      const netPnlUsd = closePnlUsd - totalFeesThisClose;
      const entryNotional = pos.vwapA * closeSize + pos.vwapB * closeSize;
      const grossPnlBps = entryNotional > 0 ? (closePnlUsd / entryNotional) * 10000 : 0;
      const feeBps = entryNotional > 0 ? (totalFeesThisClose / entryNotional) * 10000 : 0;
      const netPnlBps = grossPnlBps - feeBps;

      const remainingSize = pos.size - closeSize;
      const closeLatencyMs = Date.now() - t0close;
      const now = Date.now();

      const fillType = remainingSize < pos.size * 0.001 ? 'full_close' : 'partial_close';
      const newStatus = remainingSize < pos.size * 0.001 ? 'flat' : 'open';
      const newRealizedPnl = pos.realizedPnlUsd + netPnlUsd;
      const newFees = pos.feesUsd + totalFeesThisClose;

      try {
        if (newStatus === 'flat') {
          await pool.query(
            `UPDATE positions SET size = 0, realized_pnl_usd = $1, fees_usd = $2, updated_at = $3, status = 'flat' WHERE id = $4`,
            [newRealizedPnl, newFees, now, pos.id]
          );
        } else {
          await pool.query(
            `UPDATE positions SET size = $1, realized_pnl_usd = $2, fees_usd = $3, updated_at = $4 WHERE id = $5`,
            [remainingSize, newRealizedPnl, newFees, now, pos.id]
          );
        }
      } catch (dbErr) {
        console.error(`${this._logPrefix} Position close DB error ${pairId}:`, dbErr.message);
      }

      try {
        await pool.query(
          `INSERT INTO position_fills (position_id, pair_id, bot_id, fill_type, direction, size, price_a, price_b, edge_bps, slippage_bps, pnl_usd, fees_usd, ts)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,$10,$11,$12)`,
          [pos.id, pairId, this._botId, fillType, pos.direction, closeSize, exitA, exitB,
           grossPnlBps, netPnlUsd, totalFeesThisClose, now]
        );
      } catch (dbErr) {
        console.error(`${this._logPrefix} Close fill insert error ${pairId}:`, dbErr.message);
      }

      if (newStatus === 'flat') {
        this._positions.delete(pairId);
      } else {
        pos.size = remainingSize;
        pos.realizedPnlUsd = newRealizedPnl;
        pos.feesUsd = newFees;
        pos.updatedAt = now;
      }

      this.stats.totalPnlUsd += netPnlUsd;
      this._recordCloseLatency(closeLatencyMs, pairId);
      this._refreshCollateralNow();

      const closeType = netPnlUsd > 0 ? 'win' : 'loss';
      console.log(`${this._logPrefix} ${fillType === 'full_close' ? 'CLOSED' : 'PARTIAL-CLOSED'} ${pairId} (${reason}) latency=${closeLatencyMs}ms | sz=${closeSize}/${(closeSize + remainingSize).toFixed(4)} | gross: ${grossPnlBps.toFixed(2)}bps net: ${netPnlBps.toFixed(2)}bps ($${netPnlUsd.toFixed(4)})`);
      this._logActivity(closeType, pairId, { direction: pos.direction, grossPnlBps, feeBps, netPnlBps, closeLatencyMs }, reason,
        `${fillType} gross:${grossPnlBps >= 0 ? '+' : ''}${grossPnlBps.toFixed(2)}bps net:${netPnlBps >= 0 ? '+' : ''}${netPnlBps.toFixed(2)}bps ($${netPnlUsd >= 0 ? '+' : ''}${netPnlUsd.toFixed(4)}) latency=${closeLatencyMs}ms`);
      this._emitEvent('CLOSE_FILLED', { pairId, direction: pos.direction, reason, netPnlBps, netPnlUsd, closeLatencyMs, closeType, fillType });

    } finally {
      this._closingPositions.delete(pairId);
      delete this._closingCoins[coinA];
      delete this._closingCoins[coinB];
    }
  }

  registerPairGrowthModes(pairId, growthA, growthB) {
    this._pairGrowthModes[pairId] = { a: growthA, b: growthB };
  }

  getPairFeeRoundTripBps(pairId) {
    const { feeA, feeB } = this._getPairTakerFees(pairId);
    return Math.round(2 * (feeA + feeB) * 10000 * 100) / 100;
  }

  getPairObjectifBps(pairId) {
    return Math.round((this.getPairFeeRoundTripBps(pairId) + this.marginBps) * 100) / 100;
  }

  getPairCostsBps(pairId) {
    return this.getPairObjectifBps(pairId);
  }

  _getPairTakerFees(pairId) {
    const gm = this._pairGrowthModes[pairId];
    if (!gm) {
      return { feeA: this._takerFeeGrowth, feeB: this._takerFeeGrowth };
    }
    return {
      feeA: gm.a ? this._takerFeeGrowth : this._takerFeeNoGrowth,
      feeB: gm.b ? this._takerFeeGrowth : this._takerFeeNoGrowth,
    };
  }

  async _refreshFeeRates() {
    try {
      const addr = await this._hlApi.getWalletAddress();
      if (!addr) return;
      const feeData = await hlApiModule.getUserFees(addr);
      if (!feeData) return;
      let crossRate = null;
      if (feeData.userCrossRate !== undefined) {
        crossRate = parseFloat(feeData.userCrossRate);
      } else if (feeData.takerRate !== undefined) {
        crossRate = parseFloat(feeData.takerRate);
      }
      const addRate = parseFloat(feeData.userAddRate || 0) || null;
      const oldCrossRate = this._crossRate;
      if (crossRate !== null && !isNaN(crossRate) && crossRate > 0 && crossRate < 0.01) {
        if (crossRate <= this._initialCrossRate) {
          this._crossRate = crossRate;
          this._feeSource = 'api';
          this._feeLastRefresh = Date.now();
        }
      }
      if (addRate !== null && !isNaN(addRate) && addRate > 0 && addRate < 0.01) {
        if (addRate <= this._initialAddRate) {
          this._addRate = addRate;
        }
      }
      if (this._growthFeeOverride !== null) {
        this._takerFeeGrowth = this._growthFeeOverride;
      } else {
        this._takerFeeGrowth = this._crossRate * this._growthMultiplier;
      }
      this._takerFeeNoGrowth = this._addRate;
      this._feeRoundTripBps = 2 * this._takerFeeGrowth * 10000;
      if (Math.abs(oldCrossRate - this._crossRate) > 0.0000001) {
        console.log(`${this._logPrefix} Fee tier updated: crossRate ${(oldCrossRate*10000).toFixed(1)}bps → ${(this._crossRate*10000).toFixed(1)}bps`);
      }
      console.log(`${this._logPrefix} Fee rates refreshed: crossRate=${this._crossRate}, addRate=${this._addRate}, growth=${this._takerFeeGrowth} (${(this._takerFeeGrowth*10000).toFixed(2)}bps), noGrowth=${this._takerFeeNoGrowth} (${(this._takerFeeNoGrowth*10000).toFixed(2)}bps), source=${this._feeSource}${this._growthFeeOverride !== null ? ' [override]' : ''}`);
      for (const cb of this._onFeeUpdateCallbacks) {
        try { cb(this._takerFeeGrowth, this._takerFeeNoGrowth); } catch (e) {}
      }
    } catch (e) {
      console.error(`${this._logPrefix} Fee rate refresh error:`, e.message);
    }
  }

  onFeeUpdate(callback) { this._onFeeUpdateCallbacks.push(callback); }

  getFeeRates() {
    return {
      crossRate: this._crossRate,
      crossRateBps: (this._crossRate * 10000).toFixed(2),
      addRate: this._addRate,
      addRateBps: (this._addRate * 10000).toFixed(2),
      takerFeeGrowth: this._takerFeeGrowth,
      takerFeeGrowthBps: (this._takerFeeGrowth * 10000).toFixed(2),
      takerFeeNoGrowth: this._takerFeeNoGrowth,
      takerFeeNoGrowthBps: (this._takerFeeNoGrowth * 10000).toFixed(2),
      growthMultiplier: this._growthMultiplier,
      growthFeeOverride: this._growthFeeOverride,
      lastRefresh: this._feeLastRefresh,
      source: this._feeSource,
    };
  }

  parseOrderResult(result) {
    try {
      const resp = result?.response?.data?.statuses?.[0] || result?.data?.statuses?.[0] || {};
      if (resp.filled) {
        return {
          status: 'filled',
          oid: resp.filled.oid,
          fillPx: parseFloat(resp.filled.avgPx || resp.filled.px || 0),
          fillSz: resp.filled.totalSz ? parseFloat(resp.filled.totalSz) : null,
        };
      }
      if (resp.resting) {
        return { status: 'resting', oid: resp.resting.oid, fillPx: null, fillSz: null };
      }
      if (resp.error) {
        return { status: 'error', oid: null, fillPx: null, fillSz: null, error: resp.error };
      }
      return { status: 'unknown', oid: null, fillPx: null, fillSz: null };
    } catch (e) {
      return { status: 'parse_error', oid: null, fillPx: null, fillSz: null, error: e.message };
    }
  }

  computeEntrySlippage(signal, statusA, statusB, legABuy) {
    try {
      const expectedBuy = signal.buyVWAP;
      const expectedSell = signal.sellVWAP;
      const midRef = (expectedBuy + expectedSell) / 2;
      const fillA = statusA.fillPx;
      const fillB = statusB.fillPx;
      if (!fillA || !fillB) return 0;
      let slipBps;
      if (legABuy) {
        slipBps = ((fillA - expectedBuy) / midRef * 10000) + ((expectedSell - fillB) / midRef * 10000);
      } else {
        slipBps = ((expectedSell - fillA) / midRef * 10000) + ((fillB - expectedBuy) / midRef * 10000);
      }
      return Math.abs(slipBps);
    } catch (e) {
      return 0;
    }
  }

  async getTradeHistory(limit = 50) {
    try {
      const res = await pool.query(
        `SELECT * FROM bot_trades WHERE bot_id = $2 ORDER BY entry_ts DESC LIMIT $1`,
        [limit, this._botId]
      );
      return res.rows;
    } catch (err) {
      return [];
    }
  }

  async getPositionsList() {
    try {
      const res = await pool.query(
        `SELECT * FROM positions WHERE bot_id = $1 AND status = 'open' ORDER BY opened_at DESC`,
        [this._botId]
      );
      return res.rows.map(r => ({
        id: r.id,
        pairId: r.pair_id,
        direction: r.direction,
        legACoin: r.leg_a_coin,
        legBCoin: r.leg_b_coin,
        size: parseFloat(r.size),
        vwapA: parseFloat(r.vwap_entry_a),
        vwapB: parseFloat(r.vwap_entry_b),
        avgSlipBps: parseFloat(r.avg_slippage_bps),
        totalFills: parseInt(r.total_fills),
        totalNotionalUsd: parseFloat(r.total_notional_usd),
        realizedPnlUsd: parseFloat(r.realized_pnl_usd),
        feesUsd: parseFloat(r.fees_usd),
        openedAt: parseInt(r.opened_at),
        updatedAt: parseInt(r.updated_at),
        status: r.status,
      }));
    } catch (err) {
      console.error(`${this._logPrefix} getPositionsList error:`, err.message);
      return [];
    }
  }

  async getRecentFills(limit = 100) {
    try {
      const res = await pool.query(
        `SELECT * FROM position_fills WHERE bot_id = $1 ORDER BY ts DESC LIMIT $2`,
        [this._botId, limit]
      );
      return res.rows.map(r => ({
        id: r.id,
        positionId: r.position_id,
        pairId: r.pair_id,
        fillType: r.fill_type,
        direction: r.direction,
        size: parseFloat(r.size),
        priceA: parseFloat(r.price_a),
        priceB: parseFloat(r.price_b),
        edgeBps: parseFloat(r.edge_bps),
        slippageBps: parseFloat(r.slippage_bps),
        pnlUsd: parseFloat(r.pnl_usd),
        feesUsd: parseFloat(r.fees_usd),
        ts: parseInt(r.ts),
      }));
    } catch (err) {
      console.error(`${this._logPrefix} getRecentFills error:`, err.message);
      return [];
    }
  }

  async getPairStats(pairMids) {
    try {
      const positions = await this.getPositionsList();
      const result = [];
      for (const pos of positions) {
        const mids = pairMids?.[pos.pairId];
        const midA = mids?.midA || 0;
        const midB = mids?.midB || 0;
        const spreadPnlBps = this.computeSpreadPnlBps(pos, midA, midB);
        const spreadPnlUsd = this.computeSpreadPnlUsd(pos, midA, midB);
        const feesRT = this.getPairFeeRoundTripBps(pos.pairId);
        result.push({
          pairId: pos.pairId,
          direction: pos.direction,
          open: 1,
          size: pos.size,
          vwapA: pos.vwapA,
          vwapB: pos.vwapB,
          totalFills: pos.totalFills,
          avgSlipBps: pos.avgSlipBps,
          unrealizedPnlBps: spreadPnlBps || 0,
          unrealizedPnlUsd: spreadPnlUsd || 0,
          realizedPnlUsd: pos.realizedPnlUsd,
          feesUsd: pos.feesUsd,
          feesRT,
          totalNotionalUsd: pos.totalNotionalUsd,
          zMid0: this._zScoreAccessor ? (this._zScoreAccessor(pos.pairId, pos.direction === 1 ? 1 : -1)?.kalmanMid ?? null) : null,
        });
      }
      return result;
    } catch (err) {
      return [];
    }
  }

  async getLiveStats() {
    try {
      const [posRes, fillsRes, legacyRes] = await Promise.all([
        pool.query(`
          SELECT
            COUNT(*) FILTER (WHERE status = 'open') as open_count,
            COALESCE(SUM(realized_pnl_usd), 0) as total_realized_pnl,
            COALESCE(SUM(fees_usd), 0) as total_fees,
            COALESCE(SUM(total_notional_usd), 0) as total_volume
          FROM positions WHERE bot_id = $1
        `, [this._botId]),
        pool.query(`
          SELECT
            COUNT(*) as total_fills,
            COUNT(*) FILTER (WHERE fill_type = 'entry') as entries,
            COUNT(*) FILTER (WHERE fill_type IN ('full_close','partial_close')) as closes,
            COUNT(*) FILTER (WHERE pnl_usd > 0 AND fill_type IN ('full_close','partial_close')) as wins,
            COUNT(*) FILTER (WHERE pnl_usd <= 0 AND fill_type IN ('full_close','partial_close')) as losses
          FROM position_fills WHERE bot_id = $1
        `, [this._botId]),
        pool.query(`
          SELECT
            COUNT(*) as total,
            COALESCE(SUM(realized_pnl_usd) FILTER (WHERE status = 'closed'), 0) as legacy_pnl,
            COALESCE(SUM(fees_usd) FILTER (WHERE status = 'closed'), 0) as legacy_fees
          FROM bot_trades WHERE bot_id = $1 AND status = 'closed'
        `, [this._botId])
      ]);
      const p = posRes.rows[0];
      const f = fillsRes.rows[0];
      const l = legacyRes.rows[0];
      const closes = parseInt(f.closes) || 0;
      const wins = parseInt(f.wins) || 0;
      return {
        total: parseInt(f.total_fills) || 0,
        open: parseInt(p.open_count) || 0,
        closed: closes,
        errors: 0,
        totalPnlUsd: parseFloat(p.total_realized_pnl) + parseFloat(l.legacy_pnl),
        totalFeesUsd: parseFloat(p.total_fees) + parseFloat(l.legacy_fees),
        totalVolumeUsd: parseFloat(p.total_volume),
        fundingNet: this.getTotalWalletFunding(),
        wins,
        losses: parseInt(f.losses) || 0,
        winRate: closes > 0 ? (wins / closes * 100).toFixed(1) : 0,
        avgEntrySlippageBps: 0,
        execLatency: this._getExecTimeStats(),
        closeLatency: this.getCloseLatencyStats(),
      };
    } catch (err) {
      return { total: 0, open: 0, closed: 0, errors: 0, totalPnlUsd: 0, totalFeesUsd: 0, totalVolumeUsd: 0, fundingNet: 0, wins: 0, losses: 0, winRate: 0, execLatency: { avg: null, count: 0 }, closeLatency: { avg: null, count: 0 } };
    }
  }

  getConfig() {
    return {
      botId: this._botId,
      enabled: this.enabled,
      initialized: this._initialized,
      enabledPairs: Object.keys(this.enabledPairs).filter(p => this.enabledPairs[p]),
      maxGlobalPositions: this.maxGlobalPositions,
      maxPositionUsd: this.maxPositionUsd,
      positionSizeUsd: this.positionSizeUsd,
      maxLeverage: this.maxLeverage,
      stopLossBps: this.stopLossBps,
      maxLossBps: this.maxLossBps,
      closeBufferBps: this.closeBufferBps,
      marginBps: this.marginBps,
      p50Mode: this.p50Mode,
      bufferBps: this.bufferBps,
      slippageMarginBps: this.slippageMarginBps,
      dataTimer: this.dataTimer,
      zMeanRevert: this.zMeanRevert,
      feeRoundTripBps: this._feeRoundTripBps,
      feeRates: this.getFeeRates(),
      tierConfig: this.tierConfig,
      liquidationMode: this.liquidationMode,
      minDeployerCollateralUsd: this.minDeployerCollateralUsd,
      collateralOk: this._collateralOk,
      balances: this._cachedBalances,
      alertWebhookUrl: this._alertWebhookUrl ? '***configured***' : '',
      openPositions: this.getPositionsMap(),
      stats: { ...this.stats },
      marginBlocked: { ...this._marginBlocked },
      apiKeyMasked: this._hlApi.getPrivateKeyMasked ? this._hlApi.getPrivateKeyMasked() : '',
      latency: this._hlApi.getLatencyStats ? this._hlApi.getLatencyStats() : null,
      execTime: this._getExecTimeStats(),
      e2eLatency: this.getE2ELatencyStats(),
      closeLatency: this.getCloseLatencyStats(),
      realtimeWindowMin: this._realtimeWindowMs / 60000,
      stableTargets: { ...this._stableTargets },
      driftThreshold: this._driftThreshold,
      intraRebalanceIntervalSec: this._intraRebalanceIntervalSec,
      intraRebalanceCooldownSec: this._intraRebalanceCooldownSec,
      dryThresholdPct: this._dryThresholdPct,
      donateThresholdPct: this._donateThresholdPct,
      atoEnabled: this.atoEnabled,
      zThreshold: this.zThreshold,
      zWindowSec: this.zWindowSec,
      zKalmanSensitivity: this.zKalmanSensitivity,
      minHoldMs: this.minHoldMs,
      maxSlippageBps: this._maxSlippageBps,
      tiersEnabled: this.tiersEnabled,
      pairZThresholds: this._pairZThresholds,
      pairBufferBps: this._pairBufferBps,
    };
  }

  getMarginInfo() {
    const b = this._cachedBalances || {};
    const total = (b.usdc || 0) + (b.usdt || 0) + (b.usdh || 0);
    let totalNotional = 0;
    for (const [, pos] of this._positions) {
      if (pos.size > 0) totalNotional += pos.size * ((pos.vwapA + pos.vwapB) / 2);
    }
    const used = totalNotional / (this.maxLeverage || 10);
    const free = Math.max(0, total - used);
    const freePct = total > 0 ? (free / total) * 100 : 0;
    return { total, used, free, freePct };
  }

  isWalletDry() {
    const margin = this.getMarginInfo();
    return margin.freePct < this._dryThresholdPct;
  }

  canDonate() {
    const margin = this.getMarginInfo();
    return margin.freePct > this._donateThresholdPct;
  }

  getStableBalances() {
    const b = this._cachedBalances || {};
    const usdc = b.usdc || 0;
    const usdt = b.usdt || 0;
    const usdh = b.usdh || 0;
    const total = usdc + usdt + usdh;
    const targets = { ...this._stableTargets };
    const driftThreshold = this._driftThreshold;

    const actual = { usdc: total > 0 ? usdc / total : 0, usdt: total > 0 ? usdt / total : 0, usdh: total > 0 ? usdh / total : 0 };
    const drift = {
      usdc: actual.usdc - targets.usdc,
      usdt: actual.usdt - targets.usdt,
      usdh: actual.usdh - targets.usdh,
    };
    const maxDrift = Math.max(Math.abs(drift.usdc), Math.abs(drift.usdt), Math.abs(drift.usdh));
    const criticalDrift = maxDrift > driftThreshold;
    const margin = this.getMarginInfo();
    const cooldownRemainingSec = Math.max(0, Math.ceil((this._lastRebalanceTs + this._intraRebalanceCooldownSec * 1000 - Date.now()) / 1000));

    return {
      balances: { usdc, usdt, usdh, total },
      targets,
      actual,
      drift,
      maxDrift,
      driftThreshold,
      criticalDrift,
      rebalancing: this._stableRebalancing,
      lastRebalanceTs: this._lastRebalanceTs,
      cooldownRemainingSec,
      intraRebalanceIntervalSec: this._intraRebalanceIntervalSec,
      intraRebalanceCooldownSec: this._intraRebalanceCooldownSec,
      margin,
      isWalletDry: this.isWalletDry(),
      canDonate: this.canDonate(),
      dryThresholdPct: this._dryThresholdPct,
      donateThresholdPct: this._donateThresholdPct,
    };
  }

  async triggerStableRebalance() {
    if (this._stableRebalancing) return { ok: false, error: 'Rebalance already in progress' };
    const sb = this.getStableBalances();
    if (sb.balances.total < 5) return { ok: false, error: 'Total balance too low' };

    this._stableRebalancing = true;
    const actions = [];
    try {
      const total = sb.balances.total;
      const usdt = sb.balances.usdt;
      const usdh = sb.balances.usdh;
      const targets = this._stableTargets;
      const usdtTarget = total * (targets.usdt || 0.25);
      const usdhTarget = total * (targets.usdh || 0.25);
      const usdtExcess = usdt - usdtTarget;
      const usdhExcess = usdh - usdhTarget;

      const toSell = [];
      const toBuy = [];
      if (usdtExcess > 2) toSell.push({ token: 'USDT', excess: usdtExcess });
      if (usdhExcess > 2) toSell.push({ token: 'USDH', excess: usdhExcess });
      if (usdtExcess < -2) toBuy.push({ token: 'USDT', deficit: -usdtExcess });
      if (usdhExcess < -2) toBuy.push({ token: 'USDH', deficit: -usdhExcess });
      toSell.sort((a, b) => b.excess - a.excess);
      toBuy.sort((a, b) => b.deficit - a.deficit);

      for (const sell of toSell) {
        const sellAmt = Math.floor(sell.excess * 0.8 * 100) / 100;
        if (sellAmt < 1) continue;
        try {
          const res = await this._hlApi.placeSpotMarketSell(sell.token, sellAmt);
          const statuses = res?.response?.data?.statuses || [];
          const filled = statuses.find(s => s.filled);
          if (filled) {
            actions.push({ token: sell.token, action: 'sell', amount: sellAmt, status: 'filled' });
          } else {
            actions.push({ token: sell.token, action: 'sell', amount: sellAmt, status: 'not_filled' });
          }
        } catch (e) {
          actions.push({ token: sell.token, action: 'sell', amount: sellAmt, status: 'error', error: e.message });
        }
        await new Promise(r => setTimeout(r, 1000));
      }

      for (const buy of toBuy) {
        const buyAmt = Math.floor(buy.deficit * 0.8 * 100) / 100;
        if (buyAmt < 1) continue;
        try {
          await this._hlApi.placeSpotMarketBuy(buy.token, buyAmt);
          actions.push({ token: buy.token, action: 'buy', amount: buyAmt, status: 'filled' });
        } catch (e) {
          actions.push({ token: buy.token, action: 'buy', amount: buyAmt, status: 'error', error: e.message });
        }
        await new Promise(r => setTimeout(r, 1000));
      }

      if (actions.some(a => a.status === 'filled')) {
        setTimeout(() => this._refreshCollateral?.(), 3000);
      }

      this._lastRebalanceTs = Date.now();
      return { ok: true, actions, before: sb };
    } catch (e) {
      return { ok: false, error: e.message, actions };
    } finally {
      this._stableRebalancing = false;
    }
  }

  async forceCloseAll() {
    console.log(`${this._logPrefix} FORCE-CLOSE-ALL initiated`);
    const addr = this._hlApi.getActiveAddress() || this._activeAddress;
    const positions = await this._hlApi.getDeployerPositions(addr, this._dexFilter);
    const coins = Object.keys(positions || {}).filter(c => !c.startsWith('_') && positions[c] && typeof positions[c].size === 'number' && Math.abs(positions[c].size) > 0);

    if (coins.length === 0) {
      for (const [pairId] of this._positions) {
        await pool.query(`UPDATE positions SET size = 0, status = 'flat', updated_at = $1 WHERE pair_id = $2 AND bot_id = $3 AND status = 'open'`, [Date.now(), pairId, this._botId]);
      }
      this._positions.clear();
      return { closedOnChain: 0, dbUpdated: 0, errors: [] };
    }

    const closeResults = [];
    const errors = [];
    for (const coin of coins) {
      const pos = positions[coin];
      const isBuy = pos.size < 0;
      const size = Math.abs(pos.size);
      try {
        const result = await this._hlApi.placeMarketOrder(coin, isBuy, size, 0.005);
        const status = this.parseOrderResult(result);
        closeResults.push({ coin, size, fillPx: status.fillPx, status: status.status });
        if (status.status !== 'filled') errors.push(`${coin}: ${status.status}`);
      } catch (err) {
        errors.push(`${coin}: ${err.message}`);
        closeResults.push({ coin, size, status: 'error', error: err.message });
      }
      await new Promise(r => setTimeout(r, 300));
    }

    const now = Date.now();
    for (const [pairId] of this._positions) {
      await pool.query(`UPDATE positions SET size = 0, status = 'flat', updated_at = $1 WHERE pair_id = $2 AND bot_id = $3 AND status = 'open'`, [now, pairId, this._botId]);
    }
    this._positions.clear();
    this._refreshCollateralNow();

    console.log(`${this._logPrefix} FORCE-CLOSE-ALL complete: ${closeResults.length} coins closed`);
    return { closedOnChain: closeResults.length, errors, details: closeResults };
  }

  async forceClosePair(pairId) {
    const pos = this._positions.get(pairId);
    if (!pos || pos.size <= 0) return { ok: false, error: 'No open position for this pair' };

    const coinA = pos.legACoin;
    const coinB = pos.legBCoin;
    const addr = this._hlApi.getActiveAddress() || this._activeAddress;
    const onChain = await this._hlApi.getDeployerPositions(addr, this._dexFilter);
    const posA = onChain[coinA];
    const posB = onChain[coinB];

    const closeResults = [];
    const errors = [];

    for (const [coin, onPos] of [[coinA, posA], [coinB, posB]]) {
      if (!onPos || Math.abs(onPos.size) === 0) continue;
      const isBuy = onPos.size < 0;
      const size = Math.abs(onPos.size);
      try {
        const result = await this._hlApi.placeMarketOrder(coin, isBuy, size, 0.005);
        const status = this.parseOrderResult(result);
        closeResults.push({ coin, size, fillPx: status.fillPx, status: status.status });
        if (status.status !== 'filled') errors.push(`${coin}: ${status.status}`);
      } catch (err) {
        errors.push(`${coin}: ${err.message}`);
        closeResults.push({ coin, size, status: 'error', error: err.message });
      }
      await new Promise(r => setTimeout(r, 300));
    }

    const now = Date.now();
    await pool.query(`UPDATE positions SET size = 0, status = 'flat', updated_at = $1 WHERE pair_id = $2 AND bot_id = $3 AND status = 'open'`, [now, pairId, this._botId]);
    this._positions.delete(pairId);
    this._refreshCollateralNow();

    return { ok: true, pairId, closedOnChain: closeResults.length, errors, details: closeResults };
  }

  async reset() {
    this.stop();

    const closedPositions = [];
    try {
      const positions = await this._hlApi.getDeployerPositions(this._hlApi.getActiveAddress() || this._activeAddress, this._dexFilter);
      const coins = Object.keys(positions || {}).filter(c => !c.startsWith('_') && positions[c] && typeof positions[c].size === 'number' && Math.abs(positions[c].size) > 0);
      if (coins.length > 0) {
        console.log(`${this._logPrefix} RESET — closing ${coins.length} on-chain positions...`);
        for (const coin of coins) {
          const pos = positions[coin];
          const sz = Math.abs(pos.size);
          const roundedSz = this._hlApi.roundSize(coin, sz);
          if (!roundedSz || roundedSz <= 0) {
            closedPositions.push({ coin, size: sz, status: 'skipped', error: 'size rounds to 0' });
            continue;
          }
          const isBuy = pos.size < 0;
          const midPx = pos.entryPx || pos.price || 1;
          const closePx = this._hlApi.roundPrice(coin, midPx * (isBuy ? 1.02 : 0.98));
          try {
            const result = await this._hlApi._sdk.exchange.placeOrder({
              coin, is_buy: isBuy, sz: roundedSz, limit_px: closePx,
              order_type: { limit: { tif: 'Ioc' } }, reduce_only: true,
            });
            const parsed = this.parseOrderResult(result);
            closedPositions.push({ coin, size: roundedSz, status: parsed.status, fillPx: parsed.fillPx });
          } catch (e) {
            closedPositions.push({ coin, size: roundedSz, status: 'error', error: e.message });
          }
        }
      }
    } catch (e) {
      console.error(`${this._logPrefix} RESET fetch positions error:`, e.message);
    }

    try {
      await pool.query(`DELETE FROM position_fills WHERE bot_id = $1`, [this._botId]);
      await pool.query(`DELETE FROM positions WHERE bot_id = $1`, [this._botId]);
      await pool.query(`DELETE FROM bot_trades WHERE bot_id = $1`, [this._botId]);
      if (this._botId === 'bot1') {
        await pool.query(`DELETE FROM bot_config WHERE key IN ('bot_enabled','bot_liquidation','bot_params','enabled_pairs','pair_min_edge_bps')`);
      } else {
        await pool.query(`DELETE FROM bot_config WHERE key LIKE $1`, [`${this._botId}_%`]);
      }
    } catch (e) {
      console.error(`${this._logPrefix} Reset DB error:`, e.message);
    }

    this._positions.clear();
    this._closingPositions.clear();
    this._closingCoins = {};
    this.pendingOrders = {};
    this._pendingDbInsertCoins = new Set();
    this._recentlyTradedCoins = {};
    this._orphanClosing = new Set();
    this._orphanOnChainSeen = {};
    this._persistOrphanSeen();
    this._marginBlocked = {};
    this._coinFailCounts = {};
    this._coinCooldownUntil = {};
    this.stats = { totalExecuted: 0, totalFilled: 0, totalFailed: 0, totalPnlUsd: 0 };
    this._activityLog = [];
    this._fundingCache = { entries: [], byDexCoin: {}, lastFetchMs: 0 };
    this._sessionStartMs = Date.now();
    console.log(`${this._logPrefix} RESET complete — ${closedPositions.length} on-chain positions closed, all data cleared, bot stopped`);
    return { ok: true, closedPositions };
  }

  _startReconciliationLoop() {
    this._reconBackoff = 10000;
    const runLoop = async () => {
      if (!this._initialized) { setTimeout(runLoop, this._reconBackoff); return; }
      if (!this.enabled && this._positions.size === 0) { setTimeout(runLoop, 60000); return; }
      try {
        await this.runPositionReconciliation();
        this._reconBackoff = 10000;
      } catch (e) {
        console.error(`${this._logPrefix} Reconciliation error:`, e.message);
        this._reconBackoff = Math.min(this._reconBackoff * 2, 120000);
      }
      setTimeout(runLoop, this._reconBackoff);
    };
    setTimeout(runLoop, 5000 + this._staggerMs);
  }

  async runPositionReconciliation() {
    try {
      const now = Date.now();
      for (const c of Object.keys(this._recentlyTradedCoins)) {
        if (now - this._recentlyTradedCoins[c] >= 30000) delete this._recentlyTradedCoins[c];
      }

      const reconAddr = this._hlApi.getActiveAddress() || this._activeAddress;
      const onChainPositions = await this._hlApi.getDeployerPositions(reconAddr, this._dexFilter);
      const failedDexes = onChainPositions._failedDexes || new Set();
      if (failedDexes.size > 0) {
        console.warn(`${this._logPrefix} Reconciliation: ${failedDexes.size} dex API(s) failed: ${[...failedDexes].join(', ')}`);
        if (failedDexes.size >= 5) throw new Error(`Too many dex API failures (${failedDexes.size}), backing off`);
      }

      const expectedCoins = new Set();
      for (const [, pos] of this._positions) {
        if (pos.size > 0) {
          expectedCoins.add(pos.legACoin);
          expectedCoins.add(pos.legBCoin);
        }
      }

      const issues = [];

      for (const coin of expectedCoins) {
        if (!onChainPositions[coin]) {
          if (this._pendingDbInsertCoins.has(coin)) continue;
          const coinDex = coin.split(':')[0];
          if (failedDexes.has(coinDex)) {
            issues.push(`${coin}: missing on-chain (dex ${coinDex} API failed — skipping)`);
            continue;
          }
          if (this._closingCoins[coin]) continue;
          issues.push(`${coin}: PHANTOM — expected in DB but missing on-chain`);
        } else {
          const onChainSize = Math.abs(onChainPositions[coin].size);
          let dbSize = 0;
          for (const [, pos] of this._positions) {
            if (pos.legACoin === coin || pos.legBCoin === coin) dbSize += pos.size;
          }
          if (dbSize > 0 && Math.abs(onChainSize - dbSize) / dbSize > 0.10) {
            const drift = ((onChainSize - dbSize) / dbSize * 100).toFixed(1);
            issues.push(`${coin}: SIZE_MISMATCH db=${dbSize.toFixed(6)} onChain=${onChainSize.toFixed(6)} (${drift}%)`);

            if (!this._reconCorrectionCooldown) this._reconCorrectionCooldown = {};
            const cooldownKey = coin;
            const lastCorrection = this._reconCorrectionCooldown[cooldownKey] || 0;
            if (now - lastCorrection > 30000) {
              this._reconCorrectionCooldown[cooldownKey] = now;

              for (const [pid, p] of this._positions) {
                if (p.legACoin === coin || p.legBCoin === coin) {
                  const isLegA = p.legACoin === coin;
                  const otherCoin = isLegA ? p.legBCoin : p.legACoin;
                  const otherOnChain = onChainPositions[otherCoin] ? Math.abs(onChainPositions[otherCoin].size) : 0;
                  const correctedSize = Math.min(onChainSize, otherOnChain);

                  if (correctedSize <= 0) {
                    console.warn(`${this._logPrefix} RECON-CORRECT ${pid}: on-chain=0 for both legs — marking flat`);
                    p.size = 0;
                    p.status = 'flat';
                    pool.query(
                      `UPDATE positions SET size = 0, status = 'flat', updated_at = $1 WHERE id = $2`,
                      [now, p.id]
                    ).catch(e => console.error(`${this._logPrefix} RECON-CORRECT DB error:`, e.message));
                    this._positions.delete(pid);
                    if (!this.stats.reconciliationCorrections) this.stats.reconciliationCorrections = 0;
                    this.stats.reconciliationCorrections++;
                    issues.push(`${pid}: RECON-CORRECTED to flat (both legs gone)`);
                  } else if (Math.abs(correctedSize - p.size) / p.size > 0.10) {
                    const oldSz = p.size;
                    p.size = correctedSize;
                    pool.query(
                      `UPDATE positions SET size = $1, updated_at = $2 WHERE id = $3`,
                      [correctedSize, now, p.id]
                    ).catch(e => console.error(`${this._logPrefix} RECON-CORRECT DB error:`, e.message));
                    if (!this.stats.reconciliationCorrections) this.stats.reconciliationCorrections = 0;
                    this.stats.reconciliationCorrections++;
                    console.warn(`${this._logPrefix} RECON-CORRECTED ${pid}: size ${oldSz.toFixed(6)} → ${correctedSize.toFixed(6)} (on-chain truth)`);
                    issues.push(`${pid}: RECON-CORRECTED size ${oldSz.toFixed(6)} → ${correctedSize.toFixed(6)}`);

                    const legAOnChain = onChainPositions[p.legACoin] ? Math.abs(onChainPositions[p.legACoin].size) : 0;
                    const legBOnChain = onChainPositions[p.legBCoin] ? Math.abs(onChainPositions[p.legBCoin].size) : 0;
                    if (legAOnChain > 0 && legBOnChain > 0 && Math.abs(legAOnChain - legBOnChain) / Math.max(legAOnChain, legBOnChain) > 0.05) {
                      const bigLeg = legAOnChain > legBOnChain ? p.legACoin : p.legBCoin;
                      const smallSz = Math.min(legAOnChain, legBOnChain);
                      const excessSz = this._hlApi.roundSize(bigLeg, Math.abs(legAOnChain - legBOnChain));
                      if (excessSz > 0 && !this._closingCoins[bigLeg]) {
                        console.warn(`${this._logPrefix} RECON-REBALANCE: ${bigLeg} excess ${excessSz} — unwinding to match ${smallSz.toFixed(6)}`);
                        this._closingCoins[bigLeg] = true;
                        const bigPos = onChainPositions[bigLeg];
                        const isBuyToClose = bigPos.size < 0;
                        const midPx = bigPos.entryPx || bigPos.price || 1;
                        const closePx = this._hlApi.roundPrice(bigLeg, midPx * (isBuyToClose ? 1.01 : 0.99));
                        try {
                          const result = await this._hlApi._sdk.exchange.placeOrder({
                            coin: bigLeg, is_buy: isBuyToClose, sz: excessSz, limit_px: closePx,
                            order_type: { limit: { tif: 'Ioc' } }, reduce_only: true,
                          });
                          const parsed = this.parseOrderResult(result);
                          if (parsed.status === 'filled') {
                            console.warn(`${this._logPrefix} RECON-REBALANCE SUCCESS: ${bigLeg} ${excessSz} @ ${parsed.fillPx}`);
                          } else {
                            console.error(`${this._logPrefix} RECON-REBALANCE MISSED: ${bigLeg} ${excessSz}`);
                          }
                        } catch (e) {
                          console.error(`${this._logPrefix} RECON-REBALANCE ERROR: ${bigLeg} — ${e.message}`);
                        } finally {
                          delete this._closingCoins[bigLeg];
                        }
                      }
                    }
                  }
                  break;
                }
              }
            }
          }
        }
      }

      if (!this._orphanOnChainSeen) this._orphanOnChainSeen = {};
      if (!this._orphanCloseAttempts) this._orphanCloseAttempts = {};

      for (const [coin, pos] of Object.entries(onChainPositions)) {
        if (coin.startsWith('_')) continue;
        if (expectedCoins.has(coin)) continue;
        if (this._pendingDbInsertCoins.has(coin)) continue;
        if (this._closingCoins[coin]) continue;
        if (this._recentlyTradedCoins[coin]) continue;

        if (!this._orphanOnChainSeen[coin]) {
          this._orphanOnChainSeen[coin] = Date.now();
          issues.push(`${coin}: on-chain ${pos.size} but no DB record — tracking (60s grace)`);
        } else if (Date.now() - this._orphanOnChainSeen[coin] > 60000) {
          const attempts = this._orphanCloseAttempts[coin] || 0;
          if (attempts >= 5) {
            issues.push(`${coin}: STUCK_ORPHAN (${attempts} failed attempts)`);
            continue;
          }
          const isBuy = pos.size < 0;
          const sz = Math.abs(pos.size);
          const roundedSz = this._hlApi.roundSize(coin, sz);
          if (!roundedSz || roundedSz <= 0) {
            delete this._orphanOnChainSeen[coin];
            delete this._orphanCloseAttempts[coin];
            issues.push(`${coin}: orphan skipped (dust)`);
          } else {
            if (this._closingCoins[coin]) continue;
            this._closingCoins[coin] = true;
            const midPx = pos.entryPx || pos.price || 1;
            const closePx = this._hlApi.roundPrice(coin, midPx * (isBuy ? 1.02 : 0.98));
            let closed = false;
            try {
              const result = await this._hlApi._sdk.exchange.placeOrder({
                coin, is_buy: isBuy, sz: roundedSz, limit_px: closePx,
                order_type: { limit: { tif: 'Ioc' } }, reduce_only: true,
              });
              const parsed = this.parseOrderResult(result);
              if (parsed.status === 'filled') {
                console.warn(`${this._logPrefix} RECONCILIATION-CLOSE: orphan ${coin} → filled @ ${parsed.fillPx}`);
                if (!this.stats.reconciliationCloses) this.stats.reconciliationCloses = 0;
                this.stats.reconciliationCloses++;
                delete this._orphanOnChainSeen[coin];
                delete this._orphanCloseAttempts[coin];
                closed = true;
              } else {
                this._orphanCloseAttempts[coin] = attempts + 1;
                if (attempts + 1 >= 5) {
                  this._sendAlert('stuck_orphan', `Orphan position ${coin} stuck after 5 close attempts`);
                }
              }
            } catch (e) {
              console.error(`${this._logPrefix} RECONCILIATION-CLOSE FAILED: ${coin} — ${e.message}`);
              this._orphanCloseAttempts[coin] = attempts + 1;
            } finally {
              delete this._closingCoins[coin];
            }
            issues.push(`${coin}: orphan close attempt ${attempts + 1} ${closed ? 'SUCCESS' : 'PENDING'}`);
          }
        } else {
          issues.push(`${coin}: on-chain ${pos.size} but no DB record (${Math.round((Date.now() - this._orphanOnChainSeen[coin]) / 1000)}s seen)`);
        }
      }

      if (this._orphanOnChainSeen) {
        for (const key of Object.keys(this._orphanOnChainSeen)) {
          if (expectedCoins.has(key) || !onChainPositions[key]) delete this._orphanOnChainSeen[key];
        }
        this._persistOrphanSeen();
      }

      if (issues.length > 0) {
        console.warn(`${this._logPrefix} RECONCILIATION (${issues.length} issues):`);
        issues.forEach(i => console.warn(`${this._logPrefix}   - ${i}`));
      } else if (expectedCoins.size > 0) {
        console.log(`${this._logPrefix} Reconciliation OK: ${expectedCoins.size} coins match on-chain`);
      }

      return { ok: issues.length === 0, issues, onChain: onChainPositions, dbCoins: [...expectedCoins] };
    } catch (e) {
      console.error(`${this._logPrefix} Reconciliation error:`, e.message);
      return { ok: false, issues: [e.message] };
    }
  }

  getDnStatus() {
    const aggCoins = [];
    for (const [, pos] of this._positions) {
      if (pos.size > 0) {
        aggCoins.push({
          pairId: pos.pairId,
          direction: pos.direction,
          size: pos.size,
          vwapA: pos.vwapA,
          vwapB: pos.vwapB,
          status: 'ok',
        });
      }
    }
    return {
      status: 'ok',
      lastCheck: Date.now(),
      positions: aggCoins,
      aggregate: { status: 'ok', coins: aggCoins },
    };
  }

  getHedgeRecapLine() {
    const openCount = this._positions.size;
    let totalSize = 0;
    for (const [, pos] of this._positions) {
      if (pos.size > 0) totalSize += pos.size * ((pos.vwapA + pos.vwapB) / 2);
    }
    return `Positions: ${openCount} open | notional: $${totalSize.toFixed(0)}`;
  }

  _startBalanceRefreshLoop() {
    this._collateralOk = false;
    this._refreshCollateral = async () => {
      try {
        const addr = this._hlApi.getActiveAddress() || this._activeAddress;
        this._cachedBalances = await this._hlApi.getBalances(addr);
        this._balanceCacheTs = Date.now();
        this._balBackoff = 5000;
        const b = this._cachedBalances;
        if (b) {
          const total = (b.usdc || 0) + (b.usdt || 0) + (b.usdh || 0);
          const minLeverage = this.maxLeverage || 10;
          const marginNeeded = this.positionSizeUsd / minLeverage;
          const wasOk = this._collateralOk;
          this._collateralOk = total >= marginNeeded * 1.1;
          if (!wasOk && this._collateralOk) {
            console.log(`${this._logPrefix} Collateral OK: $${total.toFixed(2)} [${addr}]`);
          }
        }
      } catch (e) {
        if (!this._balErrSuppressed || Date.now() - this._balErrSuppressed > 60000) {
          console.error(`${this._logPrefix} Balance refresh error:`, e.message);
          this._balErrSuppressed = Date.now();
        }
        this._balBackoff = Math.min((this._balBackoff || 5000) * 2, 60000);
      }
    };
    setTimeout(() => {
      this._refreshCollateral();
      const balLoop = async () => {
        if (!this.enabled && this._positions.size === 0) {
          setTimeout(balLoop, 30000);
          return;
        }
        await this._refreshCollateral();
        setTimeout(balLoop, this._balBackoff || 5000);
      };
      setTimeout(balLoop, 5000);
    }, this._staggerMs);
  }

  _refreshCollateralNow() {
    setTimeout(() => this._refreshCollateral?.(), 1000);
  }

  _startBalanceRebalancer() {
    this._rebalancerRunning = false;
    setTimeout(() => {
      this._rebalanceInterval = setInterval(() => this._checkAndRebalance(), this._intraRebalanceIntervalSec * 1000);
    }, this._staggerMs + 500);
  }

  _restartRebalancerTimer() {
    if (this._rebalanceInterval) clearInterval(this._rebalanceInterval);
    this._rebalanceInterval = setInterval(() => this._checkAndRebalance(), this._intraRebalanceIntervalSec * 1000);
  }

  async _checkAndRebalance() {
    if (this._rebalancerRunning) return;
    if (!this.enabled && this._positions.size === 0) return;
    const now = Date.now();
    if (now - this._lastRebalanceTs < this._intraRebalanceCooldownSec * 1000) return;
    const b = this._cachedBalances;
    if (!b) return;

    const usdc = b.usdc || 0;
    const usdt = b.usdt || 0;
    const usdh = b.usdh || 0;
    const total = usdc + usdt + usdh;
    if (total < 5) return;

    const targets = this._stableTargets;
    const dt = this._driftThreshold;
    const usdtPct = usdt / total;
    const usdhPct = usdh / total;
    const usdtDrift = Math.abs(usdtPct - (targets.usdt || 0.25));
    const usdhDrift = Math.abs(usdhPct - (targets.usdh || 0.25));

    if (usdtDrift < dt && usdhDrift < dt) return;

    this._rebalancerRunning = true;
    try {
      const usdtTarget = total * (targets.usdt || 0.25);
      const usdhTarget = total * (targets.usdh || 0.25);
      const usdtExcess = usdt - usdtTarget;
      const usdhExcess = usdh - usdhTarget;

      const sells = [];
      if (usdtExcess > 2) sells.push({ token: 'USDT', excess: usdtExcess });
      if (usdhExcess > 2) sells.push({ token: 'USDH', excess: usdhExcess });
      const buys = [];
      if (usdtExcess < -2) buys.push({ token: 'USDT', deficit: -usdtExcess });
      if (usdhExcess < -2) buys.push({ token: 'USDH', deficit: -usdhExcess });

      for (const sell of sells) {
        const sellAmt = Math.floor(sell.excess * 0.8 * 100) / 100;
        if (sellAmt < 1) continue;
        try {
          await this._hlApi.placeSpotMarketSell(sell.token, sellAmt);
        } catch (e) {
          console.error(`${this._logPrefix}[Rebalancer] ${sell.token} sell error:`, e.message);
        }
        await new Promise(r => setTimeout(r, 1000));
      }

      for (const buy of buys) {
        const buyAmt = Math.floor(buy.deficit * 0.8 * 100) / 100;
        if (buyAmt < 1) continue;
        try {
          await this._hlApi.placeSpotMarketBuy(buy.token, buyAmt);
        } catch (e) {
          console.error(`${this._logPrefix}[Rebalancer] ${buy.token} buy error:`, e.message);
        }
        await new Promise(r => setTimeout(r, 1000));
      }

      this._lastRebalanceTs = Date.now();
      setTimeout(() => this._refreshCollateral?.(), 3000);
    } catch (e) {
      console.error(`${this._logPrefix}[Rebalancer] Error:`, e.message);
    } finally {
      this._rebalancerRunning = false;
    }
  }

  async _ensureLeverage(coin) {
    const targetLev = Math.min(this.maxLeverage || 10, this._hlApi.getMaxLeverage(coin));
    if (this._leverageSet[coin] === targetLev) return;
    const result = await this._hlApi.updateLeverage(coin, targetLev);
    if (result !== null) this._leverageSet[coin] = result;
  }

  _ensureLeverageBg(coin) {
    const targetLev = Math.min(this.maxLeverage || 10, this._hlApi.getMaxLeverage(coin));
    if (this._leverageSet[coin] === targetLev) return;
    this._hlApi.updateLeverage(coin, targetLev).then(result => {
      if (result !== null) this._leverageSet[coin] = result;
    }).catch(e => console.error(`${this._logPrefix} _ensureLeverageBg ${coin} error:`, e.message));
  }

  _extractSymbol(coin) {
    const parts = coin.split(':');
    return parts.length > 1 ? parts[1] : coin;
  }

  _getDeployerFromCoin(coin) {
    const parts = coin.split(':');
    return parts.length > 1 ? parts[0].toLowerCase() : '';
  }

  _checkDeployerCollateral(coinA, coinB) {
    if (!this._cachedBalances) return { ok: true };
    const deployerA = this._getDeployerFromCoin(coinA);
    const deployerB = this._getDeployerFromCoin(coinB);
    const collateralA = DEPLOYER_COLLATERAL[deployerA];
    const collateralB = DEPLOYER_COLLATERAL[deployerB];
    const minCol = this.minDeployerCollateralUsd;
    if (collateralA) {
      const balA = this._cachedBalances[collateralA] || 0;
      if (balA < minCol) return { ok: false, reason: 'deployer_collateral', detail: `deployer ${deployerA} collateral ${collateralA} ($${balA.toFixed(2)}) < $${minCol}` };
    }
    if (collateralB) {
      const balB = this._cachedBalances[collateralB] || 0;
      if (balB < minCol) return { ok: false, reason: 'deployer_collateral', detail: `deployer ${deployerB} collateral ${collateralB} ($${balB.toFixed(2)}) < $${minCol}` };
    }
    return { ok: true };
  }

  _isSymbolCoolingDown(symbol) {
    if (!this._symbolCooldownUntil?.[symbol]) return false;
    if (Date.now() >= this._symbolCooldownUntil[symbol]) {
      delete this._symbolCooldownUntil[symbol];
      return false;
    }
    return true;
  }

  _trackCoinFail(coin) {
    if (!this._coinFailCounts) this._coinFailCounts = {};
    this._coinFailCounts[coin] = (this._coinFailCounts[coin] || 0) + 1;
    if (!this._coinCooldownUntil) this._coinCooldownUntil = {};
    if (this._coinFailCounts[coin] >= 3) {
      const cooldownMs = Math.min(300000, 30000 * this._coinFailCounts[coin]);
      this._coinCooldownUntil[coin] = Date.now() + cooldownMs;
      console.warn(`${this._logPrefix} Coin ${coin} cooldown ${cooldownMs/1000}s after ${this._coinFailCounts[coin]} fails`);
    }
    const symbol = this._extractSymbol(coin);
    if (!this._symbolFailCounts) this._symbolFailCounts = {};
    this._symbolFailCounts[symbol] = (this._symbolFailCounts[symbol] || 0) + 1;
    const symFailCount = this._symbolFailCounts[symbol];
    const symCooldownMs = Math.min(120000, 15000 * Math.pow(2, Math.min(symFailCount - 1, 3)));
    this._symbolCooldownUntil[symbol] = Date.now() + symCooldownMs;
  }

  _isCoinCoolingDown(coin) {
    if (!this._coinCooldownUntil?.[coin]) return false;
    if (Date.now() >= this._coinCooldownUntil[coin]) {
      delete this._coinCooldownUntil[coin];
      return false;
    }
    return true;
  }

  _resetCoinFail(coin) {
    if (this._coinFailCounts?.[coin]) {
      this._coinFailCounts[coin] = Math.max(0, this._coinFailCounts[coin] - 1);
    }
    const symbol = this._extractSymbol(coin);
    if (this._symbolFailCounts?.[symbol]) {
      this._symbolFailCounts[symbol] = Math.max(0, this._symbolFailCounts[symbol] - 1);
    }
  }

  _trackLegFailure(pairId, signal, failedCoin, failedError) {
    if (!this._legFailCounts) this._legFailCounts = {};
    this._legFailCounts[pairId] = (this._legFailCounts[pairId] || 0) + 1;

    if (failedCoin) {
      this._marginBlocked[pairId] = {
        coin: failedCoin,
        error: failedError,
        ts: Date.now(),
        count: this._legFailCounts[pairId],
      };
      this._logActivity('margin_fail', pairId, signal, 'no_margin', `${failedCoin}: ${failedError}`);
    }

    if (this._legFailCounts[pairId] >= 10) {
      console.error(`${this._logPrefix} AUTO-DISABLE ${pairId}: ${this._legFailCounts[pairId]} consecutive fill failures`);
      delete this.enabledPairs[pairId];
      this._persistConfig();
      this._startMarginRecoveryCheck(pairId);
    }
  }

  _resetLegFailure(pairId) {
    if (!this._legFailCounts) this._legFailCounts = {};
    if (this._marginBlocked[pairId] && this._legFailCounts[pairId] > 0) {
      const mb = this._marginBlocked[pairId];
      const downMs = Date.now() - mb.ts;
      const downStr = downMs > 60000 ? `${(downMs / 60000).toFixed(1)}min` : `${(downMs / 1000).toFixed(0)}s`;
      this._logActivity('margin_ok', pairId, null, 'margin_restored', `${mb.coin}: restored after ${downStr}`);
      delete this._marginBlocked[pairId];
    }
    this._legFailCounts[pairId] = 0;
  }

  _startMarginRecoveryCheck(pairId) {
    if (!this._marginRecoveryTimers) this._marginRecoveryTimers = {};
    if (this._marginRecoveryTimers[pairId]) clearInterval(this._marginRecoveryTimers[pairId]);

    const checkInterval = 30000;
    let checkCount = 0;
    const maxChecks = 120;
    const mb = this._marginBlocked[pairId];
    const blockedCoin = mb?.coin || '';
    const deployer = blockedCoin.split(':')[0];

    this._marginRecoveryTimers[pairId] = setInterval(async () => {
      checkCount++;
      if (checkCount > maxChecks) {
        clearInterval(this._marginRecoveryTimers[pairId]);
        delete this._marginRecoveryTimers[pairId];
        return;
      }
      if (!this._marginBlocked[pairId]) {
        clearInterval(this._marginRecoveryTimers[pairId]);
        delete this._marginRecoveryTimers[pairId];
        return;
      }
      try {
        const res = await hlApiModule.fetchHL('https://api.hyperliquid.xyz/info', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'clearinghouseState', user: this._hlApi.getActiveAddress() || this._activeAddress, dex: deployer }),
        });
        const data = await res.json();
        const marginAvail = parseFloat(data?.crossMarginSummary?.availableBalance || data?.marginSummary?.availableMargin || '0');
        if (marginAvail > 1) {
          delete this._marginBlocked[pairId];
          this._legFailCounts[pairId] = 0;
          this.enabledPairs[pairId] = true;
          this._persistConfig();
          clearInterval(this._marginRecoveryTimers[pairId]);
          delete this._marginRecoveryTimers[pairId];
        }
      } catch (e) {}
    }, checkInterval);
  }

  _persistConfig() {
    saveBotConfig(this._cfgKey('bot_enabled'), this.enabled);
    saveBotConfig(this._cfgKey('enabled_pairs'), Object.keys(this.enabledPairs).filter(p => this.enabledPairs[p]));
  }

  _recordCloseLatency(latencyMs, pairId) {
    this._closeLatencyRing.push({ ms: latencyMs, pairId, ts: Date.now() });
    if (this._closeLatencyRing.length > this._closeLatencyRingMax) this._closeLatencyRing.shift();
  }

  getCloseLatencyStats() {
    const ring = this._closeLatencyRing;
    if (ring.length === 0) return { count: 0, avg: null, p50: null, p95: null, min: null, max: null, last: null };
    const vals = ring.map(e => e.ms).sort((a, b) => a - b);
    const n = vals.length;
    return {
      count: n,
      avg: Math.round(vals.reduce((s, v) => s + v, 0) / n),
      p50: vals[Math.min(Math.floor(n * 0.5), n - 1)],
      p95: vals[Math.min(Math.floor(n * 0.95), n - 1)],
      min: vals[0],
      max: vals[n - 1],
      last: ring[n - 1].ms,
    };
  }

  _getExecTimeStats() {
    const ring = this._execTimeRing;
    if (ring.length === 0) return { last: null, avg: null, min: null, max: null, p50: null, count: 0 };
    const sorted = [...ring].sort((a, b) => a - b);
    const n = sorted.length;
    return {
      last: ring[ring.length - 1],
      avg: Math.round(sorted.reduce((s, v) => s + v, 0) / n),
      min: sorted[0],
      max: sorted[n - 1],
      p50: sorted[Math.min(Math.floor(n * 0.5), n - 1)],
      count: n,
    };
  }

  async _refreshFundingPayments() {
    const now = Date.now();
    if (now - this._fundingCache.lastFetchMs < this._fundingCacheTtlMs) return;
    try {
      const startTime = this._sessionStartMs;
      const entries = await this._hlApi.getUserFunding(null, startTime);
      const byDexCoin = {};
      for (const e of entries) {
        const coin = e.delta?.coin;
        if (!coin) continue;
        if (!byDexCoin[coin]) byDexCoin[coin] = [];
        byDexCoin[coin].push({
          time: e.time,
          usdc: parseFloat(e.delta.usdc) || 0,
          szi: parseFloat(e.delta.szi) || 0,
          rate: parseFloat(e.delta.fundingRate) || 0,
        });
      }
      this._fundingCache = { entries, byDexCoin, lastFetchMs: now };
    } catch (err) {
      console.error(`${this._logPrefix}[FundingCache] Refresh error:`, err.message);
    }
  }

  getTotalWalletFunding() {
    let total = 0;
    for (const coin in this._fundingCache.byDexCoin) {
      for (const e of this._fundingCache.byDexCoin[coin]) total += e.usdc;
    }
    return total;
  }

  async updateConfig(updates) {
    let paramsChanged = false;
    if (updates.maxGlobalPositions !== undefined) { this.maxGlobalPositions = updates.maxGlobalPositions; paramsChanged = true; }
    if (updates.maxPositionUsd !== undefined) { this.maxPositionUsd = updates.maxPositionUsd; paramsChanged = true; }
    if (updates.positionSizeUsd !== undefined) { this.positionSizeUsd = updates.positionSizeUsd; paramsChanged = true; }
    if (updates.maxLeverage !== undefined) {
      this.maxLeverage = updates.maxLeverage;
      this._leverageSet = {};
      paramsChanged = true;
    }
    if (updates.stopLossBps !== undefined) { this.stopLossBps = updates.stopLossBps; paramsChanged = true; }
    if (updates.maxLossBps !== undefined) { this.maxLossBps = updates.maxLossBps; paramsChanged = true; }
    if (updates.closeBufferBps !== undefined) { this.closeBufferBps = Math.max(0, Math.min(20, parseFloat(updates.closeBufferBps) || 1)); paramsChanged = true; }
    if (updates.marginBps !== undefined) { this.marginBps = updates.marginBps; paramsChanged = true; }
    if (updates.minDeployerCollateralUsd !== undefined) { this.minDeployerCollateralUsd = updates.minDeployerCollateralUsd; paramsChanged = true; }
    if (updates.growthFeeOverride !== undefined) {
      if (updates.growthFeeOverride === null || updates.growthFeeOverride === '' || updates.growthFeeOverride === 0) {
        this._growthFeeOverride = null;
        this._takerFeeGrowth = this._crossRate * this._growthMultiplier;
      } else {
        this._growthFeeOverride = parseFloat(updates.growthFeeOverride);
        this._takerFeeGrowth = this._growthFeeOverride;
      }
      this._feeRoundTripBps = 2 * this._takerFeeGrowth * 10000;
      paramsChanged = true;
    }
    if (updates.p50Mode !== undefined || updates.entryMode !== undefined) {
      const raw = updates.entryMode || updates.p50Mode;
      const validModes = ['zscore', 'ou', 'kalman', 'ewma'];
      if (validModes.includes(raw)) {
        this.p50Mode = raw;
        paramsChanged = true;
      }
    }
    if (updates.bufferBps !== undefined) { this.bufferBps = Math.max(0, Math.min(20, parseFloat(updates.bufferBps) || 0)); paramsChanged = true; }
    if (updates.slippageMarginBps !== undefined) { this.slippageMarginBps = Math.max(0, Math.min(20, parseFloat(updates.slippageMarginBps) || 0)); paramsChanged = true; }
    if (updates.dataTimer !== undefined) {
      const validTimers = ['1m', '5m', '15m', '30m', '1h', '6h', '12h', '24h', 'week', 'weekend'];
      if (validTimers.includes(updates.dataTimer)) { this.dataTimer = updates.dataTimer; paramsChanged = true; }
    }
    if (updates.zMeanRevert !== undefined) { this.zMeanRevert = !!updates.zMeanRevert; paramsChanged = true; }
    if (updates.zThreshold !== undefined) { this.zThreshold = Math.max(0.5, Math.min(5.0, parseFloat(updates.zThreshold) || 2.0)); paramsChanged = true; }
    if (updates.zWindowSec !== undefined) { this.zWindowSec = Math.max(10, Math.min(300, parseInt(updates.zWindowSec) || 60)); paramsChanged = true; }
    if (updates.zKalmanSensitivity !== undefined && ['fast', 'normal', 'slow'].includes(updates.zKalmanSensitivity)) { this.zKalmanSensitivity = updates.zKalmanSensitivity; paramsChanged = true; }
    if (updates.minHoldMs !== undefined) { this.minHoldMs = Math.max(1000, Math.min(30000, parseInt(updates.minHoldMs) || 3000)); paramsChanged = true; }
    if (updates.realtimeWindowMin !== undefined) {
      const mins = parseFloat(updates.realtimeWindowMin);
      if (mins >= 1 && mins <= 60) { this._realtimeWindowMs = mins * 60000; paramsChanged = true; }
    }
    if (updates.stableTargets !== undefined && typeof updates.stableTargets === 'object') {
      const t = updates.stableTargets;
      const sum = (t.usdc || 0) + (t.usdt || 0) + (t.usdh || 0);
      if (sum > 0.95 && sum < 1.05) { this._stableTargets = { usdc: t.usdc || 0, usdt: t.usdt || 0, usdh: t.usdh || 0 }; paramsChanged = true; }
    }
    if (updates.driftThreshold !== undefined) {
      const dt = parseFloat(updates.driftThreshold);
      if (dt >= 0.01 && dt <= 0.5) { this._driftThreshold = dt; paramsChanged = true; }
    }
    if (updates.alertWebhookUrl !== undefined) { this._alertWebhookUrl = updates.alertWebhookUrl || ''; paramsChanged = true; }
    if (updates.intraRebalanceIntervalSec !== undefined) {
      this._intraRebalanceIntervalSec = Math.max(30, Math.min(300, parseInt(updates.intraRebalanceIntervalSec) || 60));
      this._restartRebalancerTimer();
      paramsChanged = true;
    }
    if (updates.intraRebalanceCooldownSec !== undefined) { this._intraRebalanceCooldownSec = Math.max(60, Math.min(600, parseInt(updates.intraRebalanceCooldownSec) || 180)); paramsChanged = true; }
    if (updates.dryThresholdPct !== undefined) { this._dryThresholdPct = Math.max(1, Math.min(20, parseFloat(updates.dryThresholdPct) || 5)); paramsChanged = true; }
    if (updates.donateThresholdPct !== undefined) { this._donateThresholdPct = Math.max(5, Math.min(30, parseFloat(updates.donateThresholdPct) || 10)); paramsChanged = true; }
    if (updates.atoEnabled !== undefined) { this.atoEnabled = !!updates.atoEnabled; paramsChanged = true; }
    if (updates.tiersEnabled !== undefined) { this.tiersEnabled = !!updates.tiersEnabled; paramsChanged = true; }
    if (paramsChanged) {
      saveBotConfig(this._cfgKey('bot_params'), {
        maxGlobalPositions: this.maxGlobalPositions,
        maxPositionUsd: this.maxPositionUsd,
        positionSizeUsd: this.positionSizeUsd,
        maxLeverage: this.maxLeverage,
        stopLossBps: this.stopLossBps,
        maxLossBps: this.maxLossBps,
        closeBufferBps: this.closeBufferBps,
        marginBps: this.marginBps,
        p50Mode: this.p50Mode,
        bufferBps: this.bufferBps,
        slippageMarginBps: this.slippageMarginBps,
        dataTimer: this.dataTimer,
        zMeanRevert: this.zMeanRevert,
        minDeployerCollateralUsd: this.minDeployerCollateralUsd,
        growthFeeOverride: this._growthFeeOverride,
        realtimeWindowMin: this._realtimeWindowMs / 60000,
        stableTargets: this._stableTargets,
        driftThreshold: this._driftThreshold,
        intraRebalanceIntervalSec: this._intraRebalanceIntervalSec,
        intraRebalanceCooldownSec: this._intraRebalanceCooldownSec,
        dryThresholdPct: this._dryThresholdPct,
        donateThresholdPct: this._donateThresholdPct,
        atoEnabled: this.atoEnabled,
        zThreshold: this.zThreshold,
        zWindowSec: this.zWindowSec,
        zKalmanSensitivity: this.zKalmanSensitivity,
        minHoldMs: this.minHoldMs,
        alertWebhookUrl: this._alertWebhookUrl,
        tiersEnabled: this.tiersEnabled,
        pairZThresholds: this._pairZThresholds,
        pairBufferBps: this._pairBufferBps,
      });
      console.log(`${this._logPrefix} Updated bot params: maxGlobal=${this.maxGlobalPositions}, maxPosUsd=$${this.maxPositionUsd}, maxLev=${this.maxLeverage}x, SL=${this.stopLossBps}bps, maxLoss=${this.maxLossBps}bps, closeBuffer=${this.closeBufferBps}bps, mode=${this.p50Mode}, minHoldMs=${this.minHoldMs}, tiersEnabled=${this.tiersEnabled}`);
    }
  }

  setPairOverrides(pairId, overrides) {
    let changed = false;
    if (overrides.zThreshold !== undefined) {
      const z = parseFloat(overrides.zThreshold);
      if (z === 0 || isNaN(z)) { delete this._pairZThresholds[pairId]; }
      else { this._pairZThresholds[pairId] = Math.max(0.1, Math.min(5.0, z)); }
      changed = true;
    }
    if (overrides.bufferBps !== undefined) {
      const b = parseFloat(overrides.bufferBps);
      if (b === 0 || isNaN(b)) { delete this._pairBufferBps[pairId]; }
      else { this._pairBufferBps[pairId] = Math.max(0, Math.min(20, b)); }
      changed = true;
    }
    if (changed) {
      saveBotConfig(this._cfgKey('bot_params'), {
        pairZThresholds: this._pairZThresholds,
        pairBufferBps: this._pairBufferBps,
      }).catch(e => console.error(`${this._logPrefix} savePairOverrides error:`, e.message));
      console.log(`${this._logPrefix} Pair overrides updated for ${pairId}: Z=${this._pairZThresholds[pairId] ?? 'global'}, Buf=${this._pairBufferBps[pairId] ?? 'global'}`);
    }
    return { ok: true, pairId, zThreshold: this._pairZThresholds[pairId] ?? null, bufferBps: this._pairBufferBps[pairId] ?? null };
  }

  getPairOverrides() {
    return { pairZThresholds: this._pairZThresholds, pairBufferBps: this._pairBufferBps };
  }
}

module.exports = { ExecutionEngine };
