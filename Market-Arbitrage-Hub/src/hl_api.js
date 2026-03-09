const { Hyperliquid } = require('hyperliquid');
const { ethers } = require('ethers');

const _rlState = {
  active: 0,
  maxConcurrent: 6,
  minIntervalMs: 80,
  lastSentTs: 0,
  queue: [],
};

function _rlAcquire() {
  return new Promise(resolve => {
    const tryRun = () => {
      const now = Date.now();
      const timeSinceLast = now - _rlState.lastSentTs;
      if (_rlState.active < _rlState.maxConcurrent && timeSinceLast >= _rlState.minIntervalMs) {
        _rlState.active++;
        _rlState.lastSentTs = Date.now();
        resolve();
      } else {
        const wait = Math.max(_rlState.minIntervalMs - timeSinceLast, 10);
        setTimeout(tryRun, wait);
      }
    };
    tryRun();
  });
}

function _rlRelease() {
  _rlState.active--;
  if (_rlState.active < 0) _rlState.active = 0;
}

async function fetchHL(url, options = {}) {
  const timeoutMs = options.timeoutMs || 10000;
  const maxRetries = options.retries ?? 3;
  const { timeoutMs: _, retries: __, ...fetchOptions } = options;
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    await _rlAcquire();
    let res;
    try {
      res = await fetch(url, {
        ...fetchOptions,
        signal: options.signal || AbortSignal.timeout(timeoutMs),
        headers: {
          ...(options.headers || {}),
          'Connection': 'keep-alive',
        },
      });
    } catch (err) {
      _rlRelease();
      lastErr = err;
      if (attempt < maxRetries) {
        const delay = Math.min(3000 * Math.pow(2, attempt), 15000);
        console.warn(`[fetchHL] ${err.message}, retry ${attempt + 1}/${maxRetries} in ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
      }
      continue;
    }
    _rlRelease();
    if (res.status === 429 || res.status >= 500) {
      lastErr = new Error(`HTTP ${res.status}`);
      if (attempt < maxRetries) {
        const delay = Math.min(3000 * Math.pow(2, attempt), 15000);
        console.warn(`[fetchHL] HTTP ${res.status}, retry ${attempt + 1}/${maxRetries} in ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw lastErr;
    }
    return res;
  }
  throw lastErr;
}

const deployerAssetMap = new Map();
const deployerSzDecimals = {};
const deployerMaxLeverage = {};
const deployerGrowthMode = {};
let deployerPerpsLoaded = false;

async function loadDeployerPerps() {
  if (deployerPerpsLoaded) return;
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await _loadDeployerPerpsInner();
      return;
    } catch (err) {
      console.error(`[HL_API] loadDeployerPerps attempt ${attempt}/${maxAttempts} failed: ${err.message}`);
      if (attempt < maxAttempts) {
        const delay = Math.min(5000 * attempt, 20000);
        console.warn(`[HL_API] Retrying in ${delay / 1000}s...`);
        await new Promise(r => setTimeout(r, delay));
      } else {
        console.error(`[HL_API] loadDeployerPerps failed after ${maxAttempts} attempts — bot will start without deployer perps`);
      }
    }
  }
}

