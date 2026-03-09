import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.BOT_BACKEND_URL || 'http://localhost:8000';
const BOTS_PATH = resolve(process.cwd(), '..', 'data', 'bots.json');

// ── Try FastAPI backend first, fall back to local file ──

async function fetchFromBackend(path, options = {}) {
  try {
    const res = await fetch(`${BACKEND_URL}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) return await res.json();
  } catch (e) {
    // Backend not available, fall through to local
  }
  return null;
}

// ── Local fallback (bots.json) ──

function loadBots() {
  try {
    if (existsSync(BOTS_PATH)) {
      const data = JSON.parse(readFileSync(BOTS_PATH, 'utf8'));
      if (data.bots && data.bots.length > 0) {
        return data;
      }
    }
  } catch (e) {}
  return initDefaultBots();
}

function initDefaultBots() {
  const defs = [
    { id: 1, name: 'Long XYZ / Short CASH', exchange: 'CASH', pair_b: 'cash', direction: 'long',  label: 'Long XYZ / Short CASH' },
    { id: 2, name: 'Long XYZ / Short KM',   exchange: 'KM',   pair_b: 'km',   direction: 'long',  label: 'Long XYZ / Short KM'   },
    { id: 3, name: 'Long XYZ / Short FLX',  exchange: 'FLX',  pair_b: 'flx',  direction: 'long',  label: 'Long XYZ / Short FLX'  },
    { id: 4, name: 'Short XYZ / Long CASH', exchange: 'CASH', pair_b: 'cash', direction: 'short', label: 'Short XYZ / Long CASH' },
    { id: 5, name: 'Short XYZ / Long KM',   exchange: 'KM',   pair_b: 'km',   direction: 'short', label: 'Short XYZ / Long KM'   },
    { id: 6, name: 'Short XYZ / Long FLX',  exchange: 'FLX',  pair_b: 'flx',  direction: 'short', label: 'Short XYZ / Long FLX'  },
  ];

  const bots = defs.map(d => ({
    id: d.id,
    name: d.name,
    exchange: d.exchange,
    pair_b: d.pair_b,
    direction: d.direction,
    label: d.label,
    state: 'stopped',
    wallet: '',
    sub_account: '',
    collateral: { usdc: 0, usdh: 0, total: 0 },
    ping_ms: 0,
    fees_bps: 0.45,
    metrics: {
      pnl_net: 0, fees: 0, volume: 0, open: 0, closed: 0,
      win_pct: null, wins: 0, losses: 0, slip_avg_bps: 0,
      errors: 0, orphans: 0, funding: 0,
    },
    config: {
      max_pos: 300, max_global: 1000, max_lev: 10, sl_bps: 0,
      max_loss_bps: 500, percentile: 0.75, buf: 0, slip: 2,
      timer: '6h', close_buffer_bps: 2, zmr: false, close_fee_rt_buffer: false,
    },
    pairs: getDefaultPairs(d.pair_b),
    tiers_enabled: true,
  }));

  const data = { bots, global_stats: defaultGlobalStats() };
  saveBots(data);
  return data;
}

function defaultGlobalStats() {
  return {
    combined_open: 0, net_pnl: 0, total_fees: 0, total_funding: 0,
    total_volume: 0, total_trades: 0, routed: 0, rejected: 0,
  };
}

function getDefaultPairs(exchange) {
  const pairsByExchange = {
    flx: [
      { symbol: 'SILVER', enabled: true, tier: 'P', z: 2, bh: null },
      { symbol: 'TSLA', enabled: true, tier: 'P', z: 2, bh: null },
      { symbol: 'NVDA', enabled: true, tier: 'P', z: 2, bh: null },
      { symbol: 'PLATINUM', enabled: true, tier: 'P', z: 2, bh: null },
      { symbol: 'GOLD', enabled: true, tier: 'P', z: 2, bh: null },
      { symbol: 'COIN', enabled: true, tier: 'P', z: 2, bh: null },
      { symbol: 'CRCL', enabled: true, tier: 'P', z: 2, bh: null },
      { symbol: 'COPPER', enabled: true, tier: 'P', z: 2, bh: null },
      { symbol: 'PALLADIUM', enabled: true, tier: 'P', z: 2, bh: null },
    ],
    km: [
      { symbol: 'SILVER', enabled: true, tier: null, z: null, bh: null },
      { symbol: 'NVDA', enabled: true, tier: 'P', z: 2, bh: null },
      { symbol: 'TSLA', enabled: true, tier: 'P', z: 2, bh: null },
      { symbol: 'GOLD', enabled: true, tier: 'P', z: 2, bh: null },
      { symbol: 'GOOGL', enabled: true, tier: 'P', z: 2, bh: null },
      { symbol: 'PLTR', enabled: true, tier: 'P', z: 2, bh: null },
      { symbol: 'AAPL', enabled: true, tier: 'P', z: 2, bh: null },
      { symbol: 'MU', enabled: true, tier: 'P', z: 2, bh: null },
      { symbol: 'EUR', enabled: false, tier: null, z: 2, bh: null },
      { symbol: 'BABA', enabled: true, tier: 'P', z: 2, bh: null },
    ],
    cash: [
      { symbol: 'SILVER', enabled: true, tier: 'P', z: 1, bh: 8 },
      { symbol: 'NVDA', enabled: true, tier: 'P', z: 2, bh: null },
      { symbol: 'HOOD', enabled: true, tier: 'P', z: 2, bh: null },
      { symbol: 'INTC', enabled: true, tier: 'N', z: 2, bh: null },
      { symbol: 'AMZN', enabled: true, tier: 'A', z: 2, bh: null },
      { symbol: 'TSLA', enabled: true, tier: 'P', z: 2, bh: null },
      { symbol: 'GOLD', enabled: true, tier: 'P', z: 2, bh: null },
      { symbol: 'GOOGL', enabled: true, tier: 'P', z: 2, bh: null },
      { symbol: 'META', enabled: true, tier: 'P', z: 2, bh: null },
      { symbol: 'MSFT', enabled: true, tier: 'N', z: 2, bh: null },
      { symbol: 'EWY', enabled: true, tier: null, z: null, bh: null },
    ],
  };
  return pairsByExchange[exchange] || [];
}

function saveBots(data) {
  try {
    writeFileSync(BOTS_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {}
}

// ═══════════════════════════════════════════════════
// GET — list all bots (try FastAPI, fallback to local)
// ═══════════════════════════════════════════════════
export async function GET() {
  // Try FastAPI backend first — validate it returns the expected 6-bot format
  const backendData = await fetchFromBackend('/api/v1/bots');
  if (backendData?.bots?.length > 0 && backendData.bots[0].exchange) {
    return Response.json(backendData);
  }

  // Fallback to local bots.json (correct 6-bot format with exchange/direction/etc.)
  const data = loadBots();
  return Response.json(data);
}

// ═══════════════════════════════════════════════════
// POST — bot action (start/stop/liquidate/reset)
//   Proxied to FastAPI which controls real BotEngine
// ═══════════════════════════════════════════════════
export async function POST(request) {
  const body = await request.json();

  if (body.action && body.bot_id) {
    // Try FastAPI backend first (real bot control)
    const backendResult = await fetchFromBackend(
      `/api/v1/bots/${body.bot_id}/action`,
      { method: 'POST', body: JSON.stringify({ action: body.action }) }
    );
    if (backendResult) {
      return Response.json(backendResult);
    }

    // Fallback: update local state only (no real execution)
    const data = loadBots();
    const bot = data.bots.find(b => b.id === body.bot_id);
    if (!bot) return Response.json({ error: 'Bot not found' }, { status: 404 });

    const stateMap = { start: 'running', stop: 'stopped', liquidate: 'liquidating', reset: 'stopped' };
    bot.state = stateMap[body.action] || bot.state;
    if (body.action === 'reset') {
      bot.metrics = {
        pnl_net: 0, fees: 0, volume: 0, open: 0, closed: 0,
        win_pct: null, wins: 0, losses: 0, slip_avg_bps: 0,
        errors: 0, orphans: 0, funding: 0,
      };
    }
    saveBots(data);
    return Response.json({ bot, _fallback: true });
  }

  return Response.json({ error: 'Invalid request' }, { status: 400 });
}

// ═══════════════════════════════════════════════════
// PUT — update bot config/wallet/pairs
// ═══════════════════════════════════════════════════
export async function PUT(request) {
  const body = await request.json();
  const { bot_id } = body;

  if (!bot_id) return Response.json({ error: 'bot_id required' }, { status: 400 });

  // Try to update config on FastAPI backend
  if (body.config) {
    const backendResult = await fetchFromBackend(
      `/api/v1/bots/${bot_id}/config`,
      { method: 'PATCH', body: JSON.stringify(body.config) }
    );
    // Continue to also save locally for pairs/wallet which backend doesn't manage
  }

  // Always update local state for wallet, pairs, tiers
  const data = loadBots();
  const bot = data.bots.find(b => b.id === bot_id);
  if (!bot) return Response.json({ error: 'Bot not found' }, { status: 404 });

  if (body.wallet !== undefined) bot.wallet = body.wallet;
  if (body.sub_account !== undefined) bot.sub_account = body.sub_account;
  if (body.config) bot.config = { ...bot.config, ...body.config };
  if (body.pairs) bot.pairs = body.pairs;
  if (body.tiers_enabled !== undefined) bot.tiers_enabled = body.tiers_enabled;

  saveBots(data);
  return Response.json({ bot });
}
