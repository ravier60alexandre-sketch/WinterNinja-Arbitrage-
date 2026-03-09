function parseLevel(level) {
  const px = typeof level.px === 'string' ? parseFloat(level.px) : Number(level.px);
  const sz = typeof level.sz === 'string' ? parseFloat(level.sz) : Number(level.sz);
  return { px, sz };
}

function parseLevels(rawLevels) {
  if (!Array.isArray(rawLevels)) return [];
  const result = [];
  for (let i = 0; i < rawLevels.length; i++) {
    const level = rawLevels[i];
    const px = typeof level.px === 'string' ? parseFloat(level.px) : Number(level.px);
    const sz = typeof level.sz === 'string' ? parseFloat(level.sz) : Number(level.sz);
    if (px === px && sz === sz && sz > 0) {
      result.push({ px, sz });
    }
  }
  return result;
}

function isSortedDesc(arr) {
  for (let i = 1; i < arr.length; i++) {
    if (arr[i].px > arr[i - 1].px) return false;
  }
  return true;
}

function isSortedAsc(arr) {
  for (let i = 1; i < arr.length; i++) {
    if (arr[i].px < arr[i - 1].px) return false;
  }
  return true;
}

function parseBook(data) {
  if (!data || !data.levels || !Array.isArray(data.levels) || data.levels.length < 2) {
    return null;
  }

  const bids = parseLevels(data.levels[0]);
  const asks = parseLevels(data.levels[1]);

  if (!isSortedDesc(bids)) bids.sort((a, b) => b.px - a.px);
  if (!isSortedAsc(asks)) asks.sort((a, b) => a.px - b.px);

  return { bids, asks, coin: data.coin, time: data.time };
}

function buyVWAP(asks, notionalUsd, maxLevels) {
  if (!asks || asks.length === 0) return null;
  maxLevels = maxLevels || Infinity;

  let remaining = notionalUsd;
  let totalQty = 0;
  let totalCost = 0;
  let levelsConsumed = 0;

  for (const level of asks) {
    if (remaining <= 0) break;
    if (levelsConsumed >= maxLevels) break;
    levelsConsumed++;

    const levelNotional = level.px * level.sz;

    if (levelNotional >= remaining) {
      const qty = remaining / level.px;
      totalQty += qty;
      totalCost += remaining;
      remaining = 0;
    } else {
      totalQty += level.sz;
      totalCost += levelNotional;
      remaining -= levelNotional;
    }
  }

  if (remaining > 0) {
    return {
      vwap: totalCost > 0 ? totalCost / totalQty : null,
      filled: totalCost,
      capacity: false,
      filledPct: (totalCost / notionalUsd) * 100,
      levelsConsumed,
      bestPrice: asks[0].px,
    };
  }

  return {
    vwap: totalCost / totalQty,
    filled: totalCost,
    qty: totalQty,
    capacity: true,
    filledPct: 100,
    levelsConsumed,
    bestPrice: asks[0].px,
  };
}

function sellVWAP(bids, notionalUsd, maxLevels) {
  if (!bids || bids.length === 0) return null;
  maxLevels = maxLevels || Infinity;

  let remaining = notionalUsd;
  let totalQty = 0;
  let totalRevenue = 0;
  let levelsConsumed = 0;

  for (const level of bids) {
    if (remaining <= 0) break;
    if (levelsConsumed >= maxLevels) break;
    levelsConsumed++;

    const levelNotional = level.px * level.sz;

    if (levelNotional >= remaining) {
      const qty = remaining / level.px;
      totalQty += qty;
      totalRevenue += remaining;
      remaining = 0;
    } else {
      totalQty += level.sz;
      totalRevenue += levelNotional;
      remaining -= levelNotional;
    }
  }

  if (remaining > 0) {
    return {
      vwap: totalRevenue > 0 ? totalRevenue / totalQty : null,
      filled: totalRevenue,
      capacity: false,
      filledPct: (totalRevenue / notionalUsd) * 100,
      levelsConsumed,
      bestPrice: bids[0].px,
    };
  }

  return {
    vwap: totalRevenue / totalQty,
    filled: totalRevenue,
    qty: totalQty,
    capacity: true,
    filledPct: 100,
    levelsConsumed,
    bestPrice: bids[0].px,
  };
}

