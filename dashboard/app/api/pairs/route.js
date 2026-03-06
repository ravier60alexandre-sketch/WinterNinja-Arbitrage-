export const dynamic = 'force-dynamic';

let collectorRef = null;

function getCollector() {
  if (!collectorRef) {
    try { collectorRef = require('../../../collector'); } catch (e) {}
  }
  return collectorRef;
}

export async function GET() {
  const collector = getCollector();
  if (!collector) {
    return Response.json({ error: 'Collector not ready' }, { status: 503 });
  }

  const pairs = collector.getActivePairs();

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
