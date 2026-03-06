const path = require('path');
const fs = require('fs');
const db = require('../database');
const { HyperliquidWS } = require('./websocket');
const { OrderbookManager } = require('./orderbook');
const { computeSpread } = require('./spread-calculator');
const { updateStats } = require('./stats-engine');
const { discoverPairs, groupPairsByUnderlying } = require('./pair-discovery');

let activePairs = [];
let config = {};
let wsClient = null;
let orderbookManager = null;
let statsInterval = null;
let cleanupInterval = null;
let lastObservationTime = new Map();

// In-memory latest spreads for SSE
const latestSpreads = new Map();

function getLatestSpreads() {
  return latestSpreads;
}

function getConnectionStatus() {
  return wsClient ? wsClient.isConnected() : false;
}

function getActivePairs() {
  return activePairs;
}

function getConfig() {
  return config;
}

function onBookUpdate(msg) {
  const coin = msg.data.coin;
  const levels = msg.data.levels;

  const book = orderbookManager.update(coin, levels);
  if (!book) return;

  const now = Date.now();
  const throttleMs = config.observation_throttle_ms || 500;
  const minExecSize = config.min_executable_size || 1.0;

  for (const pair of activePairs) {
    if (pair.asset_a !== coin && pair.asset_b !== coin) continue;

    const bookA = orderbookManager.get(pair.asset_a);
    const bookB = orderbookManager.get(pair.asset_b);

    if (!bookA || !bookB) continue;

    const pairKey = `${pair.asset_a}|${pair.asset_b}`;
    const lastTime = lastObservationTime.get(pairKey) || 0;

    if (now - lastTime < throttleMs) continue;

    const spread = computeSpread(bookA, bookB, minExecSize);
    if (!spread) continue;

    lastObservationTime.set(pairKey, now);

    const observation = {
      timestamp: now,
      pair_a: pair.asset_a,
      pair_b: pair.asset_b,
      ...spread
    };

    db.insertObservation(observation);

    latestSpreads.set(pairKey, {
      ...observation,
      label: pair.label
    });
  }
}

async function start(cfg) {
  config = cfg;

  // Initialize database
  const dbPath = path.resolve(config.database_path || 'data/spreads.db');
  db.initDatabase(dbPath);

  // Run cleanup on startup
  db.runCleanup();

  // Discover pairs
  const discovery = await discoverPairs(config);
  activePairs = discovery.pairs;

  if (activePairs.length === 0) {
    console.error('[COLLECTOR] No active pairs found. Exiting.');
    process.exit(1);
  }

  // Collect unique coins to subscribe
  const coins = new Set();
  for (const pair of activePairs) {
    coins.add(pair.asset_a);
    coins.add(pair.asset_b);
  }

  // Initialize orderbook manager
  orderbookManager = new OrderbookManager();

  // Connect WebSocket
  const wsUrl = config.websocket_url || 'wss://api.hyperliquid.xyz/ws';
  wsClient = new HyperliquidWS(wsUrl, onBookUpdate);
  wsClient.connect();

  // Subscribe to all coins
  for (const coin of coins) {
    wsClient.subscribe(coin);
  }

  console.log(`[COLLECTOR] Subscribed to ${coins.size} coins for ${activePairs.length} pairs`);

  // Start stats engine
  const statsIntervalMs = config.stats_update_interval_ms || 5000;
  statsInterval = setInterval(() => {
    try {
      updateStats(activePairs, config);
    } catch (err) {
      console.error('[STATS] Update error:', err.message);
    }
  }, statsIntervalMs);

  // Cleanup every hour
  cleanupInterval = setInterval(() => {
    try {
      db.runCleanup();
    } catch (err) {
      console.error('[CLEANUP] Error:', err.message);
    }
  }, 60 * 60 * 1000);

  console.log('[COLLECTOR] Running');
}

function stop() {
  if (statsInterval) clearInterval(statsInterval);
  if (cleanupInterval) clearInterval(cleanupInterval);
  if (wsClient) wsClient.close();
  db.close();
  console.log('[COLLECTOR] Stopped');
}

module.exports = { start, stop, getLatestSpreads, getConnectionStatus, getActivePairs, getConfig };