async function _loadDeployerPerpsInner() {
  const infoUrl = 'https://api.hyperliquid.xyz/info';

  const dexsRes = await fetchHL(infoUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'perpDexs' }),
    timeoutMs: 15000,
  });
  const dexs = await dexsRes.json();

  const builderDexes = [];
  for (let i = 1; i < dexs.length; i++) {
    if (dexs[i] && dexs[i].name) {
      const offset = 110000 + (i - 1) * 10000;
      builderDexes.push({ name: dexs[i].name, offset });
    }
  }

  console.log(`[HL_API] Found ${builderDexes.length} builder perpDexes: ${builderDexes.map(d => d.name + '@' + d.offset).join(', ')}`);

  for (const dex of builderDexes) {
    try {
      const metaRes = await fetchHL(infoUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'meta', dex: dex.name }),
        timeoutMs: 15000,
      });
      const meta = await metaRes.json();
      for (let j = 0; j < meta.universe.length; j++) {
        const asset = meta.universe[j];
        const coinName = asset.name.includes(':') ? asset.name : `${dex.name}:${asset.name}`;
        const idx = dex.offset + j;
        deployerAssetMap.set(coinName, idx);
        if (asset.szDecimals !== undefined) deployerSzDecimals[coinName] = asset.szDecimals;
        if (asset.maxLeverage) deployerMaxLeverage[coinName] = asset.maxLeverage;
        deployerGrowthMode[coinName] = asset.growthMode === 'enabled';
      }
    } catch (e) {
      console.error(`[HL_API] Error loading meta for ${dex.name}:`, e.message);
    }
  }

  console.log(`[HL_API] Loaded ${deployerAssetMap.size} deployer perp asset indices`);
  deployerPerpsLoaded = true;
}

async function patchSdkForDeployerPerps(sdk) {
  const sc = sdk.exchange.symbolConversion;
  if (sc && sc.assetToIndexMap) {
    if (sc.ensureInitialized) {
      await sc.ensureInitialized();
    }
    let injected = 0;
    for (const [coin, idx] of deployerAssetMap) {
      sc.assetToIndexMap.set(coin, idx);
      injected++;
    }
    const origEnsure = sc.ensureInitialized?.bind(sc);
    if (origEnsure) {
      sc.ensureInitialized = async function() {
        await origEnsure();
        for (const [coin, idx] of deployerAssetMap) {
          sc.assetToIndexMap.set(coin, idx);
        }
      };
    }
    if (sc.getAssetIndex) {
      const origGetAssetIndex = sc.getAssetIndex.bind(sc);
      sc.getAssetIndex = function(coin) {
        if (deployerAssetMap.has(coin)) return deployerAssetMap.get(coin);
        return origGetAssetIndex(coin);
      };
    }
    console.log(`[HL_API] Injected ${injected} deployer perps into SDK assetToIndexMap + getAssetIndex hook`);
  } else {
    console.error('[HL_API] CRITICAL: Cannot inject deployer perps — symbolConversion.assetToIndexMap not found');
    const exchange = sdk.exchange;
    const originalGetAssetIndex = exchange.getAssetIndex.bind(exchange);
    exchange.getAssetIndex = async function(coin) {
      if (deployerAssetMap.has(coin)) {
        return deployerAssetMap.get(coin);
      }
      return originalGetAssetIndex(coin);
    };
  }
}

function getSzDecimals(coin) {
  if (deployerSzDecimals[coin] !== undefined) return deployerSzDecimals[coin];
  return 4;
}

function roundSize(coin, size) {
  const dec = getSzDecimals(coin);
  const factor = Math.pow(10, dec);
  return Math.floor(size * factor) / factor;
}

function roundPrice(coin, price) {
  const dec = getSzDecimals(coin);
  const priceDec = Math.max(6 - dec, 0);
  return parseFloat(parseFloat(price.toPrecision(5)).toFixed(priceDec));
}

function getMaxLeverage(coin) {
  return deployerMaxLeverage[coin] || 20;
}

class HyperliquidAPI {
  constructor(privateKey, label = 'default', vaultAddress = null) {
    this._privateKey = privateKey;
    this._label = label;
    this._vaultAddress = vaultAddress || null;
    this._sdk = null;
    this._walletAddress = null;
    this._latencyRing = [];
    this._latencyRingMax = 50;
    this._latencyStats = { last: null, min: null, max: null, avg: null, count: 0, p50: null, p95: null };
  }

  _recordLatency(ms) {
    this._latencyRing.push(ms);
    if (this._latencyRing.length > this._latencyRingMax) this._latencyRing.shift();
    const sorted = [...this._latencyRing].sort((a, b) => a - b);
    const n = sorted.length;
    this._latencyStats = {
      last: ms,
      min: sorted[0],
      max: sorted[n - 1],
      avg: Math.round(sorted.reduce((s, v) => s + v, 0) / n),
      count: n,
      totalCount: (this._latencyStats.totalCount || 0) + 1,
      p50: sorted[Math.min(Math.floor(n * 0.5), n - 1)],
      p95: sorted[Math.min(Math.floor(n * 0.95), n - 1)],
    };
  }