function buyVWAPMulti(asks, notionals, maxLevels) {
  if (!asks || asks.length === 0) {
    const results = new Array(notionals.length);
    for (let i = 0; i < notionals.length; i++) results[i] = null;
    return results;
  }
  maxLevels = maxLevels || Infinity;
  const bestPrice = asks[0].px;
  const n = notionals.length;
  const results = new Array(n);
  const totalQty = new Float64Array(n);
  const totalCost = new Float64Array(n);
  const filled = new Uint8Array(n);
  let levelsConsumed = 0;
  let allFilled = 0;
  const remaining = new Float64Array(n);
  for (let i = 0; i < n; i++) remaining[i] = notionals[i];

  for (let li = 0; li < asks.length && levelsConsumed < maxLevels && allFilled < n; li++) {
    const level = asks[li];
    const px = level.px;
    const sz = level.sz;
    const levelNotional = px * sz;
    levelsConsumed++;

    for (let i = 0; i < n; i++) {
      if (filled[i]) continue;
      if (remaining[i] <= 0) { filled[i] = 1; allFilled++; continue; }

      if (levelNotional >= remaining[i]) {
        totalQty[i] += remaining[i] / px;
        totalCost[i] += remaining[i];
        remaining[i] = 0;
        filled[i] = 1;
        allFilled++;
      } else {
        totalQty[i] += sz;
        totalCost[i] += levelNotional;
        remaining[i] -= levelNotional;
      }
    }
  }

  for (let i = 0; i < n; i++) {
    const Q = notionals[i];
    if (remaining[i] > 0) {
      results[i] = {
        vwap: totalCost[i] > 0 ? totalCost[i] / totalQty[i] : null,
        filled: totalCost[i],
        capacity: false,
        filledPct: (totalCost[i] / Q) * 100,
        levelsConsumed,
        bestPrice,
      };
    } else {
      results[i] = {
        vwap: totalCost[i] / totalQty[i],
        filled: totalCost[i],
        qty: totalQty[i],
        capacity: true,
        filledPct: 100,
        levelsConsumed: filled[i] ? levelsConsumed : levelsConsumed,
        bestPrice,
      };
    }
  }
  return results;
}

function sellVWAPMulti(bids, notionals, maxLevels) {
  if (!bids || bids.length === 0) {
    const results = new Array(notionals.length);
    for (let i = 0; i < notionals.length; i++) results[i] = null;
    return results;
  }
  maxLevels = maxLevels || Infinity;
  const bestPrice = bids[0].px;
  const n = notionals.length;
  const results = new Array(n);
  const totalQty = new Float64Array(n);
  const totalRevenue = new Float64Array(n);
  const filled = new Uint8Array(n);
  let levelsConsumed = 0;
  let allFilled = 0;
  const remaining = new Float64Array(n);
  for (let i = 0; i < n; i++) remaining[i] = notionals[i];

  for (let li = 0; li < bids.length && levelsConsumed < maxLevels && allFilled < n; li++) {
    const level = bids[li];
    const px = level.px;
    const sz = level.sz;
    const levelNotional = px * sz;
    levelsConsumed++;

    for (let i = 0; i < n; i++) {
      if (filled[i]) continue;
      if (remaining[i] <= 0) { filled[i] = 1; allFilled++; continue; }

      if (levelNotional >= remaining[i]) {
        totalQty[i] += remaining[i] / px;
        totalRevenue[i] += remaining[i];
        remaining[i] = 0;
        filled[i] = 1;
        allFilled++;
      } else {
        totalQty[i] += sz;
        totalRevenue[i] += levelNotional;
        remaining[i] -= levelNotional;
      }
    }
  }

  for (let i = 0; i < n; i++) {
    const Q = notionals[i];
    if (remaining[i] > 0) {
      results[i] = {
        vwap: totalRevenue[i] > 0 ? totalRevenue[i] / totalQty[i] : null,
        filled: totalRevenue[i],
        capacity: false,
        filledPct: (totalRevenue[i] / Q) * 100,
        levelsConsumed,
        bestPrice,
      };
    } else {
      results[i] = {
        vwap: totalRevenue[i] / totalQty[i],
        filled: totalRevenue[i],
        qty: totalQty[i],
        capacity: true,
        filledPct: 100,
        levelsConsumed,
        bestPrice,
      };
    }
  }
  return results;
}

function midPrice(book) {
  if (!book || !book.bids.length || !book.asks.length) return null;
  return (book.bids[0].px + book.asks[0].px) / 2;
}

module.exports = { parseBook, buyVWAP, sellVWAP, buyVWAPMulti, sellVWAPMulti, midPrice, parseLevels };
