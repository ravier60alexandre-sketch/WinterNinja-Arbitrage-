import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

export const dynamic = 'force-dynamic';

const BOTS_PATH = resolve(process.cwd(), '..', 'data', 'bots.json');
const CONFIG_PATH = resolve(process.cwd(), '..', 'config.json');

function loadBots() {
  try {
    if (existsSync(BOTS_PATH)) {
      return JSON.parse(readFileSync(BOTS_PATH, 'utf8'));
    }
  } catch (e) {
    // Fall through to default
  }
  return { bots: [] };
}

function saveBots(data) {
  writeFileSync(BOTS_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function loadConfig() {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  } catch (e) {
    return { pairs: [] };
  }
}

// GET - list all bots
export async function GET() {
  const data = loadBots();
  return Response.json(data);
}

// POST - create a new bot
export async function POST(request) {
  const body = await request.json();

  const { name, pair_a, pair_b, strategy, entry_threshold_bps, exit_threshold_bps, position_size } = body;

  if (!name || !pair_a || !pair_b) {
    return Response.json({ error: 'name, pair_a, and pair_b are required' }, { status: 400 });
  }

  const data = loadBots();

  const bot = {
    id: `bot_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    pair_a,
    pair_b,
    strategy: strategy || 'mean_reversion',
    entry_threshold_bps: entry_threshold_bps || 5.0,
    exit_threshold_bps: exit_threshold_bps || 1.0,
    position_size: position_size || 100,
    state: 'stopped',
    created_at: new Date().toISOString(),
    metrics: {
      total_pnl: 0,
      total_trades: 0,
      win_rate: 0,
      max_drawdown: 0,
      avg_hold_time_min: 0,
    },
    trades: [],
  };

  data.bots.push(bot);
  saveBots(data);

  return Response.json({ bot }, { status: 201 });
}

// PUT - update bot state (start/stop/pause)
export async function PUT(request) {
  const body = await request.json();
  const { id, action } = body;

  if (!id || !action) {
    return Response.json({ error: 'id and action are required' }, { status: 400 });
  }

  if (!['start', 'stop', 'pause'].includes(action)) {
    return Response.json({ error: 'action must be start, stop, or pause' }, { status: 400 });
  }

  const data = loadBots();
  const bot = data.bots.find(b => b.id === id);
  if (!bot) {
    return Response.json({ error: 'Bot not found' }, { status: 404 });
  }

  const stateMap = { start: 'running', stop: 'stopped', pause: 'paused' };
  bot.state = stateMap[action];
  bot.last_state_change = new Date().toISOString();

  saveBots(data);

  return Response.json({ bot });
}