  getLatencyStats() {
    return { ...this._latencyStats };
  }

  isConfigured() {
    return !!this._privateKey;
  }

  async pingLatency() {
    const t0 = Date.now();
    try {
      await fetchHL('https://api.hyperliquid.xyz/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'meta' }),
        timeoutMs: 5000,
      });
      return Date.now() - t0;
    } catch {
      return null;
    }
  }

  async init() {
    if (this._sdk) return this._sdk;
    if (!this._privateKey) throw new Error('Private key not set');

    const wallet = new ethers.Wallet(this._privateKey);
    this._walletAddress = wallet.address;

    const sdkOpts = {
      privateKey: this._privateKey,
      testnet: false,
      enableWs: false,
    };
    if (this._vaultAddress) {
      sdkOpts.vaultAddress = this._vaultAddress;
    }
    this._sdk = new Hyperliquid(sdkOpts);

    await this._sdk.connect();
    await loadDeployerPerps();
    await patchSdkForDeployerPerps(this._sdk);

    const activeAddr = this._vaultAddress || this._walletAddress;
    console.log(`[HL_API:${this._label}] Initialized. Wallet: ${this._walletAddress}${this._vaultAddress ? ` | Sub-account: ${this._vaultAddress}` : ''}`);
    return this._sdk;
  }

  async reinit(newPrivateKey, newVaultAddress) {
    this._sdk = null;
    this._walletAddress = null;
    this._privateKey = newPrivateKey;
    if (newVaultAddress !== undefined) this._vaultAddress = newVaultAddress || null;
    return this.init();
  }

  getActiveAddress() {
    return this._vaultAddress || this._walletAddress;
  }

  getVaultAddress() {
    return this._vaultAddress;
  }

  setVaultAddress(addr) {
    this._vaultAddress = addr || null;
    this._sdk = null;
  }

  getPrivateKeyMasked() {
    if (!this._privateKey) return '';
    const k = this._privateKey;
    if (k.length <= 10) return '****';
    return k.slice(0, 6) + '...' + k.slice(-4);
  }

  async getWalletAddress() {
    if (!this._sdk) await this.init();
    return this._walletAddress;
  }

  async placeMarketOrder(coin, isBuy, size, slippagePct = 0.005, reduceOnly = false) {
    if (!this._sdk) await this.init();

    const book = await this._sdk.info.getL2Book(coin);
    const levels = isBuy ? book.levels[1] : book.levels[0];
    if (!levels || levels.length === 0) {
      throw new Error(`No ${isBuy ? 'asks' : 'bids'} for ${coin}`);
    }

    const slippageMult = isBuy ? (1 + slippagePct) : (1 - slippagePct);
    const bestPrice = parseFloat(levels[0].px);
    const limitPx = roundPrice(coin, bestPrice * slippageMult);
    const roundedSz = roundSize(coin, size);

    const t0 = Date.now();
    const result = await this._sdk.exchange.placeOrder({
      coin,
      is_buy: isBuy,
      sz: roundedSz,
      limit_px: limitPx,
      order_type: { limit: { tif: 'Ioc' } },
      reduce_only: reduceOnly,
    });
    this._recordLatency(Date.now() - t0);

    return result;
  }

  async placeMarketOrderFast(coin, isBuy, size, precomputedBestPx, slippagePct = 0.005) {
    if (!this._sdk) await this.init();

    let limitPx;
    if (precomputedBestPx && precomputedBestPx > 0) {
      const slippageMult = isBuy ? (1 + slippagePct) : (1 - slippagePct);
      limitPx = roundPrice(coin, precomputedBestPx * slippageMult);
    } else {
      const book = await this._sdk.info.getL2Book(coin);
      const levels = isBuy ? book.levels[1] : book.levels[0];
      if (!levels || levels.length === 0) {
        throw new Error(`No ${isBuy ? 'asks' : 'bids'} for ${coin}`);
      }
      const slippageMult = isBuy ? (1 + slippagePct) : (1 - slippagePct);
      limitPx = roundPrice(coin, parseFloat(levels[0].px) * slippageMult);
    }

    const roundedSz = roundSize(coin, size);

    const t0 = Date.now();
    const result = await this._sdk.exchange.placeOrder({
      coin,
      is_buy: isBuy,
      sz: roundedSz,
      limit_px: limitPx,
      order_type: { limit: { tif: 'Ioc' } },
      reduce_only: false,
    });
    this._recordLatency(Date.now() - t0);

    return result;
  }

  async placeOrderRaw(coin, isBuy, sz, limitPx) {
    const t0 = Date.now();
    const result = await this._sdk.exchange.placeOrder({
      coin,
      is_buy: isBuy,
      sz,
      limit_px: limitPx,
      order_type: { limit: { tif: 'Ioc' } },
      reduce_only: false,
    });
    this._recordLatency(Date.now() - t0);
    return result;
  }

  async placeBulkOrder(orders) {
    const t0 = Date.now();
    const orderReq = {
      orders: orders.map(o => ({
        coin: o.coin,
        is_buy: o.isBuy,
        sz: o.sz,
        limit_px: o.limitPx,
        order_type: { limit: { tif: 'Ioc' } },
        reduce_only: false,
      })),
      grouping: 'na',
    };
    const payload = await this._sdk.exchange.getOrderPayload(orderReq);
    try {
      const resp = await fetchHL('https://api.hyperliquid.xyz/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        timeoutMs: 8000,
      });
      const data = await resp.json();
      this._recordLatency(Date.now() - t0);
      return data;
    } catch (e) {
      if (e.name === 'AbortError' || e.name === 'TimeoutError') {
        throw new Error(`Bulk order timeout after ${Date.now() - t0}ms`);
      }
      throw e;
    }
  }

  async placeBulkOrderNative(orders) {
    if (!this._sdk) await this.init();
    const t0 = Date.now();
    try {
      const sdkOrders = orders.map(o => ({
        coin: o.coin,
        is_buy: o.isBuy,
        sz: o.sz,
        limit_px: o.limitPx,
        order_type: { limit: { tif: 'Ioc' } },
        reduce_only: o.reduceOnly || false,
      }));
      const result = await this._sdk.exchange.placeOrder({
        orders: sdkOrders,
        grouping: 'na',
      });
      const latencyMs = Date.now() - t0;
      this._recordLatency(latencyMs);
      console.log(`[HL_API:${this._label}] placeBulkOrderNative: ${orders.length} orders in ${latencyMs}ms`);
      if (result?.status === 'err') {
        const errMsg = typeof result.response === 'string' ? result.response : JSON.stringify(result.response);
        console.error(`[HL_API:${this._label}] placeBulkOrderNative API ERROR: ${errMsg}`);
        return orders.map(() => ({ status: 'api_error', fillPx: null, fillSz: 0, oid: null, error: errMsg }));
      }
      const statuses = result?.response?.data?.statuses || [];
      if (statuses.length === 0) {
        console.warn(`[HL_API:${this._label}] placeBulkOrderNative: EMPTY statuses! raw: ${JSON.stringify(result).slice(0, 500)}`);
      }
      return statuses.map((s, i) => {
        if (s.filled) {
          return { status: 'filled', fillPx: parseFloat(s.filled.avgPx), fillSz: parseFloat(s.filled.totalSz), oid: s.filled.oid, error: null };
        } else if (s.resting) {
          return { status: 'resting', fillPx: null, fillSz: 0, oid: s.resting.oid, error: null };
        } else if (s.error) {
          return { status: 'error', fillPx: null, fillSz: 0, oid: null, error: s.error };
        }
        return { status: 'unknown', fillPx: null, fillSz: 0, oid: null, error: JSON.stringify(s) };
      });
    } catch (e) {
      const latencyMs = Date.now() - t0;
      this._recordLatency(latencyMs);
      console.log(`[HL_API:${this._label}] placeBulkOrderNative: SDK error after ${latencyMs}ms: ${e.message}`);
      return orders.map(() => ({ status: 'sdk_error', fillPx: null, fillSz: 0, oid: null, error: e.message }));
    }
  }

  async placeLimitOrder(coin, isBuy, size, price, tif = 'Gtc') {
    if (!this._sdk) await this.init();

    const roundedSz = roundSize(coin, size);
    const roundedPx = roundPrice(coin, price);

    const result = await this._sdk.exchange.placeOrder({
      coin,
      is_buy: isBuy,
      sz: roundedSz,
      limit_px: roundedPx,
      order_type: { limit: { tif } },
      reduce_only: false,
    });

    return result;
  }

  async updateLeverage(coin, leverage) {
    if (!this._sdk) await this.init();
    const lev = Math.min(leverage, getMaxLeverage(coin));
    try {
      await this._sdk.exchange.updateLeverage(coin, 'cross', lev);
      console.log(`[HL_API:${this._label}] Set leverage ${coin} = ${lev}x (max: ${getMaxLeverage(coin)}x)`);
      return lev;
    } catch (e) {
      console.error(`[HL_API:${this._label}] updateLeverage ${coin} error:`, e.message);
      return null;
    }
  }

  async cancelOrder(coin, oid) {
    if (!this._sdk) await this.init();
    return this._sdk.exchange.cancelOrder({ coin, o: oid });
  }

  async getOpenOrders() {
    if (!this._sdk) await this.init();
    return this._sdk.info.getUserOpenOrders(this.getActiveAddress());
  }

  async getUserFills(startTime) {
    if (!this._sdk) await this.init();
    const addr = this.getActiveAddress();
    if (startTime) {
      return this._sdk.info.getUserFillsByTime(addr, startTime);
    }
    return this._sdk.info.getUserFills(addr);
  }

  async getRecentFillsForCoins(coins, sinceMs) {
    if (!this._sdk) await this.init();
    const url = 'https://api.hyperliquid.xyz/info';
    const addr = this.getActiveAddress();
    const dexes = new Set();
    for (const c of coins) {
      const prefix = c.split(':')[0];
      if (prefix && prefix !== c) dexes.add(prefix);
    }
    if (dexes.size === 0) dexes.add('xyz');
    const allFills = [];
    const since = sinceMs || (Date.now() - 30000);
    await Promise.all([...dexes].map(async (dex) => {
      try {
        const res = await fetchHL(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'userFillsByTime', user: addr, startTime: since, dex }),
          timeoutMs: 8000,
        });
        if (!res.ok) return;
        const fills = await res.json();
        if (Array.isArray(fills)) {
          for (const f of fills) {
            const coin = f.coin?.includes(':') ? f.coin : `${dex}:${f.coin}`;
            allFills.push({ ...f, coin });
          }
        }
      } catch (e) {}
    }));
    return allFills;
  }

  async getL2Book(coin) {
    if (!this._sdk) await this.init();
    return this._sdk.info.getL2Book(coin);
  }

  async getAllMids() {
    if (!this._sdk) await this.init();
    return this._sdk.info.getAllMids();
  }

  async getBalances(address) {
    return getBalances(address);
  }

  async getDeployerPositions(address, dexFilter) {
    return getDeployerPositions(address, dexFilter);
  }

  async getUserFunding(walletAddress, startTimeMs) {
    return getUserFunding(walletAddress, startTimeMs);
  }

  getMaxLeverage(coin) {
    return getMaxLeverage(coin);
  }

  roundSize(coin, size) {
    return roundSize(coin, size);
  }

  roundPrice(coin, price) {
    return roundPrice(coin, price);
  }

  getSzDecimals(coin) {
    return getSzDecimals(coin);
  }

  async transferBetweenSpotAndPerp(usdc, toPerp) {
    if (!this._sdk) await this.init();
    return this._sdk.exchange.transferBetweenSpotAndPerp(usdc, toPerp);
  }

  _resolveSpotSymbol(coin) {
    const map = { USDT: '@268', USDT0: '@268', USDH: '@360' };
    const key = (coin || '').toUpperCase();
    const sym = map[key];
    if (!sym) throw new Error(`Unknown spot coin: ${coin} (supported: USDT, USDH)`);
    return sym;
  }

  async placeSpotMarketSell(coin, size) {
    if (!this._sdk) await this.init();
    const spotSymbol = this._resolveSpotSymbol(coin);
    const roundedSize = Math.floor(size * 100) / 100;
    if (roundedSize < 0.01) throw new Error(`Size too small for ${coin} (${spotSymbol}): ${roundedSize}`);
    console.log(`[HL_API:${this._label}] Spot sell ${roundedSize} ${coin} via ${spotSymbol}...`);
    const book = await this._sdk.info.getL2Book(spotSymbol);
    const bids = book?.levels?.[0];
    if (!bids || bids.length === 0) throw new Error(`No bids for ${coin} (${spotSymbol})`);
    const bestBid = parseFloat(bids[0].px);
    const limitPx = Math.round(bestBid * 0.995 * 1e8) / 1e8;
    const result = await this._sdk.exchange.placeOrder({
      coin: spotSymbol,
      is_buy: false,
      sz: roundedSize,
      limit_px: limitPx,
      order_type: { limit: { tif: 'Ioc' } },
      reduce_only: false,
    });
    return result;
  }

  async placeSpotMarketBuy(coin, usdcAmount) {
    if (!this._sdk) await this.init();
    const spotSymbol = this._resolveSpotSymbol(coin);
    console.log(`[HL_API:${this._label}] Spot buy ~$${usdcAmount} ${coin} via ${spotSymbol}...`);
    const book = await this._sdk.info.getL2Book(spotSymbol);
    const asks = book?.levels?.[1];
    if (!asks || asks.length === 0) throw new Error(`No asks for ${coin} (${spotSymbol})`);
    const bestAsk = parseFloat(asks[0].px);
    const limitPx = Math.round(bestAsk * 1.005 * 1e8) / 1e8;
    const size = Math.floor((usdcAmount / limitPx) * 100) / 100;
    if (size < 0.01) throw new Error(`Size too small for ${coin} (${spotSymbol}): ${size}`);
    const result = await this._sdk.exchange.placeOrder({
      coin: spotSymbol,
      is_buy: true,
      sz: size,
      limit_px: limitPx,
      order_type: { limit: { tif: 'Ioc' } },
      reduce_only: false,
    });
    return result;
  }

  async usdTransfer(destination, amount) {
    if (!this._sdk) await this.init();
    return this._sdk.exchange.usdTransfer(destination, amount);
  }

  async spotTransfer(destination, token, amount) {
    if (!this._sdk) await this.init();
    return this._sdk.exchange.spotTransfer(destination, token, amount.toString());
  }
}

