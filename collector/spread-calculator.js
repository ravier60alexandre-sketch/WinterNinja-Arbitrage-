function computeSpread(bookA, bookB, minExecSize) {
  if (!bookA || !bookB) return null;

  // Direction 1: XYZ Short / B Long (sell A at bid, buy B at ask)
  const spread1Raw = bookA.bestBid - bookB.bestAsk;
  const spread1Bps = (spread1Raw / bookB.bestAsk) * 10000;
  const execSize1 = Math.min(bookA.bidSize, bookB.askSize);

  // Direction 2: XYZ Long / B Short (buy A at ask, sell B at bid)
  const spread2Raw = bookB.bestBid - bookA.bestAsk;
  const spread2Bps = (spread2Raw / bookA.bestAsk) * 10000;
  const execSize2 = Math.min(bookB.bidSize, bookA.askSize);

  // Validate no NaN/Infinity
  const values = [spread1Raw, spread1Bps, execSize1, spread2Raw, spread2Bps, execSize2];
  for (const v of values) {
    if (!isFinite(v)) return null;
  }

  // Liquidity filter
  const passesFilter1 = execSize1 >= minExecSize;
  const passesFilter2 = execSize2 >= minExecSize;

  if (!passesFilter1 && !passesFilter2) return null;

  return {
    spread_1_raw: spread1Raw,
    spread_1_bps: Math.round(spread1Bps * 100) / 100,
    exec_size_1: execSize1,
    spread_2_raw: spread2Raw,
    spread_2_bps: Math.round(spread2Bps * 100) / 100,
    exec_size_2: execSize2,
    bid_a: bookA.bestBid,
    ask_a: bookA.bestAsk,
    bid_size_a: bookA.bidSize,
    ask_size_a: bookA.askSize,
    bid_b: bookB.bestBid,
    ask_b: bookB.bestAsk,
    bid_size_b: bookB.bidSize,
    ask_size_b: bookB.askSize
  };
}

module.exports = { computeSpread };
