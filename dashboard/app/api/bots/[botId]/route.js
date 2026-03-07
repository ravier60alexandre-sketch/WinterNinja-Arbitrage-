import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

export const dynamic = 'force-dynamic';

const BOTS_PATH = resolve(process.cwd(), '..', 'data', 'bots.json');

function loadBots() {
  try {
    if (existsSync(BOTS_PATH)) {
      return JSON.parse(readFileSync(BOTS_PATH, 'utf8'));
    }
  } catch (e) {
    // Fall through
  }
  return { bots: [] };
}

function saveBots(data) {
  writeFileSync(BOTS_PATH, JSON.stringify(data, null, 2), 'utf8');
}

// GET - get bot details
export async function GET(request, { params }) {
  const { botId } = await params;
  const data = loadBots();
  const bot = data.bots.find(b => b.id === botId);

  if (!bot) {
    return Response.json({ error: 'Bot not found' }, { status: 404 });
  }

  return Response.json({ bot });
}

// PUT - update bot config
export async function PUT(request, { params }) {
  const { botId } = await params;
  const body = await request.json();
  const data = loadBots();
  const bot = data.bots.find(b => b.id === botId);

  if (!bot) {
    return Response.json({ error: 'Bot not found' }, { status: 404 });
  }

  // Update allowed fields
  const updatable = ['name', 'entry_threshold_bps', 'exit_threshold_bps', 'position_size', 'strategy'];
  for (const key of updatable) {
    if (body[key] !== undefined) {
      bot[key] = body[key];
    }
  }

  saveBots(data);
  return Response.json({ bot });
}

// DELETE - remove bot
export async function DELETE(request, { params }) {
  const { botId } = await params;
  const data = loadBots();
  const idx = data.bots.findIndex(b => b.id === botId);

  if (idx === -1) {
    return Response.json({ error: 'Bot not found' }, { status: 404 });
  }

  const removed = data.bots.splice(idx, 1);
  saveBots(data);
  return Response.json({ deleted: removed[0] });
}