async function getBalances(address) {
  const addr = address;
  if (!addr) throw new Error('getBalances: address required');
  const url = 'https://api.hyperliquid.xyz/info';

  const [perpRes, spotRes] = await Promise.all([
    fetchHL(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'clearinghouseState', user: addr }),
      timeoutMs: 8000,
    }),
    fetchHL(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'spotClearinghouseState', user: addr }),
      timeoutMs: 8000,
    }),
  ]);

  if (!perpRes.ok) throw new Error(`getBalances perp HTTP ${perpRes.status}`);
  if (!spotRes.ok) throw new Error(`getBalances spot HTTP ${spotRes.status}`);
  const perpData = await perpRes.json();
  const spotData = await spotRes.json();

  let usdc = parseFloat(perpData?.crossMarginSummary?.accountValue || perpData?.marginSummary?.accountValue || '0');

  let usdt = 0;
  let usdh = 0;
  if (spotData?.balances) {
    for (const b of spotData.balances) {
      const coin = (b.coin || '').toUpperCase();
      const total = parseFloat(b.total || '0');
      if (coin === 'USDT0' || coin === 'USDT') usdt = total;
      else if (coin === 'USDH') usdh = total;
      else if (coin === 'USDC' && total > 0) usdc += total;
    }
  }

  return { usdc, usdt, usdh, wallet: addr };
}

