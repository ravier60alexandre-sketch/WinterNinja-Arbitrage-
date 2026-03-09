const db = require('./db');
const hlApiModule = require('./hl_api');
const { getParisTime, TIMEZONE } = require('./tz');

function registerGenericBotRoutes(app, {
  prefix,
  botId,
  deployer,
  direction,
  getEngine,
  getApi,
  getWalletAddr,
  getStatusCache,
  setStatusCache,
  getPairTierCache,
  computePairTiers,
  buildHedgeStatus,
  pairs,
  engines,
  hlApi,
}) {
  const eng = () => getEngine();
  const api = () => getApi();
  const botPairs = deployer ? pairs.filter(p => p.id.startsWith(deployer + '-')) : pairs;

  let _cachedBalances = { usdc: 0, usdt: 0, usdh: 0, wallet: null, ts: 0 };
  let _cachedFunding = { rates: {}, ts: 0 };

  app.get(`/${prefix}/wallet/balances`, async (req, res) => {
    try {
      const e = eng(); const a = api();
      if (!e || !a) return res.status(503).json({ error: `${botId} not available` });
      const now = Date.now();
      const activeAddr = a.getActiveAddress() || getWalletAddr();
      if (now - _cachedBalances.ts > 10000 || _cachedBalances._addr !== activeAddr) {
        _cachedBalances = { ...(await hlApi.getBalances(activeAddr)), ts: now, _addr: activeAddr };
      }
      res.json(_cachedBalances);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get(`/${prefix}/info`, (req, res) => {
    res.json({ botId, deployer: deployer || 'all', direction: direction || 'all', pairCount: botPairs.length, pairs: botPairs.map(p => p.id), available: !!eng() });
  });

  app.get(`/${prefix}/available`, (req, res) => {
    res.json({ available: !!eng(), botId, deployer: deployer || 'all', direction: direction || 'all' });
  });

  app.get(`/${prefix}/status`, async (req, res) => {
    const e = eng();
    if (!e) return res.status(503).json({ error: `${botId} not available` });
    const cache = getStatusCache();
    if (cache && cache.data) return res.json(cache.data);
    const botConfig = e.getConfig();
    const liveStats = await e.getLiveStats();
    const payload = { ...botConfig, liveStats };
    setStatusCache({ data: payload, ts: Date.now() });
    res.json(payload);
  });

  app.get(`/${prefix}/hedge-status`, async (req, res) => {
    try {
      const e = eng();
      if (!e) return res.status(503).json({ error: `${botId} not available` });
      const posMap = e.getPositionsMap();
      let onChain = null;
      try { onChain = await e._hlApi.getDeployerPositions(e._hlApi.getActiveAddress() || e._activeAddress); } catch (_) {}
      const coins = {};
      for (const [pairId, pos] of Object.entries(posMap)) {
        if (pos.size > 0) {
          const legABuy = pos.direction === 1;
          if (!coins[pos.legACoin]) coins[pos.legACoin] = { expected: 0, side: legABuy ? 'buy' : 'sell' };
          if (!coins[pos.legBCoin]) coins[pos.legBCoin] = { expected: 0, side: !legABuy ? 'buy' : 'sell' };
          coins[pos.legACoin].expected += pos.size;
          coins[pos.legBCoin].expected += pos.size;
        }
      }
      const hedgeItems = [];
      for (const [coin, info] of Object.entries(coins)) {
        const onChainSize = onChain?.[coin] ? Math.abs(onChain[coin].size) : 0;
        hedgeItems.push({ coin, side: info.side, expected: info.expected, onChain: onChainSize, delta: onChainSize - info.expected });
      }
      res.json({ positions: posMap, coins: hedgeItems, onChain });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get(`/${prefix}/fees`, (req, res) => {
    const e = eng();
    if (!e) return res.status(503).json({ error: `${botId} not available` });
    res.json(e.getFeeRates());
  });

  app.get(`/${prefix}/ping`, async (req, res) => {
    try {
      const e = eng();
      if (!e) return res.json({ ok: false, error: `${botId} not available` });
      res.json({ ok: true, pingMs: await e._hlApi.pingLatency() });
    } catch (err) { res.json({ ok: false, error: err.message }); }
  });

  app.post(`/${prefix}/start`, (req, res) => {
    const e = eng();
    if (!e) return res.status(503).json({ error: `${botId} not available` });
    const ok = e.start();
    res.json({ ok, enabled: e.isEnabled() });
  });

  app.post(`/${prefix}/stop`, (req, res) => {
    const e = eng();
    if (!e) return res.status(503).json({ error: `${botId} not available` });
    e.stop();
    res.json({ ok: true, enabled: false });
  });

  app.post(`/${prefix}/liquidation/start`, (req, res) => {
    const e = eng();
    if (!e) return res.status(503).json({ error: `${botId} not available` });
    const ok = e.startLiquidation();
    res.json({ ok, liquidationMode: e.liquidationMode, enabled: e.isEnabled() });
  });

  app.post(`/${prefix}/liquidation/stop`, (req, res) => {
    const e = eng();
    if (!e) return res.status(503).json({ error: `${botId} not available` });
    const ok = e.stopLiquidation();
    res.json({ ok, liquidationMode: e.liquidationMode, enabled: e.isEnabled() });
  });

  app.post(`/${prefix}/pair`, (req, res) => {
    const e = eng();
    if (!e) return res.status(503).json({ error: `${botId} not available` });
    const { pairId, enabled } = req.body;
    if (!engines[pairId]) return res.status(404).json({ error: 'Pair not found' });
    if (enabled) e.enablePair(pairId); else e.disablePair(pairId);
    res.json({ ok: true, pairId, enabled: e.isPairEnabled(pairId) });
  });

  app.get(`/${prefix}/pair-tiers`, (req, res) => {
    const e = eng();
    if (!e) return res.status(503).json({ error: `${botId} not available` });
    const cache = getPairTierCache();
    if (Date.now() - cache.ts > 30000) computePairTiers(e);
    const c = getPairTierCache();
    res.json({ tiers: c.data, config: e.tierConfig, ts: c.ts, totalBalance: c.totalBalance });
  });

  app.post(`/${prefix}/pair-tiers/config`, async (req, res) => {
    const e = eng();
    if (!e) return res.status(503).json({ error: `${botId} not available` });
    const { thresholds, marginPct } = req.body;
    await e.updateTierConfig({ thresholds, marginPct });
    computePairTiers(e);
    const c = getPairTierCache();
    res.json({ ok: true, config: e.tierConfig, tiers: c.data, totalBalance: c.totalBalance });
  });

  app.post(`/${prefix}/pair-tiers/reset`, (req, res) => {
    const e = eng();
    if (!e) return res.status(503).json({ error: `${botId} not available` });
    e.resetTierConfig();
    computePairTiers(e);
    const c = getPairTierCache();
    res.json({ ok: true, config: e.tierConfig, tiers: c.data, totalBalance: c.totalBalance });
  });

  app.get(`/${prefix}/pair-fees-detail`, (req, res) => {
    try {
      const e = eng();
      if (!e) return res.status(503).json({ error: `${botId} not available` });
      const result = [];
      for (const p of botPairs) {
        const fees = e._getPairTakerFees(p.id);
        const gm = e._pairGrowthModes[p.id] || { a: true, b: true };
        const [depA] = (p.marketA || '').split(':');
        const [depB] = (p.marketB || '').split(':');
        result.push({
          pairId: p.id, deployerA: depA, deployerB: depB,
          growthA: gm.a !== false, growthB: gm.b !== false,
          feeA: fees.feeA * 10000, feeB: fees.feeB * 10000,
          feeRT: (fees.feeA + fees.feeB) * 2 * 10000,
        });
      }
      res.json({ pairs: result, deployer: deployer || 'all', direction: direction || 'all' });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get(`/${prefix}/positions`, async (req, res) => {
    try {
      const e = eng();
      if (!e) return res.status(503).json({ error: `${botId} not available` });
      const pairMids = {};
      for (const [id, peng] of Object.entries(engines)) pairMids[id] = peng.lastMids;
      const positions = await e.getPositionsList();
      const enriched = positions.map(pos => {
        const mids = pairMids[pos.pairId];
        const midA = mids?.midA || 0;
        const midB = mids?.midB || 0;
        const spreadPnlBps = e.computeSpreadPnlBps(pos, midA, midB);
        const spreadPnlUsd = e.computeSpreadPnlUsd(pos, midA, midB);
        const feesRT = e.getPairFeeRoundTripBps(pos.pairId);
        return { ...pos, midA, midB, spreadPnlBps, spreadPnlUsd, feesRT };
      });
      res.json(enriched);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get(`/${prefix}/fills`, async (req, res) => {
    try {
      const e = eng();
      if (!e) return res.status(503).json({ error: `${botId} not available` });
      const limit = parseInt(req.query.n || '100');
      res.json(await e.getRecentFills(limit));
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.post(`/${prefix}/force-close-pair/:pairId`, async (req, res) => {
    try {
      const e = eng();
      if (!e) return res.status(503).json({ error: `${botId} not available` });
      res.json(await e.forceClosePair(req.params.pairId));
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
  });

  app.post(`/${prefix}/force-close-all`, async (req, res) => {
    try {
      const e = eng();
      if (!e) return res.status(503).json({ error: `${botId} not available` });
      res.json({ ok: true, results: await e.forceCloseAll() });
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
  });

  app.post(`/${prefix}/reset`, async (req, res) => {
    const e = eng();
    if (!e) return res.status(503).json({ error: `${botId} not available` });
    const result = await e.reset();
    res.json({ ok: true, message: `${botId} reset: all trades cleared, bot stopped`, closedPositions: result.closedPositions || [] });
  });

  app.post(`/${prefix}/config`, async (req, res) => {
    const e = eng();
    if (!e) return res.status(503).json({ error: `${botId} not available` });
    await e.updateConfig(req.body);
    res.json({ ok: true, config: e.getConfig() });
  });

  app.post(`/${prefix}/pair-overrides`, (req, res) => {
    const e = eng();
    if (!e) return res.status(503).json({ error: `${botId} not available` });
    const { pairId, zThreshold, bufferBps } = req.body;
    if (!pairId) return res.status(400).json({ error: 'pairId required' });
    const result = e.setPairOverrides(pairId, { zThreshold, bufferBps });
    res.json(result);
  });

  app.get(`/${prefix}/trades`, async (req, res) => {
    const e = eng();
    if (!e) return res.status(503).json({ error: `${botId} not available` });
    const limit = parseInt(req.query.n || '50');
    res.json(await e.getTradeHistory(limit));
  });

  app.get(`/${prefix}/trades/open`, async (req, res) => {
    try {
      const result = await db.pool.query(
        `SELECT * FROM bot_trades WHERE status = 'open' AND bot_id = $1 ORDER BY entry_ts DESC`, [botId]
      );
      res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get(`/${prefix}/trades/closed`, async (req, res) => {
    try {
      const limit = parseInt(req.query.n || '50');
      const pair = req.query.pair || null;
      let whereClause = `status NOT IN ('open','orphan_closing') AND bot_id = $1`;
      const params = [botId, limit];
      if (pair) { whereClause += ` AND pair_id = $3`; params.push(pair); }
      const [result, countRes] = await Promise.all([
        db.pool.query(`SELECT * FROM bot_trades WHERE ${whereClause} ORDER BY COALESCE(close_ts, entry_ts) DESC LIMIT $2`, params),
        db.pool.query(
          pair
            ? `SELECT COUNT(*)::int as total FROM bot_trades WHERE status NOT IN ('open','orphan_closing') AND bot_id = $1 AND pair_id = $2`
            : `SELECT COUNT(*)::int as total FROM bot_trades WHERE status NOT IN ('open','orphan_closing') AND bot_id = $1`,
          pair ? [botId, pair] : [botId]
        )
      ]);
      res.json({ rows: result.rows, total: countRes.rows[0].total });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get(`/${prefix}/dn-status`, (req, res) => {
    const e = eng();
    if (!e) return res.status(503).json({ error: `${botId} not available` });
    res.json(e.getDnStatus());
  });

  app.get(`/${prefix}/pair-stats`, async (req, res) => {
    const e = eng();
    if (!e) return res.status(503).json({ error: `${botId} not available` });
    const pairMids = {};
    for (const [id, peng] of Object.entries(engines)) pairMids[id] = peng.lastMids;
    res.json(await e.getPairStats(pairMids));
  });

  app.get(`/${prefix}/funding`, async (req, res) => {
    try {
      const e = eng();
      if (!e) return res.status(503).json({ error: `${botId} not available` });
      const now = Date.now();
      if (now - _cachedFunding.ts > 60000) {
        const dexNames = new Set();
        for (const p of pairs) {
          const [dA] = p.marketA.split(':');
          const [dB] = p.marketB.split(':');
          dexNames.add(dA); dexNames.add(dB);
        }
        _cachedFunding = { rates: await hlApi.getFundingRates([...dexNames]), ts: now };
      }
      await e._refreshFundingPayments();
      const totalWalletFunding = e.getTotalWalletFunding();
      res.json({ fundingNet: totalWalletFunding, totalWalletFunding, rates: _cachedFunding.rates });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get(`/${prefix}/slippage-stats`, async (req, res) => {
    try {
      const tsMin = Date.now() - 3 * 86400000;
      const r = await db.pool.query(`
        SELECT pair_id, COUNT(*)::int as fills,
          ROUND(AVG(slippage_bps)::numeric, 2) as avg_slip,
          ROUND((PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY slippage_bps))::numeric, 2) as p50_slip,
          ROUND(MAX(slippage_bps)::numeric, 2) as max_slip
        FROM position_fills
        WHERE fill_type = 'entry' AND slippage_bps IS NOT NULL AND ts > $1 AND bot_id = $2
        GROUP BY pair_id ORDER BY avg_slip DESC
      `, [tsMin, botId]);
      const result = {};
      for (const row of r.rows) {
        result[row.pair_id] = { trades: row.fills, avgSlip: parseFloat(row.avg_slip), p50Slip: parseFloat(row.p50_slip), maxSlip: parseFloat(row.max_slip) };
      }
      res.json(result);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get(`/${prefix}/pnl-reconciliation`, async (req, res) => {
    try {
      const e = eng();
      if (!e) return res.status(503).json({ error: `${botId} not available` });
      const trades = await db.pool.query(`
        SELECT id, pair_id, direction, status, entry_ts, close_ts,
               leg_a_coin, leg_a_side, leg_a_size, leg_a_fill_price, close_leg_a_price,
               leg_b_coin, leg_b_side, leg_b_size, leg_b_fill_price, close_leg_b_price,
               realized_pnl_usd, realized_pnl_bps, fees_usd, error_cost_usd, error_msg,
               signal_edge_bps, slippage_entry_bps, target_profit_bps
        FROM bot_trades WHERE status IN ('closed','error','orphan_closed','closing') AND bot_id = $1
        ORDER BY close_ts DESC NULLS LAST LIMIT 200
      `, [botId]);
      const now = Date.now();
      await e._refreshFundingPayments();
      const totalWalletFunding = e.getTotalWalletFunding();
      let totalGross = 0, totalFees = 0, totalErrorCost = 0;
      const details = trades.rows.map(t => {
        const gross = parseFloat(t.realized_pnl_usd) || 0;
        const fees = parseFloat(t.fees_usd) || 0;
        const errorCost = parseFloat(t.error_cost_usd) || 0;
        const net = gross - fees - errorCost;
        totalGross += gross; totalFees += fees; totalErrorCost += errorCost;
        return {
          id: t.id, pair: t.pair_id, dir: t.direction, status: t.status,
          entryTs: t.entry_ts, closeTs: t.close_ts, holdMin: (((parseInt(t.close_ts) || now) - parseInt(t.entry_ts)) / 60000).toFixed(1),
          legA: { coin: t.leg_a_coin, side: t.leg_a_side, size: t.leg_a_size, entryPx: t.leg_a_fill_price, exitPx: t.close_leg_a_price },
          legB: { coin: t.leg_b_coin, side: t.leg_b_side, size: t.leg_b_size, entryPx: t.leg_b_fill_price, exitPx: t.close_leg_b_price },
          grossPnl: gross.toFixed(4), fees: fees.toFixed(4),
          errorCost: errorCost.toFixed(4), netPnl: net.toFixed(4),
          signalEdge: t.signal_edge_bps, slippage: t.slippage_entry_bps, targetTp: t.target_profit_bps, error: t.error_msg
        };
      });
      const ls = await e.getLiveStats();
      const dnCost = ls.dnAdjustmentCostUsd || 0;
      res.json({
        totals: { grossPnl: totalGross.toFixed(4), fees: totalFees.toFixed(4), funding: totalWalletFunding.toFixed(4), errorCost: totalErrorCost.toFixed(4), dnCost: dnCost.toFixed(4), orphanCost: (ls.orphanCostUsd || 0).toFixed(4), orphansClosed: ls.orphansClosed || 0, netPnl: (totalGross - totalFees + totalWalletFunding - totalErrorCost - dnCost).toFixed(4) },
        trades: details
      });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get(`/${prefix}/missed-stats`, (req, res) => {
    const e = eng();
    if (!e) return res.status(503).json({ error: `${botId} not available` });
    res.json(e.getMissedStats());
  });

  app.get(`/${prefix}/activity`, (req, res) => {
    const e = eng();
    if (!e) return res.status(503).json({ error: `${botId} not available` });
    const n = parseInt(req.query.n || '50');
    res.json(e.getActivityLog(n));
  });

  app.get(`/${prefix}/activity-history`, async (req, res) => {
    try {
      const result = await db.getActivityHistoryPaginated({
        page: req.query.page, limit: req.query.limit,
        pair: req.query.pair || undefined, type: req.query.type || undefined,
        motif: req.query.motif || undefined, from: req.query.from || undefined,
        to: req.query.to || undefined, search: req.query.search || undefined,
        botId,
      });
      res.json(result);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get(`/${prefix}/daily-stats`, async (req, res) => {
    try {
      const result = await db.pool.query(`
        SELECT 
          TO_CHAR(TO_TIMESTAMP(entry_ts / 1000) AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD') as date,
          COUNT(*) as trades,
          COUNT(*) FILTER (WHERE (realized_pnl_usd - COALESCE(fees_usd, 0)) > 0) as wins,
          COUNT(*) FILTER (WHERE (realized_pnl_usd - COALESCE(fees_usd, 0)) <= 0 AND status != 'open') as losses,
          COALESCE(SUM(realized_pnl_usd), 0) as pnl_gross,
          COALESCE(SUM(fees_usd), 0) as fees,
          COALESCE(SUM(COALESCE(error_cost_usd, 0)), 0) as error_cost,
          COALESCE(SUM((CASE WHEN leg_a_fill_price IS NOT NULL THEN leg_a_size * leg_a_fill_price ELSE 0 END + CASE WHEN leg_b_fill_price IS NOT NULL THEN leg_b_size * leg_b_fill_price ELSE 0 END) / 2.0) FILTER (WHERE status = 'closed'), 0) as volume,
          COUNT(*) FILTER (WHERE status IN ('error','orphan_closed','closed_orphan')) as errors
        FROM bot_trades
        WHERE status != 'open' AND pair_id NOT LIKE 'dn_adjustment%' AND bot_id = $1
        GROUP BY TO_CHAR(TO_TIMESTAMP(entry_ts / 1000) AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD')
        ORDER BY date DESC
      `, [botId]);
      const days = result.rows.map(r => ({
        date: r.date, trades: parseInt(r.trades), wins: parseInt(r.wins), losses: parseInt(r.losses),
        pnl_net: parseFloat(r.pnl_gross) - parseFloat(r.fees) - parseFloat(r.error_cost),
        pnl_gross: parseFloat(r.pnl_gross), fees: parseFloat(r.fees), volume: parseFloat(r.volume), errors: parseInt(r.errors),
        win_rate: parseInt(r.trades) > 0 ? Math.round((parseInt(r.wins) / parseInt(r.trades)) * 100) : 0,
      }));
      res.json(days);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get(`/${prefix}/corrections-stats`, async (req, res) => {
    try {
      const [dnRes, errRes] = await Promise.all([
        db.pool.query(`SELECT pair_id, COUNT(*) as dn_count, COALESCE(SUM(COALESCE(error_cost_usd, 0)), 0) as dn_cost FROM bot_trades WHERE pair_id LIKE 'dn_adjustment%' AND bot_id = $1 GROUP BY pair_id`, [botId]),
        db.pool.query(`SELECT pair_id, COUNT(*) as err_count, COALESCE(SUM(COALESCE(error_cost_usd, 0)), 0) as err_cost, COUNT(*) FILTER (WHERE status = 'error') as errors, COUNT(*) FILTER (WHERE status IN ('orphan_closed','closed_orphan')) as orphans, COUNT(*) FILTER (WHERE status = 'slippage_guard') as slippage FROM bot_trades WHERE pair_id NOT LIKE 'dn_adjustment%' AND status IN ('error', 'orphan_closed', 'closed_orphan', 'slippage_guard') AND bot_id = $1 GROUP BY pair_id`, [botId])
      ]);
      const coins = {};
      for (const r of dnRes.rows) {
        const coin = r.pair_id.replace(/^dn_adjustment_/, '') || 'unknown';
        if (!coins[coin]) coins[coin] = { coin, dnCount: 0, dnCostUsd: 0, errorCount: 0, orphanCount: 0, errCostUsd: 0 };
        coins[coin].dnCount += parseInt(r.dn_count); coins[coin].dnCostUsd += parseFloat(r.dn_cost);
      }
      for (const r of errRes.rows) {
        const parts = r.pair_id.split('-');
        const coin = parts.length >= 3 ? parts[parts.length - 1] : r.pair_id;
        if (!coins[coin]) coins[coin] = { coin, dnCount: 0, dnCostUsd: 0, errorCount: 0, orphanCount: 0, errCostUsd: 0 };
        coins[coin].errorCount += parseInt(r.errors); coins[coin].orphanCount += parseInt(r.orphans) + parseInt(r.slippage); coins[coin].errCostUsd += parseFloat(r.err_cost);
      }
      const rows = Object.values(coins).sort((a, b) => (b.dnCostUsd + b.errCostUsd) - (a.dnCostUsd + a.errCostUsd));
      const totals = rows.reduce((acc, r) => ({
        dnCount: acc.dnCount + r.dnCount, dnCostUsd: acc.dnCostUsd + r.dnCostUsd,
        errorCount: acc.errorCount + r.errorCount, orphanCount: acc.orphanCount + r.orphanCount,
        errCostUsd: acc.errCostUsd + r.errCostUsd, totalCostUsd: acc.totalCostUsd + r.dnCostUsd + r.errCostUsd,
      }), { dnCount: 0, dnCostUsd: 0, errorCount: 0, orphanCount: 0, errCostUsd: 0, totalCostUsd: 0 });
      res.json({ rows, totals });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get(`/${prefix}/reconcile`, async (req, res) => {
    try {
      const e = eng();
      if (!e) return res.status(503).json({ error: `${botId} not available` });
      res.json(await e.runPositionReconciliation());
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get(`/${prefix}/edge-floor`, async (req, res) => {
    try {
      const e = eng();
      if (!e) return res.status(503).json({ error: `${botId} not available` });
      const now = Date.now();
      const { dow: currentDow } = getParisTime(new Date(now));
      const dayNames = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
      const maxAgeDays = 21;
      const tsMin = now - maxAgeDays * 24 * 3600 * 1000;
      const currentP50Mode = e.p50Mode || 'hourly';
      let dowFilter, mode;
      if (req.query.dow !== undefined) { const qDow = parseInt(req.query.dow); dowFilter = [qDow]; mode = dayNames[qDow]; }
      else if (currentP50Mode === 'week') { dowFilter = [1,2,3,4,5]; mode = 'semaine (lun-ven)'; }
      else if (currentP50Mode === 'weekend') { dowFilter = [0,6]; mode = 'weekend (sam-dim)'; }
      else { dowFilter = [currentDow]; mode = dayNames[currentDow]; }
      let result = await db.pool.query(`
        WITH base AS (
          SELECT pair_id,
            ROUND(AVG(max_edge_bps)::numeric, 2) as avg_edge,
            ROUND(percentile_cont(0.25) WITHIN GROUP (ORDER BY max_edge_bps)::numeric, 2) as p25_edge,
            ROUND(percentile_cont(0.10) WITHIN GROUP (ORDER BY max_edge_bps)::numeric, 2) as p10_edge,
            ROUND(MIN(max_edge_bps)::numeric, 2) as min_edge,
            ROUND(percentile_cont(0.50) WITHIN GROUP (ORDER BY dir1_edge_bps)::numeric, 2) as p50_dir1,
            ROUND(percentile_cont(0.50) WITHIN GROUP (ORDER BY dir2_edge_bps)::numeric, 2) as p50_dir2,
            ROUND(AVG(dir1_edge_bps)::numeric, 2) as avg_dir1,
            ROUND(AVG(dir2_edge_bps)::numeric, 2) as avg_dir2,
            ROUND(MAX(dir1_edge_bps)::numeric, 2) as max_dir1,
            ROUND(MAX(dir2_edge_bps)::numeric, 2) as max_dir2,
            COUNT(*) FILTER (WHERE dir1_edge_bps >= 10) as d1_above_10,
            COUNT(*) FILTER (WHERE dir2_edge_bps >= 10) as d2_above_10,
            COUNT(*) as samples
          FROM edge_snapshots WHERE ts > $1
            AND EXTRACT(DOW FROM to_timestamp(ts / 1000.0) AT TIME ZONE '${TIMEZONE}') = ANY($2::int[])
          GROUP BY pair_id
        ),
        liq AS (
          SELECT e.pair_id,
            COUNT(*) FILTER (WHERE e.dir1_edge_bps <= ABS(b.p50_dir1) + 2 AND (e.dir1_status = 'INSUFFICIENT_DEPTH' OR e.dir1_status = 'TOO_MUCH_SLIPPAGE')) as d1_no_liq,
            COUNT(*) FILTER (WHERE e.dir1_edge_bps <= ABS(b.p50_dir1) + 2) as d1_near_floor,
            COUNT(*) FILTER (WHERE e.dir2_edge_bps <= ABS(b.p50_dir2) + 2 AND (e.dir2_status = 'INSUFFICIENT_DEPTH' OR e.dir2_status = 'TOO_MUCH_SLIPPAGE')) as d2_no_liq,
            COUNT(*) FILTER (WHERE e.dir2_edge_bps <= ABS(b.p50_dir2) + 2) as d2_near_floor
          FROM edge_snapshots e JOIN base b ON e.pair_id = b.pair_id
          WHERE e.ts > $1 AND EXTRACT(DOW FROM to_timestamp(e.ts / 1000.0) AT TIME ZONE '${TIMEZONE}') = ANY($2::int[])
          GROUP BY e.pair_id
        )
        SELECT b.*, l.d1_no_liq, l.d1_near_floor, l.d2_no_liq, l.d2_near_floor
        FROM base b LEFT JOIN liq l ON b.pair_id = l.pair_id ORDER BY b.avg_edge DESC
      `, [tsMin, dowFilter]);
      if (result.rows.length === 0) {
        const tsMin72 = now - 72 * 3600 * 1000;
        result = await db.pool.query(`
          WITH base AS (
            SELECT pair_id, ROUND(AVG(max_edge_bps)::numeric, 2) as avg_edge, ROUND(percentile_cont(0.25) WITHIN GROUP (ORDER BY max_edge_bps)::numeric, 2) as p25_edge, ROUND(percentile_cont(0.10) WITHIN GROUP (ORDER BY max_edge_bps)::numeric, 2) as p10_edge, ROUND(MIN(max_edge_bps)::numeric, 2) as min_edge, ROUND(percentile_cont(0.50) WITHIN GROUP (ORDER BY dir1_edge_bps)::numeric, 2) as p50_dir1, ROUND(percentile_cont(0.50) WITHIN GROUP (ORDER BY dir2_edge_bps)::numeric, 2) as p50_dir2, ROUND(AVG(dir1_edge_bps)::numeric, 2) as avg_dir1, ROUND(AVG(dir2_edge_bps)::numeric, 2) as avg_dir2, ROUND(MAX(dir1_edge_bps)::numeric, 2) as max_dir1, ROUND(MAX(dir2_edge_bps)::numeric, 2) as max_dir2, COUNT(*) FILTER (WHERE dir1_edge_bps >= 10) as d1_above_10, COUNT(*) FILTER (WHERE dir2_edge_bps >= 10) as d2_above_10, COUNT(*) as samples
            FROM edge_snapshots WHERE ts > $1 GROUP BY pair_id
          ),
          liq AS (
            SELECT e.pair_id, COUNT(*) FILTER (WHERE e.dir1_edge_bps <= ABS(b.p50_dir1) + 2 AND (e.dir1_status = 'INSUFFICIENT_DEPTH' OR e.dir1_status = 'TOO_MUCH_SLIPPAGE')) as d1_no_liq, COUNT(*) FILTER (WHERE e.dir1_edge_bps <= ABS(b.p50_dir1) + 2) as d1_near_floor, COUNT(*) FILTER (WHERE e.dir2_edge_bps <= ABS(b.p50_dir2) + 2 AND (e.dir2_status = 'INSUFFICIENT_DEPTH' OR e.dir2_status = 'TOO_MUCH_SLIPPAGE')) as d2_no_liq, COUNT(*) FILTER (WHERE e.dir2_edge_bps <= ABS(b.p50_dir2) + 2) as d2_near_floor
            FROM edge_snapshots e JOIN base b ON e.pair_id = b.pair_id WHERE e.ts > $1 GROUP BY e.pair_id
          )
          SELECT b.*, l.d1_no_liq, l.d1_near_floor, l.d2_no_liq, l.d2_near_floor FROM base b LEFT JOIN liq l ON b.pair_id = l.pair_id ORDER BY b.avg_edge DESC
        `, [tsMin72]);
        mode = 'fallback 72h';
      }
      const isFallback = mode === 'fallback 72h';
      const pairObjThresholds = result.rows.map(row => ({ pairId: row.pair_id, objBps: e.getPairObjectifBps(row.pair_id) }));
      let aboveObjCounts = {};
      if (pairObjThresholds.length > 0) {
        const aboveTs = isFallback ? (now - 72 * 3600 * 1000) : tsMin;
        let baseParams, nextIdx;
        if (isFallback) { baseParams = [aboveTs]; nextIdx = 2; } else { baseParams = [tsMin, dowFilter]; nextIdx = 3; }
        const valuesClause = pairObjThresholds.map((p, i) => `($${i * 2 + nextIdx}, $${i * 2 + nextIdx + 1})`).join(', ');
        const valuesParams = pairObjThresholds.flatMap(p => [p.pairId, p.objBps]);
        const dowClause = isFallback ? '' : `AND EXTRACT(DOW FROM to_timestamp(e.ts / 1000.0) AT TIME ZONE '${TIMEZONE}') = ANY($2::int[])`;
        const aboveRes = await db.pool.query(`
          WITH thresholds(pair_id, obj) AS (VALUES ${valuesClause})
          SELECT e.pair_id, COUNT(*) FILTER (WHERE e.dir1_edge_bps >= t.obj::numeric) as d1_above_obj, COUNT(*) FILTER (WHERE e.dir2_edge_bps >= t.obj::numeric) as d2_above_obj, COUNT(*) as samples
          FROM edge_snapshots e JOIN thresholds t ON e.pair_id = t.pair_id::text WHERE e.ts > $1 ${dowClause} GROUP BY e.pair_id
        `, [...baseParams, ...valuesParams]);
        for (const r of aboveRes.rows) aboveObjCounts[r.pair_id] = { d1: parseInt(r.d1_above_obj || 0), d2: parseInt(r.d2_above_obj || 0), samples: parseInt(r.samples || 0) };
      }
      const floors = {};
      for (const row of result.rows) {
        const s = parseInt(row.samples);
        const aboveObj = aboveObjCounts[row.pair_id] || { d1: 0, d2: 0, samples: s };
        floors[row.pair_id] = {
          avgEdge: parseFloat(row.avg_edge), p25Edge: parseFloat(row.p25_edge), p10Edge: parseFloat(row.p10_edge), minEdge: parseFloat(row.min_edge),
          p50Dir1: parseFloat(row.p50_dir1), p50Dir2: parseFloat(row.p50_dir2), avgDir1: parseFloat(row.avg_dir1), avgDir2: parseFloat(row.avg_dir2),
          maxDir1: parseFloat(row.max_dir1), maxDir2: parseFloat(row.max_dir2),
          pctD1AboveObj: s > 0 ? parseFloat((aboveObj.d1 / s * 100).toFixed(1)) : 0,
          pctD2AboveObj: s > 0 ? parseFloat((aboveObj.d2 / s * 100).toFixed(1)) : 0,
          liqD1: parseInt(row.d1_near_floor || 0) > 0 ? parseFloat(((1 - parseInt(row.d1_no_liq || 0) / parseInt(row.d1_near_floor)) * 100).toFixed(1)) : 100,
          liqD2: parseInt(row.d2_near_floor || 0) > 0 ? parseFloat(((1 - parseInt(row.d2_no_liq || 0) / parseInt(row.d2_near_floor)) * 100).toFixed(1)) : 100,
          samples: s,
        };
      }
      res.json({ floors, dayMode: mode, dayOfWeek: currentDow, totalSamples: result.rows.reduce((s, r) => s + parseInt(r.samples || 0), 0) });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get(`/${prefix}/edge-floors`, async (req, res) => {
    try {
      const e = eng();
      if (!e) return res.status(503).json({ error: `${botId} not available` });
      const { hour: parisHour, dow: dayOfWeek } = getParisTime();
      const p50Mode = e.p50Mode || 'hourly';
      const now = Date.now();
      const tsMin = now - 21 * 24 * 3600 * 1000;
      const hourResult = await db.pool.query(`
        SELECT pair_id,
          EXTRACT(DOW FROM to_timestamp(ts / 1000.0) AT TIME ZONE '${TIMEZONE}')::int as dow,
          EXTRACT(HOUR FROM to_timestamp(ts / 1000.0) AT TIME ZONE '${TIMEZONE}')::int as hour_paris,
          ROUND(percentile_cont(0.50) WITHIN GROUP (ORDER BY dir1_edge_bps)::numeric, 2) as p50_dir1,
          ROUND(percentile_cont(0.50) WITHIN GROUP (ORDER BY dir2_edge_bps)::numeric, 2) as p50_dir2,
          COUNT(*) as cnt
        FROM edge_snapshots WHERE ts > $1 GROUP BY pair_id, dow, hour_paris HAVING COUNT(*) >= 2
      `, [tsMin]);
      const result = {};
      for (const row of hourResult.rows) {
        const pid = row.pair_id;
        if (!result[pid]) {
          result[pid] = {
            currentHour: parisHour, currentDow: dayOfWeek, p50Mode,
            activeFloor: { d1: 0, d2: 0, mode: p50Mode },
            feeRoundTripBps: e.getPairFeeRoundTripBps(pid),
            marginBps: e.marginBps, objectifBps: e.getPairObjectifBps(pid), byDow: {},
          };
        }
        if (!result[pid].byDow[row.dow]) result[pid].byDow[row.dow] = {};
        result[pid].byDow[row.dow][row.hour_paris] = { d1: parseFloat(row.p50_dir1), d2: parseFloat(row.p50_dir2) };
      }
      res.json(result);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get(`/${prefix}/suggest-edges`, async (req, res) => {
    try {
      const e = eng();
      if (!e) return res.status(503).json({ error: `${botId} not available` });
      const minutesBack = parseInt(req.query.minutes || '30');
      const cutoff = new Date(Date.now() - minutesBack * 60 * 1000).toISOString();
      const result = await db.pool.query(`
        SELECT pair_id, COUNT(*) as cycles, ROUND(AVG(duration_ms)::numeric / 1000) as avg_duration_s,
          ROUND(AVG(theoretical_pnl_bps)::numeric, 2) as avg_pnl_bps, ROUND(MAX(theoretical_pnl_bps)::numeric, 2) as max_pnl_bps,
          ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY theoretical_pnl_bps)::numeric, 2) as median_pnl_bps,
          SUM(CASE WHEN close_liquidity_ok THEN 1 ELSE 0 END) as liq_ok,
          SUM(CASE WHEN NOT close_liquidity_ok THEN 1 ELSE 0 END) as liq_fail
        FROM repeg_cycles WHERE created_at > $1 GROUP BY pair_id ORDER BY cycles DESC
      `, [cutoff]);
      const feeRates = e.getFeeRates();
      const feeRoundTripBps = 2 * 2 * feeRates.takerFeeGrowth * 10000;
      const suggestions = {};
      for (const r of result.rows) {
        const cycles = parseInt(r.cycles), liqOk = parseInt(r.liq_ok), liqFail = parseInt(r.liq_fail);
        const liqOkPct = cycles > 0 ? liqOk / cycles : 0;
        const avgPnl = parseFloat(r.avg_pnl_bps), maxPnl = parseFloat(r.max_pnl_bps), medianPnl = parseFloat(r.median_pnl_bps);
        const avgDuration = parseInt(r.avg_duration_s);
        let suggestedEdge, tier, reason;
        if (liqOkPct >= 0.90 && avgDuration <= 30 && avgPnl >= 3.0) { suggestedEdge = Math.max(maxPnl + 2.0, feeRoundTripBps + 7.0); suggestedEdge = Math.ceil(suggestedEdge * 2) / 2; tier = 'A'; reason = `Liq ${(liqOkPct*100).toFixed(0)}% OK, repeg ${avgDuration}s, max ${maxPnl} bps`; }
        else if (liqOkPct >= 0.80 && avgPnl >= 2.5) { suggestedEdge = Math.max(maxPnl + 3.0, feeRoundTripBps + 8.0); suggestedEdge = Math.ceil(suggestedEdge * 2) / 2; tier = 'B'; reason = `Liq ${(liqOkPct*100).toFixed(0)}% OK, repeg ${avgDuration}s, max ${maxPnl} bps`; }
        else if (liqOkPct >= 0.50) { suggestedEdge = Math.max(maxPnl + 4.0, feeRoundTripBps + 10.0); suggestedEdge = Math.ceil(suggestedEdge * 2) / 2; tier = 'C'; reason = `Liq ${(liqOkPct*100).toFixed(0)}% OK, repeg lent ${avgDuration}s, max ${maxPnl} bps`; }
        else { suggestedEdge = 0; tier = 'D'; reason = `Liq seulement ${(liqOkPct*100).toFixed(0)}% OK — trop risqué`; }
        suggestions[r.pair_id] = { suggestedEdge: parseFloat(suggestedEdge.toFixed(1)), tier, reason, cycles, liqOkPct: parseFloat((liqOkPct * 100).toFixed(0)), avgPnlBps: avgPnl, maxPnlBps: maxPnl, medianPnlBps: medianPnl, avgDurationS: avgDuration };
      }
      for (const p of pairs) {
        if (!suggestions[p.id]) suggestions[p.id] = { suggestedEdge: 0, tier: 'D', reason: 'Pas de données repeg récentes', cycles: 0, liqOkPct: 0, avgPnlBps: 0, maxPnlBps: 0, medianPnlBps: 0, avgDurationS: 0 };
      }
      res.json({ minutesAnalyzed: minutesBack, feeRoundTripBps, suggestions });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.post(`/${prefix}/vault`, async (req, res) => {
    try {
      const e = eng(); const a = api();
      if (!e || !a) return res.status(503).json({ error: `${botId} not available` });
      const { vaultAddress } = req.body;
      const addr = (vaultAddress || '').trim();
      if (addr && !/^0x[a-fA-F0-9]{40}$/.test(addr)) {
        return res.status(400).json({ error: 'Adresse vault invalide (format 0x...)' });
      }
      const wasEnabled = e.isEnabled();
      if (wasEnabled) e.stop();
      a.setVaultAddress(addr || null);
      e._initialized = false;
      e._activeAddress = a.getActiveAddress();
      await e.initialize();
      if (wasEnabled) e.start();
      await db.saveBotConfig(`${botId}_vault_address`, addr || null);
      res.json({ ok: true, vault: a.getVaultAddress() || null, activeAddress: a.getActiveAddress() });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get(`/${prefix}/dust`, async (req, res) => {
    res.json({ positions: [], message: 'Dust detection removed in position model' });
  });

  app.post(`/${prefix}/dust/close/:tradeId`, async (req, res) => {
    res.json({ ok: false, error: 'Dust close removed in position model' });
  });

  app.post(`/${prefix}/dust/close-all`, async (req, res) => {
    res.json({ ok: false, error: 'Dust close removed in position model' });
  });

  app.get(`/${prefix}/stable-balances`, (req, res) => {
    try {
      const e = eng();
      if (!e) return res.status(503).json({ error: `${botId} not available` });
      res.json(e.getStableBalances());
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.post(`/${prefix}/stable-rebalance`, async (req, res) => {
    try {
      const e = eng();
      if (!e) return res.status(503).json({ error: `${botId} not available` });
      if (req.body.targets) await e.updateConfig({ stableTargets: req.body.targets });
      if (req.body.driftThreshold !== undefined) await e.updateConfig({ driftThreshold: req.body.driftThreshold });
      if (req.body.action === 'rebalance') {
        const result = await e.triggerStableRebalance();
        return res.json(result);
      }
      res.json({ ok: true, config: { stableTargets: e._stableTargets, driftThreshold: e._driftThreshold } });
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
  });

  app.get(`/${prefix}/fee-drift`, async (req, res) => {
    try {
      const last50 = await db.pool.query(`
        SELECT id, pair_id, direction, entry_ts, fees_usd, expected_fees_usd,
               leg_a_fill_price, leg_a_size, leg_b_fill_price, leg_b_size
        FROM bot_trades
        WHERE status IN ('open','closed') AND fees_usd IS NOT NULL AND bot_id = $1
        ORDER BY entry_ts DESC LIMIT 50
      `, [botId]);
      const daily = await db.pool.query(`
        SELECT
          TO_CHAR(TO_TIMESTAMP(entry_ts / 1000.0) AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD') as day,
          COUNT(*)::int as trades,
          ROUND(SUM(fees_usd)::numeric, 4) as total_realized,
          ROUND(SUM(COALESCE(expected_fees_usd, fees_usd))::numeric, 4) as total_expected,
          ROUND(AVG(fees_usd)::numeric, 6) as avg_realized,
          ROUND(AVG(COALESCE(expected_fees_usd, fees_usd))::numeric, 6) as avg_expected
        FROM bot_trades
        WHERE status IN ('open','closed') AND fees_usd IS NOT NULL AND bot_id = $1
        GROUP BY day ORDER BY day DESC LIMIT 14
      `, [botId]);
      const trades = last50.rows.map(t => {
        const realized = parseFloat(t.fees_usd) || 0;
        const expected = parseFloat(t.expected_fees_usd) || realized;
        const notional = (parseFloat(t.leg_a_fill_price) * parseFloat(t.leg_a_size) + parseFloat(t.leg_b_fill_price) * parseFloat(t.leg_b_size)) / 2;
        const driftBps = notional > 0 ? ((realized - expected) / notional) * 10000 : 0;
        return {
          id: t.id, pair: t.pair_id, dir: t.direction, ts: parseInt(t.entry_ts),
          realized: realized.toFixed(4), expected: expected.toFixed(4),
          driftUsd: (realized - expected).toFixed(4), driftBps: Math.round(driftBps * 100) / 100,
        };
      });
      const totalRealized = trades.reduce((s, t) => s + parseFloat(t.realized), 0);
      const totalExpected = trades.reduce((s, t) => s + parseFloat(t.expected), 0);
      const avgDriftBps = trades.length > 0 ? trades.reduce((s, t) => s + t.driftBps, 0) / trades.length : 0;
      res.json({
        trades,
        daily: daily.rows.map(d => ({
          day: d.day, trades: d.trades, totalRealized: parseFloat(d.total_realized),
          totalExpected: parseFloat(d.total_expected), avgRealized: parseFloat(d.avg_realized),
          avgExpected: parseFloat(d.avg_expected),
          driftUsd: (parseFloat(d.total_realized) - parseFloat(d.total_expected)).toFixed(4),
        })),
        summary: {
          totalRealized: totalRealized.toFixed(4), totalExpected: totalExpected.toFixed(4),
          avgDriftBps: Math.round(avgDriftBps * 100) / 100, alert: Math.abs(avgDriftBps) > 0.5,
        }
      });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get(`/${prefix}/pool-ranking`, async (req, res) => {
    try {
      const result = await db.pool.query(`
        SELECT
          pair_id, COUNT(*) as total_trades,
          COUNT(*) FILTER (WHERE status = 'closed') as closed_trades,
          COUNT(*) FILTER (WHERE status = 'open') as open_trades,
          COUNT(*) FILTER (WHERE status = 'closed' AND (realized_pnl_usd - COALESCE(fees_usd, 0)) > 0) as wins,
          COUNT(*) FILTER (WHERE status = 'closed' AND (realized_pnl_usd - COALESCE(fees_usd, 0)) <= 0) as losses,
          COALESCE(SUM(realized_pnl_usd) FILTER (WHERE status = 'closed'), 0) as total_pnl_gross,
          COALESCE(SUM(fees_usd) FILTER (WHERE status = 'closed'), 0) as total_fees,
          COALESCE(SUM(COALESCE(error_cost_usd, 0)), 0) as total_error_cost,
          COALESCE(SUM(
            (CASE WHEN leg_a_fill_price IS NOT NULL THEN leg_a_size * leg_a_fill_price ELSE 0 END +
            CASE WHEN leg_b_fill_price IS NOT NULL THEN leg_b_size * leg_b_fill_price ELSE 0 END) / 2.0
          ) FILTER (WHERE status = 'closed'), 0) as total_volume,
          AVG(CASE WHEN status = 'closed' AND close_ts IS NOT NULL AND entry_ts IS NOT NULL
            THEN (close_ts::bigint - entry_ts::bigint) END) as avg_hold_ms,
          PERCENTILE_CONT(0.5) WITHIN GROUP (
            ORDER BY CASE WHEN status = 'closed' AND close_ts IS NOT NULL AND entry_ts IS NOT NULL
              THEN (close_ts::bigint - entry_ts::bigint) END
          ) as median_hold_ms,
          PERCENTILE_CONT(0.9) WITHIN GROUP (
            ORDER BY CASE WHEN status = 'closed' AND close_ts IS NOT NULL AND entry_ts IS NOT NULL
              THEN (close_ts::bigint - entry_ts::bigint) END
          ) as p90_hold_ms,
          COUNT(*) FILTER (WHERE status IN ('error','orphan_closed','closed_orphan')) as error_count
        FROM bot_trades
        WHERE pair_id NOT LIKE 'dn_adjustment%' AND bot_id = $1
        GROUP BY pair_id ORDER BY pair_id
      `, [botId]);
      const pools = result.rows.map(r => {
        const closed = parseInt(r.closed_trades) || 0;
        const total = parseInt(r.total_trades) || 0;
        const wins = parseInt(r.wins) || 0;
        const losses = parseInt(r.losses) || 0;
        const pnlGross = parseFloat(r.total_pnl_gross) || 0;
        const fees = parseFloat(r.total_fees) || 0;
        const errorCost = parseFloat(r.total_error_cost) || 0;
        const volume = parseFloat(r.total_volume) || 0;
        const avgHoldMs = parseFloat(r.avg_hold_ms) || 0;
        const medianHoldMs = parseFloat(r.median_hold_ms) || 0;
        const p90HoldMs = parseFloat(r.p90_hold_ms) || 0;
        const errors = parseInt(r.error_count) || 0;
        const winRate = closed > 0 ? (wins / closed) * 100 : 0;
        const fillRate = total > 0 ? (closed / total) * 100 : 0;
        const pnlPerVol = volume > 0 ? ((pnlGross - fees) / volume) * 10000 : 0;
        const avgHoldMin = avgHoldMs / 60000;
        const score = avgHoldMin > 0 && volume > 0 ? (pnlPerVol * (fillRate / 100)) / avgHoldMin : 0;
        return {
          pairId: r.pair_id, totalTrades: total, closedTrades: closed, openTrades: parseInt(r.open_trades) || 0,
          wins, losses, winRate: Math.round(winRate * 10) / 10,
          pnlGross: Math.round(pnlGross * 10000) / 10000,
          pnlNet: Math.round((pnlGross - fees - errorCost) * 10000) / 10000,
          fees: Math.round(fees * 10000) / 10000,
          volume: Math.round(volume * 100) / 100,
          pnlPerVolBps: Math.round(pnlPerVol * 100) / 100,
          fillRate: Math.round(fillRate * 10) / 10,
          avgHoldMs: Math.round(avgHoldMs), medianHoldMs: Math.round(medianHoldMs), p90HoldMs: Math.round(p90HoldMs),
          errors, score: Math.round(score * 1000) / 1000,
        };
      });
      pools.sort((a, b) => b.score - a.score);
      res.json({ pools });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get(`/${prefix}/errors-table`, async (req, res) => {
    try {
      const errorType = req.query.errorType || '';
      const fromTs = req.query.from ? parseInt(req.query.from) : 0;
      const toTs = req.query.to ? parseInt(req.query.to) : Date.now();
      const limit = parseInt(req.query.limit || '100');
      let whereExtra = '';
      const params = [botId, fromTs, toTs, limit];
      if (errorType) { params.push(errorType); whereExtra = ` AND status = $${params.length}`; }
      const [tradesRes, groupRes] = await Promise.all([
        db.pool.query(`
          SELECT id, pair_id, direction, status, entry_ts, close_ts,
                 error_msg, error_cost_usd, slippage_entry_bps,
                 leg_a_coin, leg_a_side, leg_b_coin, leg_b_side,
                 realized_pnl_usd, fees_usd
          FROM bot_trades
          WHERE bot_id = $1
            AND status IN ('error', 'orphan_closed', 'closed_orphan', 'slippage_guard', 'both_failed')
            AND entry_ts >= $2 AND entry_ts <= $3
            ${whereExtra}
          ORDER BY entry_ts DESC LIMIT $4
        `, params),
        db.pool.query(`
          SELECT status as error_type, COUNT(*)::int as count,
                 COALESCE(SUM(COALESCE(error_cost_usd, 0)), 0) as total_cost,
                 COALESCE(AVG(slippage_entry_bps), 0) as avg_slippage
          FROM bot_trades
          WHERE bot_id = $1
            AND status IN ('error', 'orphan_closed', 'closed_orphan', 'slippage_guard', 'both_failed')
            AND entry_ts >= $2 AND entry_ts <= $3
          GROUP BY status ORDER BY count DESC
        `, [botId, fromTs, toTs])
      ]);
      const trades = tradesRes.rows.map(t => {
        let rootCause = t.status;
        const msg = (t.error_msg || '').toLowerCase();
        if (t.status === 'error') {
          if (msg.includes('orphan')) rootCause = 'orphan';
          else if (msg.includes('slippage')) rootCause = 'slippage_guard';
          else if (msg.includes('both') && msg.includes('fail')) rootCause = 'both_failed';
          else if (msg.includes('timeout')) rootCause = 'timeout';
          else if (msg.includes('margin')) rootCause = 'margin';
        }
        if (t.status === 'orphan_closed' || t.status === 'closed_orphan') rootCause = 'orphan';
        return {
          id: t.id, pairId: t.pair_id, direction: t.direction, status: t.status, rootCause,
          entryTs: parseInt(t.entry_ts), closeTs: t.close_ts ? parseInt(t.close_ts) : null,
          errorMsg: t.error_msg, errorCost: parseFloat(t.error_cost_usd || 0),
          slippage: parseFloat(t.slippage_entry_bps || 0),
          legA: t.leg_a_coin, legB: t.leg_b_coin,
          pnl: parseFloat(t.realized_pnl_usd || 0), fees: parseFloat(t.fees_usd || 0),
        };
      });
      const groups = groupRes.rows.map(r => ({
        errorType: r.error_type, count: r.count,
        totalCost: parseFloat(r.total_cost), avgSlippage: parseFloat(r.avg_slippage),
      }));
      const totalErrors = groups.reduce((s, g) => s + g.count, 0);
      const totalCost = groups.reduce((s, g) => s + g.totalCost, 0);
      res.json({ trades, groups, totalErrors, totalCost });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get(`/${prefix}/capital-allocation`, async (req, res) => {
    try {
      const totalCapital = parseFloat(req.query.capital) || 1000;
      const maxLeverage = parseInt(req.query.leverage) || 5;
      const riskPref = req.query.risk || 'normal';
      const result = await db.pool.query(`
        SELECT
          pair_id, COUNT(*) as total_trades,
          COUNT(*) FILTER (WHERE status = 'closed') as closed_trades,
          COUNT(*) FILTER (WHERE status = 'closed' AND (realized_pnl_usd - COALESCE(fees_usd, 0)) > 0) as wins,
          COALESCE(SUM(realized_pnl_usd) FILTER (WHERE status = 'closed'), 0) as total_pnl_gross,
          COALESCE(SUM(fees_usd) FILTER (WHERE status = 'closed'), 0) as total_fees,
          COALESCE(SUM(COALESCE(error_cost_usd, 0)), 0) as total_error_cost,
          COALESCE(SUM(
            CASE WHEN leg_a_fill_price IS NOT NULL THEN leg_a_size * leg_a_fill_price ELSE 0 END +
            CASE WHEN leg_b_fill_price IS NOT NULL THEN leg_b_size * leg_b_fill_price ELSE 0 END
          ) FILTER (WHERE status = 'closed'), 0) as total_volume,
          AVG(CASE WHEN status = 'closed' AND close_ts IS NOT NULL AND entry_ts IS NOT NULL
            THEN (close_ts::bigint - entry_ts::bigint) END) as avg_hold_ms,
          COUNT(*) FILTER (WHERE status IN ('error','orphan_closed','closed_orphan')) as error_count
        FROM bot_trades
        WHERE pair_id NOT LIKE 'dn_adjustment%' AND bot_id = $1
        GROUP BY pair_id ORDER BY pair_id
      `, [botId]);
      const pools = result.rows.map(r => {
        const closed = parseInt(r.closed_trades) || 0;
        const total = parseInt(r.total_trades) || 0;
        const wins = parseInt(r.wins) || 0;
        const pnlGross = parseFloat(r.total_pnl_gross) || 0;
        const fees = parseFloat(r.total_fees) || 0;
        const errorCost = parseFloat(r.total_error_cost) || 0;
        const volume = parseFloat(r.total_volume) || 0;
        const avgHoldMs = parseFloat(r.avg_hold_ms) || 0;
        const errors = parseInt(r.error_count) || 0;
        const pnlNet = pnlGross - fees - errorCost;
        const winRate = closed > 0 ? wins / closed : 0;
        const errorRate = total > 0 ? errors / total : 0;
        const pnlPerVol = volume > 0 ? (pnlNet / volume) * 10000 : 0;
        const fillRate = total > 0 ? closed / total : 0;
        const avgHoldMin = avgHoldMs / 60000;
        const score = avgHoldMin > 0 && volume > 0 ? (pnlPerVol * fillRate) / avgHoldMin : 0;
        return { pairId: r.pair_id, closed, total, wins, pnlNet, volume, winRate, errorRate, pnlPerVol, fillRate, avgHoldMs, errors, score };
      });
      const riskMultipliers = { aggressive: 1.5, normal: 1.0, conservative: 0.6 };
      const riskMul = riskMultipliers[riskPref] || 1.0;
      const validPools = pools.filter(p => p.closed >= 3);
      if (validPools.length === 0) {
        return res.json({ totalCapital, maxLeverage, riskPref, allocations: [], message: 'Pas assez de données (min 3 trades fermés par paire)' });
      }
      const rawWeights = validPools.map(p => {
        let w = 0;
        if (p.score > 0) w += p.score * 10;
        w += p.winRate * 2;
        w += p.pnlPerVol * 0.5;
        w *= (1 - p.errorRate);
        w *= riskMul;
        if (w < 0) w = 0;
        return { ...p, rawWeight: w };
      });
      const totalWeight = rawWeights.reduce((s, p) => s + p.rawWeight, 0);
      const maxNotional = totalCapital * maxLeverage;
      const allocations = rawWeights.map(p => {
        const pct = totalWeight > 0 ? p.rawWeight / totalWeight : 1 / rawWeights.length;
        const dollars = Math.round(maxNotional * pct * 100) / 100;
        const reasons = [];
        if (p.score > 0.5) reasons.push('Score élevé');
        else if (p.score > 0) reasons.push('Score positif');
        else reasons.push('Score faible');
        if (p.winRate > 0.6) reasons.push(`WR ${(p.winRate * 100).toFixed(0)}%`);
        if (p.errorRate > 0.15) reasons.push(`Erreurs ${(p.errorRate * 100).toFixed(0)}%`);
        if (p.pnlPerVol > 0) reasons.push(`PnL/Vol +${p.pnlPerVol.toFixed(1)}bps`);
        else if (p.pnlPerVol < 0) reasons.push(`PnL/Vol ${p.pnlPerVol.toFixed(1)}bps`);
        return {
          pairId: p.pairId, allocationPct: Math.round(pct * 10000) / 100,
          allocationUsd: dollars, score: Math.round(p.score * 1000) / 1000,
          winRate: Math.round(p.winRate * 1000) / 10, errorRate: Math.round(p.errorRate * 1000) / 10,
          pnlNet: Math.round(p.pnlNet * 10000) / 10000, pnlPerVolBps: Math.round(p.pnlPerVol * 100) / 100,
          closedTrades: p.closed, reasons,
        };
      });
      allocations.sort((a, b) => b.allocationUsd - a.allocationUsd);
      res.json({ totalCapital, maxLeverage, riskPref, maxNotional, allocations });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  const _sseClientsSet = new Set();
  app.get(`/${prefix}/events`, (req, res) => {
    const e = eng();
    if (!e) return res.status(503).json({ error: `${botId} not available` });
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('data: {"type":"CONNECTED"}\n\n');
    const client = { res };
    _sseClientsSet.add(client);
    const unsub = e.onEvent((event) => {
      try { res.write(`data: ${JSON.stringify(event)}\n\n`); } catch (_) {}
    });
    const heartbeat = setInterval(() => {
      try { res.write(': heartbeat\n\n'); } catch (_) {}
    }, 30000);
    let cleaned = false;
    function cleanup() {
      if (cleaned) return;
      cleaned = true;
      _sseClientsSet.delete(client);
      unsub();
      clearInterval(heartbeat);
    }
    req.on('close', cleanup);
    req.on('error', cleanup);
    res.on('error', cleanup);
  });

  app.get(`/${prefix}/chart-data/:pairId`, async (req, res) => {
    try {
      const e = eng();
      const hours = parseInt(req.query.hours || '4');
      const since = Date.now() - hours * 3600 * 1000;
      const rows = await db.pool.query(
        `SELECT ts, dir1_edge_bps, dir2_edge_bps, max_edge_bps, mid_a, mid_b
         FROM edge_snapshots WHERE pair_id = $1 AND ts >= $2 ORDER BY ts ASC`,
        [req.params.pairId, since]
      );
      const entryMinBps = e?.pairConfigs?.[req.params.pairId]?.entryMinBps || 3;
      res.json({ snapshots: rows.rows, entryMinBps });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get(`/${prefix}/edge-history/:pairId`, async (req, res) => {
    try {
      const hours = parseInt(req.query.hours || '24');
      const data = await db.getEdgeHistory(req.params.pairId, hours);
      res.json(data);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get(`/${prefix}/edge-export.csv`, async (req, res) => {
    try {
      const rows = await db.getEdgeExportCsv();
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=edge_snapshots_${botId}.csv`);
      const header = 'pair_id,timestamp,datetime_utc,dir1_edge_bps,dir2_edge_bps,max_edge_bps,dir1_status,dir2_status,mid_a,mid_b\n';
      const lines = rows.map(r =>
        `${r.pair_id},${r.ts},${new Date(parseInt(r.ts)).toISOString()},${r.dir1_edge_bps},${r.dir2_edge_bps},${r.max_edge_bps},${r.dir1_status},${r.dir2_status},${r.mid_a},${r.mid_b}`
      ).join('\n');
      res.send(header + lines);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  console.log(`[${botId}] All /${prefix}/ routes registered`);
}

module.exports = { registerGenericBotRoutes };
