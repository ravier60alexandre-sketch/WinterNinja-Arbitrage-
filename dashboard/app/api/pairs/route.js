import { readFileSync } from 'fs';
import { resolve } from 'path';

export const dynamic = 'force-dynamic';

const LIVE_STATE_PATH = resolve(process.cwd(), '..', 'data', 'live-state.json');

function readLiveState() {
  try {
    return JSON.parse(readFileSync(LIVE_STATE_PATH, 'utf8'));
  } catch (e) {
    return null;
  }
}

export async function GET() {
  const state = readLiveState();
  if (!state || !state.pairs) {
    return Response.json({ error: 'Collector not ready', pairs: [], grouped_by_underlying: {}, total: 0 }, { status: 503 });
  }

  const pairs = state.pairs;
  const groupedByUnderlying = {};
  for (const pair of pairs) {
    const match = pair.asset_a.match(/^xyz:(.+)$/);
    if (match) {
      const underlying = match[1];
      if (!groupedByUnderlying[underlying]) {
        groupedByUnderlying[underlying] = [];
      }
      groupedByUnderlying[underlying].push(`${pair.asset_a}/${pair.asset_b}`);
    }
  }

  return Response.json({
    pairs,
    grouped_by_underlying: groupedByUnderlying,
    total: pairs.length
  });
}