async function getDeployerPositions(address, dexFilter) {
  const addr = address || process.env.HL_WALLET_ADDRESS;
  if (!addr) {
    console.warn('[HL_API] getDeployerPositions: no address provided and HL_WALLET_ADDRESS not set');
    return {};
  }
  const url = 'https://api.hyperliquid.xyz/info';
  const positions = {};
  const _failedDexes = new Set();
  const _succeededDexes = new Set();
  const dexNames = dexFilter && dexFilter.length > 0 ? dexFilter : ['xyz', 'flx', 'km', 'cash', 'vntl', 'hyna', 'abcd'];
  await Promise.all(dexNames.map(async (dex) => {
    try {
      const res = await fetchHL(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'clearinghouseState', user: addr, dex }),
        timeoutMs: 8000,
      });
      if (!res.ok) {
        console.error(`[HL_API] getDeployerPositions: ${dex} HTTP ${res.status}`);
        _failedDexes.add(dex);
        return;
      }
      const data = await res.json();
      _succeededDexes.add(dex);
      if (data?.assetPositions) {
        for (const ap of data.assetPositions) {
          const p = ap.position;
          const szi = parseFloat(p.szi || 0);
          if (szi !== 0) {
            const coin = p.coin.includes(':') ? p.coin : `${dex}:${p.coin}`;
            positions[coin] = { size: szi, entryPx: parseFloat(p.entryPx || 0), coin };
          }
        }
      } else {
        console.warn(`[HL_API] getDeployerPositions: ${dex} HTTP 200 but no assetPositions in response`);
        _failedDexes.add(dex);
        _succeededDexes.delete(dex);
      }
    } catch (e) {
      console.error(`[HL_API] getDeployerPositions: ${dex} error: ${e.message}`);
      _failedDexes.add(dex);
    }
  }));
  positions._failedDexes = _failedDexes;
  positions._succeededDexes = _succeededDexes;
  return positions;
}

