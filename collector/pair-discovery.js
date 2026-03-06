const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const DEPLOYERS = ['cash', 'flx', 'km'];
const HIP3_PATTERN = /^(xyz|cash|flx|km):(.+)$/;

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

  // Use perpDexs endpoint to discover all builder-deployed dexes and their assets
  const dexes = await fetchJSON(infoUrl, { type: 'perpDexs' });

  if (!Array.isArray(dexes)) {
    throw new Error('Unexpected perpDexs response format');
  }

  // Collect all assets from relevant dexes (xyz, cash, flx, km)
  const assetsByDeployer = new Map(); // deployer -> Set of coins

  for (const dex of dexes) {
    if (!dex || !dex.name) continue;
    const dexName = dex.name.toLowerCase();

    if (dexName !== 'xyz' && !DEPLOYERS.includes(dexName)) continue;

    const coins = new Set();

    // Extract coins from assetToStreamingOiCap entries
    if (Array.isArray(dex.assetToStreamingOiCap)) {
      for (const [assetName] of dex.assetToStreamingOiCap) {
        const match = assetName.match(HIP3_PATTERN);
        if (match) {
          coins.add(match[2]); // the coin part (e.g., SILVER, GOLD)
        }
      }
    }

    assetsByDeployer.set(dexName, coins);
  }

  const xyzCoins = assetsByDeployer.get('xyz') || new Set();
  const discoveredPairs = [];

  for (const coin of xyzCoins) {
    for (const deployer of DEPLOYERS) {
      const deployerCoins = assetsByDeployer.get(deployer) || new Set();
      if (deployerCoins.has(coin)) {
        discoveredPairs.push({
          asset_a: `xyz:${coin}`,
          asset_b: `${deployer}:${coin}`,
          label: `${coin.padEnd(10)} · XYZ vs ${deployer.toUpperCase()}`
        });
      }
    }
  }

  console.log(`[DISCOVERY] Found ${discoveredPairs.length} HiP-3 pairs from API`);
  console.log(`[DISCOVERY] Dexes found: ${[...assetsByDeployer.keys()].join(', ')} | XYZ coins: ${xyzCoins.size}`);
  return { pairs: discoveredPairs, liveAssets: assetsByDeployer };
}

function mergePairs(configPairs, discoveredPairs, liveAssets, cachePath) {
  const pairKey = (p) => `${p.asset_a}|${p.asset_b}`;
  const merged = new Map();

  // Config pairs first (they have precedence for labels)
  for (const pair of configPairs) {
    merged.set(pairKey(pair), pair);
  }

  // Add API-discovered pairs that aren't in config
  let fromDiscovery = 0;
  for (const pair of discoveredPairs) {
    const key = pairKey(pair);
    if (!merged.has(key)) {
      merged.set(key, pair);
      fromDiscovery++;
    }
  }

  // Validate config pairs against live API data (warn but DO NOT skip)
  const activePairs = [];
  const discoveredKeys = new Set(discoveredPairs.map(pairKey));

  for (const [key, pair] of merged) {
    const isFromConfig = configPairs.some(cp => pairKey(cp) === key);

    if (isFromConfig && !discoveredKeys.has(key) && liveAssets && liveAssets.size > 0) {
      // Check if the individual assets exist
      const matchA = pair.asset_a.match(HIP3_PATTERN);
      const matchB = pair.asset_b.match(HIP3_PATTERN);
      if (matchA && matchB) {
        const deployerA = matchA[1];
        const coinA = matchA[2];
        const deployerB = matchB[1];
        const coinB = matchB[2];
        const aExists = liveAssets.has(deployerA) && liveAssets.get(deployerA).has(coinA);
        const bExists = liveAssets.has(deployerB) && liveAssets.get(deployerB).has(coinB);

        if (!aExists || !bExists) {
          const missing = [];
          if (!aExists) missing.push(pair.asset_a);
          if (!bExists) missing.push(pair.asset_b);
          console.warn(`[WARN] Pair ${pair.asset_a} / ${pair.asset_b} — asset(s) not found in live universe: ${missing.join(', ')} — skipping`);
          continue;
        }
      }
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
  let liveAssets = null;

  try {
    const result = await discoverPairsFromAPI(infoUrl);
    discoveredPairs = result.pairs;
    liveAssets = result.liveAssets;
  } catch (err) {
    console.error(`[WARN] REST API unreachable: ${err.message}`);
    const cached = loadCachedPairs(cachePath);
    if (cached) {
      return { pairs: cached, fromConfig: 0, fromDiscovery: cached.length };
    }
    console.warn('[WARN] No cache available, using config pairs only (unvalidated)');
    return { pairs: configPairs, fromConfig: configPairs.length, fromDiscovery: 0 };
  }

  return mergePairs(configPairs, discoveredPairs, liveAssets, cachePath);
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
