export const dynamic = 'force-dynamic';

let dbRef = null;

function getDB() {
  if (!dbRef) {
    try {
      dbRef = require('../../../../database');
    } catch (e) {}
  }
  return dbRef;
}

const WINDOW_MS = {
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000
};

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const pairA = searchParams.get('pair_a');
  const pairB = searchParams.get('pair_b');
  const window = searchParams.get('window') || '1h';
  const limit = parseInt(searchParams.get('limit') || '500', 10);

  if (!pairA || !pairB) {
    return Response.json({ error: 'pair_a and pair_b are required' }, { status: 400 });
  }

  const db = getDB();
  if (!db) {
    return Response.json({ error: 'Database not ready' }, { status: 503 });
  }

  const windowMs = WINDOW_MS[window] || WINDOW_MS['1h'];
  const since = Date.now() - windowMs;

  try {
    const rows = db.getObservations(pairA, pairB, since, limit);
    return Response.json({ pair_a: pairA, pair_b: pairB, window, count: rows.length, data: rows });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