async function getUserFees(walletAddress) {
  const url = 'https://api.hyperliquid.xyz/info';
  const res = await fetchHL(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'userFees', user: walletAddress }),
    timeoutMs: 8000,
  });
  if (!res.ok) throw new Error(`getUserFees HTTP ${res.status}`);
  return res.json();
}

async function getUserFunding(walletAddress, startTimeMs) {
  const addr = walletAddress || process.env.HL_WALLET_ADDRESS;
  if (!addr) {
    console.warn('[HL_API] getUserFunding: no address provided and HL_WALLET_ADDRESS not set');
    return [];
  }
  const infoUrl = 'https://api.hyperliquid.xyz/info';
  const res = await fetchHL(infoUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'userFunding', user: addr, startTime: startTimeMs }),
    timeoutMs: 15000,
  });
  if (!res.ok) throw new Error(`getUserFunding HTTP ${res.status}`);
  return res.json();
}

async function getFundingRates(dexNames) {
  const infoUrl = 'https://api.hyperliquid.xyz/info';
  const rates = {};
  await Promise.all(dexNames.map(async (dex) => {
    try {
      const res = await fetchHL(infoUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'metaAndAssetCtxs', dex }),
        timeoutMs: 8000,
      });
      const [meta, ctxs] = await res.json();
      for (let i = 0; i < meta.universe.length; i++) {
        const coin = meta.universe[i].name;
        const rate = parseFloat(ctxs[i]?.funding || 0);
        rates[`${dex}:${coin}`] = rate;
        if (rates[coin] === undefined) rates[coin] = rate;
      }
    } catch (e) {}
  }));
  return rates;
}

