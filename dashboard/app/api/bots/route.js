import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

export const dynamic = 'force-dynamic';

const BOTS_PATH = resolve(process.cwd(), '..', 'data', 'bots.json');

function loadBots() {
  try {
    if (existsSync(BOTS_PATH)) {
      const data = JSON.parse(readFileSync(BOTS_PATH, 'utf8'));
      if (data.bots && data.bots.length > 0) {
        return data;
      }
    }
  } catch (e) {}
  // Initialize default 6-bot structure
  return initDefaultBots();
}

function initDefaultBots() {
  const defs = [
    { id: 1, name: 'Bot 1', exchange: 'FLX', pair_b: 'flx', direction: 'short', label: 'XYZ SHORT' },
    { id: 2, name: 'Bot 2', exchange: 'KM',  pair_b: 'km',  direction: 'short', label: 'XYZ SHORT' },
    { id: 3, name: 'Bot 3', exchange: 'CASH', pair_b: 'cash', direction: 'short', label: 'XYZ SHORT' },
    { id: 4, name: 'Bot 4', exchange: 'FLX', pair_b: 'flx', direction: 'long',  label: 'XYZ LONG'  },
    { id: 5, name: 'Bot 5', exchange: 'KM',  pair_b: 'km',  direction: 'long',  label: 'XYZ LONG'  },
    { id: 6, name: 'Bot 6', exchange: 'CASH', pair_b: 'cash', direction: 'long',  label: 'XYZ LONG'  },
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
      pnl_net: 0,
      fees: 0,
      volume: 0,
      open: 0,
      closed: 0,
      win_pct: null,
      wins: 0,
      losses: 0,
      slip_avg_bps: 0,
      errors: 0,
      orphans: 0,
      funding: 0,
    },
    config: {
      max_pos: 300,
      max_global: 1000,
      max_lev: 10,
      sl_bps: 0,
      max_loss_bps: 500,
      percentile: 0.75,
      buf: 0,
      slip: 2,
      timer: '6h',
      close_buffer_bps: 2,
      zmr: false,
      close_fee_rt_buffer: false,
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
    combined_open: 6,
    net_pnl: 0,
    total_fees: 0,
    total_funding: 0,
    total_volume: 0,
    total_trades: 0,
    routed: 0,
    rejected: 0,
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
  writeFileSync(BOTS_PATH, JSON.stringify(data, null, 2), 'utf8');
}

// GET - list all bots
export async function GET() {
  const data = loadBots();
  return Response.json(data);
}

// POST - create/action on bot
export async function POST(request) {
  const body = await request.json();
  const data = loadBots();

  // Handle bot action (start/stop/liquidate/reset)
  if (body.action && body.bot_id) {
    const bot = data.bots.find(b => b.id === body.bot_id);
    if (!bot) return Response.json({ error: 'Bot not found' }, { status: 404 });

    const stateMap = { start: 'running', stop: 'stopped', liquidate: 'liquidating', reset: 'stopped' };
    bot.state = stateMap[body.action] || bot.state;
    if (body.action === 'reset') {
      bot.metrics = { pnl_net: 0, fees: 0, volume: 0, open: 0, closed: 0, win_pct: null, wins: 0, losses: 0, slip_avg_bps: 0, errors: 0, orphans: 0, funding: 0 };
    }
    saveBots(data);
    return Response.json({ bot });
  }

  return Response.json({ error: 'Invalid request' }, { status: 400 });
}

// PUT - update bot config/wallet/pairs
export async function PUT(request) {
  const body = await request.json();
  const { bot_id } = body;

  if (!bot_id) return Response.json({ error: 'bot_id required' }, { status: 400 });

  const data = loadBots();
  const bot = data.bots.find(b => b.id === bot_id);
  if (!bot) return Response.json({ error: 'Bot not found' }, { status: 404 });

  // Update wallet
  if (body.wallet !== undefined) bot.wallet = body.wallet;
  if (body.sub_account !== undefined) bot.sub_account = body.sub_account;

  // Update config
  if (body.config) {
    bot.config = { ...bot.config, ...body.config };
  }

  // Update pairs
  if (body.pairs) {
    bot.pairs = body.pairs;
  }

  if (body.tiers_enabled !== undefined) {
    bot.tiers_enabled = body.tiers_enabled;
  }

  saveBots(data);
  return Response.json({ bot });
}
