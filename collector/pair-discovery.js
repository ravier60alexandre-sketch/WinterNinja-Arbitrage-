const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const HIP3_PATTERN = /^(xyz|cash|flx|km):(.+)$/;
const DEPLOYERS = ['cash', 'flx', 'km'];

function fetchJSON(url, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const transport = parsed.protocol === 'https:' ? https : http;
    const postData = JSON.stringify(body);

    const req = transport.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 15000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(new Error(`Failed to parse response: ${err.message}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
    req.write(postData);
    req.end();
  });
}

async function discoverPairsFromAPI(infoUrl) {
  console.log('[DISCOVERY] Fetching active HiP-3 pairs from Hyperliquid API...');

  const response = await fetchJSON(infoUrl, { type: 'meta' });
  const universe = response.universe || [];

  const hip3Assets = new Map();

  for (const asset of universe) {
    const name = asset.name || '';
    const match = name.match(HIP3_PATTERN);
    if (match) {
      const deployer = match[1];
      const coin = match[2];
      if (!hip3Assets.has(coin)) {
        hip3Assets.set(coin, new Set());
      }
      hip3Assets.get(coin).add(deployer);
    }
  }

  const discoveredPairs = [];

  for (const [coin, deployers] of hip3Assets) {
    if (!deployers.has('xyz')) continue;

    for (const deployer of DEPLOYERS) {
      if (deployers.has(deployer)) {
        discoveredPairs.push({
          asset_a: `xyz:${coin}`,
          asset_b: `${deployer}:${coin}`,
          label: `${coin.padEnd(10)} · XYZ vs ${deployer.toUpperCase()}`
        });
      }
    }
  }

  console.log(`[DISCOVERY] Found ${discoveredPairs.length} HiP-3 pairs from API`);
  return discoveredPairs;
}

function mergePairs(configPairs, discoveredPairs, cachePath) {
  const pairKey = (p) => `${p.asset_a}|${p.asset_b}`;
  const merged = new Map();

  for (const pair of configPairs) {
    merged.set(pairKey(pair), pair);
  }

  let fromDiscovery = 0;
  for (const pair of discoveredPairs) {
    const key = pairKey(pair);
    if (!merged.has(key)) {
      merged.set(key, pair);
      fromDiscovery++;
    }
  }

  const discoveredKeys = new Set(discoveredPairs.map(pairKey));
  const activePairs = [];

  for (const [key, pair] of merged) {
    if (!discoveredKeys.has(key) && configPairs.some(cp => pairKey(cp) === key)) {
      console.warn(`[WARN] Pair ${pair.asset_a} / ${pair.asset_b} not found in live universe — skipping`);
      continue;
    }
    activePairs.push(pair);
  }

  // Save cache
  try {
    const dir = path.dirname(cachePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(cachePath, JSON.stringify({ timestamp: Date.now(), pairs: activePairs }, null, 2));
  } catch (err) {
    console.error('[DISCOVERY] Failed to save cache:', err.message);
  }

  const fromConfig = activePairs.length - fromDiscovery;
  console.log(`[INFO] Active pairs: ${activePairs.length} (${fromConfig} from config, ${fromDiscovery} discovered)`);

  return { pairs: activePairs, fromConfig, fromDiscovery };
}

function loadCachedPairs(cachePath) {
  try {
    if (fs.existsSync(cachePath)) {
      const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      console.log(`[DISCOVERY] Loaded ${data.pairs.length} pairs from cache (saved ${new Date(data.timestamp).toISOString()})`);
      return data.pairs;
    }
  } catch (err) {
    console.error('[DISCOVERY] Failed to load cache:', err.message);
  }
  return null;
}

async function discoverPairs(config) {
  const configPairs = config.pairs || [];
  const infoUrl = config.hyperliquid_info_url || 'https://api.hyperliquid.xyz/info';
  const cachePath = path.resolve(config.discovered_pairs_cache || 'data/discovered_pairs.json');

  let discoveredPairs = [];

  try {
    discoveredPairs = await discoverPairsFromAPI(infoUrl);
  } catch (err) {
    console.error(`[WARN] REST API unreachable: ${err.message}`);
    const cached = loadCachedPairs(cachePath);
    if (cached) {
      return { pairs: cached, fromConfig: 0, fromDiscovery: cached.length };
    }
    console.warn('[WARN] No cache available, using config pairs only');
    return { pairs: configPairs, fromConfig: configPairs.length, fromDiscovery: 0 };
  }

  return mergePairs(configPairs, discoveredPairs, cachePath);
}

function groupPairsByUnderlying(pairs) {
  const groups = {};
  for (const pair of pairs) {
    const match = pair.asset_a.match(/^xyz:(.+)$/);
    if (match) {
      const underlying = match[1];
      if (!groups[underlying]) {
        groups[underlying] = [];
      }
      groups[underlying].push(pair);
    }
  }
  return groups;
}

module.exports = { discoverPairs, groupPairsByUnderlying };