let defaultInstance = null;
function getDefaultInstance() {
  if (!defaultInstance && process.env.HL_PRIVATE_KEY) {
    defaultInstance = new HyperliquidAPI(process.env.HL_PRIVATE_KEY, 'bot1', process.env.HL_VAULT_ADDRESS || null);
  }
  return defaultInstance;
}

function createInstance(privateKey, label, vaultAddress = null) {
  return new HyperliquidAPI(privateKey, label, vaultAddress);
}

const legacyProxy = {
  isConfigured: () => !!process.env.HL_PRIVATE_KEY,
  init: async () => { const i = getDefaultInstance(); return i ? i.init() : null; },
  getWalletAddress: async () => { const i = getDefaultInstance(); return i ? i.getWalletAddress() : null; },
  placeMarketOrder: async (...args) => { const i = getDefaultInstance(); return i.placeMarketOrder(...args); },
  placeMarketOrderFast: async (...args) => { const i = getDefaultInstance(); return i.placeMarketOrderFast(...args); },
  placeOrderRaw: async (...args) => { const i = getDefaultInstance(); return i.placeOrderRaw(...args); },
  placeBulkOrder: async (...args) => { const i = getDefaultInstance(); return i.placeBulkOrder(...args); },
  placeBulkOrderNative: async (...args) => { const i = getDefaultInstance(); return i.placeBulkOrderNative(...args); },
  placeLimitOrder: async (...args) => { const i = getDefaultInstance(); return i.placeLimitOrder(...args); },
  cancelOrder: async (...args) => { const i = getDefaultInstance(); return i.cancelOrder(...args); },
  getOpenOrders: async () => { const i = getDefaultInstance(); return i.getOpenOrders(); },
  getUserFills: async (...args) => { const i = getDefaultInstance(); return i.getUserFills(...args); },
  getRecentFillsForCoins: async (...args) => { const i = getDefaultInstance(); return i.getRecentFillsForCoins(...args); },
  getL2Book: async (...args) => { const i = getDefaultInstance(); return i.getL2Book(...args); },
  getAllMids: async () => { const i = getDefaultInstance(); return i.getAllMids(); },
  getBalances,
  getDeployerPositions,
  getUserFees,
  getSzDecimals,
  roundSize,
  roundPrice,
  getMaxLeverage,
  getGrowthMode: (coin) => deployerGrowthMode[coin] !== undefined ? deployerGrowthMode[coin] : true,
  getAllGrowthModes: () => ({ ...deployerGrowthMode }),
  updateLeverage: async (coin, leverage) => { const i = getDefaultInstance(); return i.updateLeverage(coin, leverage); },
  getFundingRates,
  getUserFunding,
  getPrivateKeyMasked: () => { const i = getDefaultInstance(); return i ? i.getPrivateKeyMasked() : ''; },
};

async function getPerpDexs(includeMainline = false) {
  const infoUrl = 'https://api.hyperliquid.xyz/info';
  const res = await fetchHL(infoUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'perpDexs' }),
    timeoutMs: 15000,
  });
  const dexs = await res.json();
  const result = dexs.filter((d, i) => i > 0 && d && d.name).map(d => ({ name: d.name }));
  if (includeMainline) {
    result.unshift({ name: '', isMainline: true });
  }
  return result;
}

async function getMainlineMeta() {
  const infoUrl = 'https://api.hyperliquid.xyz/info';
  const res = await fetchHL(infoUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'meta' }),
    timeoutMs: 15000,
  });
  return await res.json();
}

async function getDexMeta(dexName) {
  const infoUrl = 'https://api.hyperliquid.xyz/info';
  const res = await fetchHL(infoUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'meta', dex: dexName }),
    timeoutMs: 15000,
  });
  return await res.json();
}

module.exports = {
  ...legacyProxy,
  HyperliquidAPI,
  createInstance,
  getDefaultInstance,
  loadDeployerPerps,
  fetchHL,
  getPerpDexs,
  getDexMeta,
  getMainlineMeta,
};
