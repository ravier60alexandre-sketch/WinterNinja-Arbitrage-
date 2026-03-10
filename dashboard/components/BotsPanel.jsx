'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';

// ─── Color helpers ──────────────────────────────────────────
const pnlClass = (v) => v > 0 ? 'text-accent-green' : v < 0 ? 'text-accent-red' : 'text-gray-400';
const fmtUsd = (v) => (v >= 0 ? '+' : '') + '$' + Math.abs(v).toFixed(4);
const fmtK = (v) => v >= 1000 ? '$' + (v / 1000).toFixed(2) + 'K' : '$' + v.toFixed(2);
const fmtPct = (v) => v === null || v === undefined ? '--%' : v.toFixed(0) + '%';
const truncAddr = (a) => a ? `${a.slice(0, 6)}...${a.slice(-4)}` : '';

const EXCHANGE_COLORS = {
  FLX: { border: 'border-orange-400', bg: 'bg-orange-400/10', text: 'text-orange-400', tag: 'bg-orange-400' },
  KM:  { border: 'border-emerald-400', bg: 'bg-emerald-400/10', text: 'text-emerald-400', tag: 'bg-emerald-400' },
  CASH: { border: 'border-blue-400', bg: 'bg-blue-400/10', text: 'text-blue-400', tag: 'bg-blue-400' },
};

const TIER_COLORS = {
  P: 'bg-red-500',
  A: 'bg-green-500',
  N: 'bg-amber-500',
};

function interpPercentile(stats, pct, dir) {
  const p10 = stats?.[`p10_${dir}`], p50 = stats?.[`p50_${dir}`], p90 = stats?.[`p90_${dir}`];
  if (p50 == null) return null;
  if (pct <= 0.10) return p10;
  if (pct <= 0.50) return p10 != null ? p10 + (p50 - p10) * ((pct - 0.10) / 0.40) : p50;
  if (pct <= 0.90) return p50 + ((p90 ?? p50) - p50) * ((pct - 0.50) / 0.40);
  return p90;
}

// ─── Default 6-bot definitions (client-side fallback) ─────
const DEFAULT_METRICS = {
  pnl_net: 0, fees: 0, volume: 0, open: 0, closed: 0,
  win_pct: null, wins: 0, losses: 0, slip_avg_bps: 0,
  errors: 0, orphans: 0, orphan_losses: 0, funding: 0,
};
const DEFAULT_CONFIG = {
  size: 0, max_pos: 300, max_global: 1000, max_lev: 10, sl_bps: 0,
  max_loss_bps: 500, percentile: 0.75, buf: 0, slip: 2,
  timer: '6h', close_buffer_bps: 0, zmr: false, close_fee_rt_buffer: false,
};
const DEFAULT_BOTS = [
  { id: 1, name: 'Long XYZ / Short CASH', exchange: 'CASH', pair_b: 'cash', direction: 'long' },
  { id: 2, name: 'Long XYZ / Short KM',   exchange: 'KM',   pair_b: 'km',   direction: 'long' },
  { id: 3, name: 'Long XYZ / Short FLX',  exchange: 'FLX',  pair_b: 'flx',  direction: 'long' },
  { id: 4, name: 'Short XYZ / Long CASH', exchange: 'CASH', pair_b: 'cash', direction: 'short' },
  { id: 5, name: 'Short XYZ / Long KM',   exchange: 'KM',   pair_b: 'km',   direction: 'short' },
  { id: 6, name: 'Short XYZ / Long FLX',  exchange: 'FLX',  pair_b: 'flx',  direction: 'short' },
].map(d => ({
  ...d, label: d.name, state: 'stopped', wallet: '', sub_account: '',
  collateral: { usdc: 0, usdh: 0, total: 0 }, ping_ms: 0, fees_bps: 0.45,
  metrics: { ...DEFAULT_METRICS }, config: { ...DEFAULT_CONFIG },
  pairs: [], tiers_enabled: true, open_trades: [],
}));

const DEFAULT_GLOBAL_STATS = {
  combined_open: 0, net_pnl: 0, total_fees: 0, total_funding: 0,
  total_volume: 0, total_trades: 0, routed: 0, rejected: 0,
};

function validateBots(d) {
  return d?.bots?.length > 0 && d.bots[0].exchange && d.bots[0].direction;
}

export default function BotsPanel() {
  const [data, setData] = useState({ bots: DEFAULT_BOTS, global_stats: DEFAULT_GLOBAL_STATS });
  const [tab, setTab] = useState('short');
  const [backendOffline, setBackendOffline] = useState(false);
  const [editingWallet, setEditingWallet] = useState(null);
  const [walletInput, setWalletInput] = useState('');
  const [logs, setLogs] = useState([]);
  const [showLogs, setShowLogs] = useState(true);
  const [spreadStats, setSpreadStats] = useState({});

  const fetchData = useCallback(() => {
    fetch('/api/bots')
      .then(r => r.json())
      .then(d => {
        // Only use backend data if it has expected format (exchange + direction)
        if (validateBots(d)) {
          setData(d);
        }
        // Otherwise keep default 6-bot layout
      })
      .catch(() => {});
  }, []);

  const fetchLogs = useCallback(() => {
    fetch('/api/logs?limit=50')
      .then(r => r.json())
      .then(d => setLogs(d.logs || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchData();
    fetchLogs();
    const interval = setInterval(() => { fetchData(); fetchLogs(); }, 3000);
    return () => clearInterval(interval);
  }, [fetchData, fetchLogs]);

  // Fetch spread stats every 30s for pair toggle percentile display
  useEffect(() => {
    const fetchSpreadStats = () => {
      fetch('/api/stats/all?window=6h')
        .then(r => r.json())
        .then(d => {
          if (d.pairs) {
            const map = {};
            for (const p of d.pairs) {
              const coin = p.pair_a.split(':')[1];
              const dex = p.pair_b.split(':')[0];
              map[`${dex}|${coin}`] = {
                p10_d1: p.direction_1?.p10, p50_d1: p.direction_1?.p50, p90_d1: p.direction_1?.p90,
                p10_d2: p.direction_2?.p10, p50_d2: p.direction_2?.p50, p90_d2: p.direction_2?.p90,
              };
            }
            setSpreadStats(map);
          }
        })
        .catch(() => {});
    };
    fetchSpreadStats();
    const iv = setInterval(fetchSpreadStats, 30000);
    return () => clearInterval(iv);
  }, []);

  const handleAction = useCallback((botId, action) => {
    fetch('/api/bots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bot_id: botId, action }),
    }).then(r => r.json()).then(d => {
      if (d._fallback) setBackendOffline(true);
      else setBackendOffline(false);
      fetchData();
    }).catch(console.error);
  }, [fetchData]);

  const handleConfigUpdate = useCallback((botId, config) => {
    fetch('/api/bots', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bot_id: botId, config }),
    }).then(() => fetchData()).catch(console.error);
  }, [fetchData]);

  const handleWalletSet = useCallback((botId, field, value) => {
    fetch('/api/bots', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bot_id: botId, [field]: value }),
    }).then(() => {
      fetchData();
      setEditingWallet(null);
      setWalletInput('');
    }).catch(console.error);
  }, [fetchData]);

  const handleApiKeySet = useCallback((botId, apiKey) => {
    fetch('/api/bots', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bot_id: botId, api_key: apiKey }),
    }).then(() => fetchData()).catch(console.error);
  }, [fetchData]);

  const handlePairToggle = useCallback((botId, pairIdx, enabled) => {
    const bot = data.bots.find(b => b.id === botId);
    if (!bot) return;
    const pairs = [...bot.pairs];
    pairs[pairIdx] = { ...pairs[pairIdx], enabled };
    fetch('/api/bots', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bot_id: botId, pairs }),
    }).then(() => fetchData()).catch(console.error);
  }, [data, fetchData]);

  const handleTiersToggle = useCallback((botId, enabled) => {
    fetch('/api/bots', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bot_id: botId, tiers_enabled: enabled }),
    }).then(() => fetchData()).catch(console.error);
  }, [fetchData]);

  const shortBots = data.bots.filter(b => b.direction === 'short').sort((a, b) => a.id - b.id);
  const longBots = data.bots.filter(b => b.direction === 'long').sort((a, b) => a.id - b.id);
  const displayedBots = tab === 'short' ? shortBots : longBots;

  const gs = data.global_stats || {};

  const botCounters = data.bots.map(b => ({
    id: b.id,
    label: `BOT${b.id} ${b.exchange}`,
    count: b.metrics?.closed || 0,
  }));

  return (
    <div>
      {/* ─── Backend offline warning ──── */}
      {backendOffline && (
        <div className="mb-4 px-3 py-2 bg-red-900/30 border border-red-500/50 rounded-lg text-red-300 text-xs">
          Backend offline — bot actions only update local state, no real execution.
        </div>
      )}

      {/* ─── Sub-header: Title + Short/Long toggle ──── */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-gray-200 tracking-wide">6-BOT DEPLOYER ROUTER</h2>
        </div>
        <div className="flex bg-bg-primary rounded-lg p-0.5 border border-bg-border">
          <button
            onClick={() => setTab('short')}
            className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${
              tab === 'short'
                ? 'bg-accent-blue text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            XYZ Short
          </button>
          <button
            onClick={() => setTab('long')}
            className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${
              tab === 'long'
                ? 'bg-accent-blue text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            XYZ Long
          </button>
        </div>
      </div>

      {/* ─── Global stats row ──── */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-3">
        <StatBox label="COMBINED OPEN" value={gs.combined_open || displayedBots.reduce((s, b) => s + (b.metrics?.open || 0), 0)} />
        <StatBox label="NET PNL" value={fmtUsd(displayedBots.reduce((s, b) => s + (b.metrics?.pnl_net || 0), 0))}
          className={pnlClass(displayedBots.reduce((s, b) => s + (b.metrics?.pnl_net || 0), 0))} />
        <StatBox label="TOTAL FEES" value={fmtUsd(displayedBots.reduce((s, b) => s + (b.metrics?.fees || 0), 0))} />
        <StatBox label="TOTAL FUNDING" value={fmtUsd(displayedBots.reduce((s, b) => s + (b.metrics?.funding || 0), 0))} />
        <StatBox label="TOTAL VOLUME" value={fmtK(displayedBots.reduce((s, b) => s + (b.metrics?.volume || 0), 0))} />
        <StatBox label="TOTAL TRADES" value={displayedBots.reduce((s, b) => s + (b.metrics?.closed || 0), 0)} />
      </div>

      {/* ─── Route counters ──── */}
      <div className="flex flex-wrap gap-3 text-[10px] mb-6">
        <CounterChip label="ROUTED" value={gs.routed || 0} color="text-accent-green" />
        <CounterChip label="REJECTED" value={gs.rejected || 0} color="text-accent-red" />
        {botCounters.map(bc => (
          <CounterChip key={bc.id} label={bc.label} value={bc.count} color="text-gray-400" />
        ))}
      </div>

      {/* ─── Bot Cards Grid ──── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {displayedBots.map(bot => (
          <BotColumn
            key={bot.id}
            bot={bot}
            spreadStats={spreadStats}
            onAction={handleAction}
            onConfigUpdate={handleConfigUpdate}
            onWalletSet={handleWalletSet}
            onApiKeySet={handleApiKeySet}
            onPairToggle={handlePairToggle}
            onTiersToggle={handleTiersToggle}
            editingWallet={editingWallet}
            setEditingWallet={setEditingWallet}
            walletInput={walletInput}
            setWalletInput={setWalletInput}
          />
        ))}
      </div>

      {/* ─── Activity Logs Panel ──── */}
      <div className="bg-bg-card rounded-xl border border-bg-border overflow-hidden">
        <button
          onClick={() => setShowLogs(!showLogs)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-bg-primary/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-accent-green animate-pulse" />
            <span className="text-xs font-bold text-gray-200 uppercase">Bot Engine Logs</span>
            <span className="text-[10px] text-gray-600">({logs.length} entries)</span>
          </div>
          <span className="text-gray-500 text-xs">{showLogs ? 'Hide' : 'Show'}</span>
        </button>
        {showLogs && (
          <div className="border-t border-bg-border bg-[#0d0d15] max-h-[300px] overflow-y-auto font-mono text-[11px]">
            {logs.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-500">
                No logs yet. Start a bot to see activity here.
                <br />
                <span className="text-[10px] text-gray-600 mt-1 block">
                  Make sure the bot-engine (FastAPI backend) is running on port 8000
                </span>
              </div>
            ) : (
              logs.slice().reverse().map((log, i) => (
                <div key={i} className={`px-4 py-1 border-b border-bg-border flex gap-3 ${
                  log.level === 'ERROR' ? 'bg-red-900/20' :
                  log.level === 'WARNING' ? 'bg-amber-900/20' : ''
                }`}>
                  <span className="text-gray-500 shrink-0">{log.ts?.split('T')[1]?.slice(0, 8) || ''}</span>
                  <span className={`shrink-0 w-12 ${
                    log.level === 'ERROR' ? 'text-red-400' :
                    log.level === 'WARNING' ? 'text-amber-400' :
                    log.level === 'INFO' ? 'text-green-400' : 'text-gray-400'
                  }`}>{log.level}</span>
                  <span className="text-gray-300">{log.msg}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Stat box (header) ──────────────────────────────────────
function StatBox({ label, value, className = '' }) {
  return (
    <div className="bg-bg-card rounded-lg border border-bg-border px-3 py-2">
      <div className="text-[9px] text-gray-600 uppercase tracking-wider">{label}</div>
      <div className={`text-lg font-mono font-bold mt-0.5 ${className || 'text-gray-200'}`}>{value}</div>
    </div>
  );
}

function CounterChip({ label, value, color }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-gray-600 uppercase">{label}</span>
      <span className={`font-mono font-bold ${color}`}>{value}</span>
    </div>
  );
}

// ─── Bot Column (full section) ──────────────────────────────
function BotColumn({ bot, spreadStats, onAction, onConfigUpdate, onWalletSet, onApiKeySet, onPairToggle, onTiersToggle, editingWallet, setEditingWallet, walletInput, setWalletInput }) {
  const ec = EXCHANGE_COLORS[bot.exchange] || EXCHANGE_COLORS.FLX;
  const [localConfig, setLocalConfig] = useState(bot.config);
  const [dirty, setDirty] = useState(false);
  const serverConfigRef = useRef(null);

  useEffect(() => {
    const serverJson = JSON.stringify(bot.config);
    if (serverJson !== serverConfigRef.current) {
      serverConfigRef.current = serverJson;
      if (!dirty) {
        setLocalConfig(bot.config);
      }
    }
  }, [bot.config, dirty]);

  const updateLocal = (key, val) => {
    setDirty(true);
    setLocalConfig(prev => ({ ...prev, [key]: val }));
  };

  const applyConfig = () => {
    onConfigUpdate(bot.id, localConfig);
    setDirty(false);
  };

  return (
    <div className="space-y-4">
      {/* ─── Bot Header Card ──── */}
      <div className={`bg-bg-card rounded-xl border-2 ${ec.border} p-4`}>
        {/* Title row */}
        <div className="flex items-center gap-2 mb-3">
          <span className={`${ec.tag} text-white text-[10px] font-bold px-2 py-0.5 rounded`}>{bot.exchange}</span>
          <span className="text-sm font-bold text-gray-200">#{bot.id} {bot.name}</span>
        </div>

        {/* Status + Controls */}
        <div className="flex items-center gap-2 mb-3">
          <span className={`flex items-center gap-1.5 text-xs font-semibold ${bot.state === 'running' ? 'text-accent-green' : 'text-accent-red'}`}>
            <span className={`w-2 h-2 rounded-full ${bot.state === 'running' ? 'bg-accent-green animate-pulse' : 'bg-accent-red'}`} />
            {bot.state.toUpperCase()}
          </span>
          <div className="flex gap-1.5 ml-auto">
            <button onClick={() => onAction(bot.id, 'start')}
              className="px-3 py-1 text-[10px] font-semibold bg-accent-green text-white rounded-md hover:brightness-110 transition-all">
              Start
            </button>
            <button onClick={() => onAction(bot.id, 'liquidate')}
              className="px-3 py-1 text-[10px] font-semibold bg-accent-amber text-white rounded-md hover:brightness-110 transition-all">
              LIQUIDATION
            </button>
            <button onClick={() => onAction(bot.id, 'reset')}
              className="px-3 py-1 text-[10px] font-semibold bg-accent-red text-white rounded-md hover:brightness-110 transition-all">
              Reset
            </button>
          </div>
        </div>

        {/* Collateral row */}
        <div className="flex items-center gap-4 text-[10px] text-gray-500 mb-2">
          <span>COLL:</span>
          <span>USDC <span className="font-mono text-accent-green">{bot.collateral?.usdc?.toFixed(2) || '0.00'}</span></span>
          <span>USDH <span className="font-mono text-accent-green">{bot.collateral?.usdh?.toFixed(2) || '0.00'}</span></span>
          <span>Total <span className="font-mono text-accent-green">{bot.collateral?.total?.toFixed(2) || '0.00'}</span></span>
          <span className="ml-auto">Ping <span className="font-mono text-gray-200">{bot.ping_ms || 0}ms</span></span>
        </div>

        {/* Fees */}
        <div className="text-[10px] text-gray-500 mb-3">
          Fees <span className="font-mono text-accent-green">{bot.fees_bps || 0.45}bps</span>
        </div>

        {/* API Key (Private Key) */}
        <ApiKeyField
          botId={bot.id}
          maskedKey={bot.api_key_masked}
          onSave={onApiKeySet}
        />

        {/* Wallet */}
        <WalletField
          label="Wallet"
          value={bot.wallet}
          botId={bot.id}
          field="wallet"
          editingWallet={editingWallet}
          setEditingWallet={setEditingWallet}
          walletInput={walletInput}
          setWalletInput={setWalletInput}
          onSet={onWalletSet}
        />

        {/* Sub-account */}
        <WalletField
          label="Sub-acct"
          value={bot.sub_account}
          botId={bot.id}
          field="sub_account"
          editingWallet={editingWallet}
          setEditingWallet={setEditingWallet}
          walletInput={walletInput}
          setWalletInput={setWalletInput}
          onSet={onWalletSet}
        />
      </div>

      {/* ─── Dashboard Section ──── */}
      <div className="bg-bg-card rounded-xl border border-bg-border p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className={`w-1 h-4 rounded ${ec.tag}`} />
          <span className="text-xs font-bold text-gray-200 uppercase">Dashboard #{bot.id} {bot.name}</span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <MetricBox label="PNL NET" value={fmtUsd(bot.metrics?.pnl_net || 0)} color={pnlClass(bot.metrics?.pnl_net || 0)} chart />
          <MetricBox label="FEES" value={fmtUsd(bot.metrics?.fees || 0)} />
          <MetricBox label="VOLUME" value={fmtK(bot.metrics?.volume || 0)} />
          <MetricBox label="OPEN" value={bot.metrics?.open || 0} />
          <MetricBox label="CLOSED" value={bot.metrics?.closed || 0} />
          <MetricBox label="WIN %" value={fmtPct(bot.metrics?.win_pct)} />
          <MetricBox label="WINS" value={bot.metrics?.wins || 0} />
          <MetricBox label="LOSSES" value={bot.metrics?.losses || 0} />
          <MetricBox label="SLIP AVG" value={`${(bot.metrics?.slip_avg_bps || 0).toFixed(2)} bps`} />
          <MetricBox label="ERRORS" value={bot.metrics?.errors || 0} valueColor="text-accent-red" />
          <MetricBox label="ORPHANS" value={bot.metrics?.orphans || 0} valueColor="text-gray-200" />
          <MetricBox label="ORPHAN LOSS" value={fmtUsd(-(bot.metrics?.orphan_losses || 0))} valueColor={bot.metrics?.orphan_losses > 0 ? 'text-accent-red' : 'text-gray-400'} />
          <MetricBox label="FUNDING" value={fmtUsd(bot.metrics?.funding || 0)} valueColor="text-accent-green" />
        </div>
      </div>

      {/* ─── Open Positions Section ──── */}
      <OpenPositionsSection bot={bot} />

      {/* ─── Config Section ──── */}
      <div className="bg-bg-card rounded-xl border border-bg-border p-4">
        <div className="flex items-center gap-2 mb-4">
          <div className={`w-1 h-4 rounded ${ec.tag}`} />
          <span className="text-xs font-bold text-gray-200 uppercase">Config #{bot.id} {bot.name}</span>
        </div>

        {/* Position Sizing */}
        <div className="mb-4">
          <div className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold mb-2">Position Sizing</div>
          <div className="flex gap-3">
            <ConfigInput label="Size ($)" value={localConfig?.size} onChange={v => updateLocal('size', parseFloat(v))} />
            <ConfigInput label="Max Pos ($)" value={localConfig?.max_pos} onChange={v => updateLocal('max_pos', parseFloat(v))} />
            <ConfigInput label="Max Global" value={localConfig?.max_global} onChange={v => updateLocal('max_global', parseFloat(v))} />
          </div>
          <div className="text-[9px] text-gray-600 mt-1">Taille identique sur les 2 legs, pas d'arrondi.</div>
        </div>

        {/* Risk */}
        <div className="mb-4">
          <div className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold mb-2">Risk</div>
          <div className="flex gap-3">
            <ConfigInput label="Max Lev" value={localConfig?.max_lev} onChange={v => updateLocal('max_lev', parseFloat(v))} />
            <ConfigInput label="SL (bps)" value={localConfig?.sl_bps} onChange={v => updateLocal('sl_bps', parseFloat(v))} />
            <ConfigInput label="MaxLoss(bps)" value={localConfig?.max_loss_bps} onChange={v => updateLocal('max_loss_bps', parseFloat(v))} />
          </div>
        </div>

        {/* Entry Mode - Percentile based */}
        <div className="mb-4">
          <div className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold mb-2">Entry Mode (Percentile)</div>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            {[
              { label: 'P50', value: 0.50 },
              { label: 'P60', value: 0.60 },
              { label: 'P70', value: 0.70 },
              { label: 'P75', value: 0.75 },
              { label: 'P80', value: 0.80 },
              { label: 'P85', value: 0.85 },
              { label: 'P90', value: 0.90 },
            ].map(p => (
              <button
                key={p.value}
                onClick={() => updateLocal('percentile', p.value)}
                className={`px-2.5 py-1 text-[10px] font-semibold rounded-md transition-all ${
                  localConfig?.percentile === p.value
                    ? 'bg-accent-blue text-white'
                    : 'bg-bg-primary text-gray-500 border border-bg-border hover:text-gray-300'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {/* Percentile slider */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] text-gray-500">P:</span>
            <input
              type="range"
              min="50"
              max="95"
              step="1"
              value={(localConfig?.percentile || 0.75) * 100}
              onChange={e => updateLocal('percentile', parseInt(e.target.value) / 100)}
              className="flex-1 h-1.5 rounded-full appearance-none bg-bg-border accent-accent-blue"
            />
            <span className="text-[10px] font-mono text-gray-200 min-w-[36px] text-right">
              {((localConfig?.percentile || 0.75) * 100).toFixed(0)}
            </span>
          </div>
          <div className="flex gap-3">
            <ConfigInput label="Buf" value={localConfig?.buf} onChange={v => updateLocal('buf', parseFloat(v))} />
            <ConfigInput label="Slip" value={localConfig?.slip} onChange={v => updateLocal('slip', parseFloat(v))} />
            <div className="flex-1">
              <label className="text-[10px] text-gray-500 block mb-0.5">Timer</label>
              <select
                value={localConfig?.timer || '6h'}
                onChange={e => updateLocal('timer', e.target.value)}
                className="w-full px-2 py-1.5 text-xs bg-bg-primary border border-bg-border rounded-md text-gray-200 font-mono focus:outline-none focus:border-accent-blue"
              >
                {['1h', '6h', '12h', '24h'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
        </div>


        {/* Apply button */}
        <button
          onClick={applyConfig}
          className={`w-full py-2.5 text-xs font-bold text-white rounded-lg transition-all ${
            dirty
              ? 'bg-accent-blue hover:brightness-110 animate-pulse'
              : bot.exchange === 'FLX' ? 'bg-orange-400 hover:bg-orange-500' :
                bot.exchange === 'KM' ? 'bg-emerald-500 hover:bg-emerald-600' :
                'bg-blue-500 hover:bg-blue-600'
          }`}
        >
          {dirty ? 'Apply Changes' : `Apply ${bot.name}`}
        </button>
      </div>

      {/* ─── Pair Toggles ──── */}
      <div className="bg-bg-card rounded-xl border border-bg-border p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold text-gray-200 uppercase">Pair Toggles</span>
          <div className="flex items-center gap-3">
            <span className="text-[9px] font-mono text-gray-500">
              P{Math.round((bot.config?.percentile ?? 0.75) * 100)}
            </span>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={bot.tiers_enabled ?? true}
                onChange={e => onTiersToggle(bot.id, e.target.checked)}
                className="w-3.5 h-3.5 rounded border-bg-border accent-accent-blue"
              />
              <span className="text-[10px] font-semibold text-gray-200">TIERS</span>
            </label>
          </div>
        </div>

        <div className="space-y-1.5">
          {(bot.pairs || []).map((pair, idx) => {
            const ssKey = `${bot.pair_b}|${pair.symbol}`;
            const ss = spreadStats?.[ssKey];
            const pct = bot.config?.percentile ?? 0.75;
            const dir = bot.direction === 'long' ? 'd1' : 'd2';
            const spreadBps = interpPercentile(ss, pct, dir);
            return (
            <div key={pair.symbol} className="flex items-center gap-2 py-1 px-2 rounded-md hover:bg-bg-primary/50">
              <span className={`text-xs font-mono flex-1 ${pair.enabled ? (bot.exchange === 'CASH' ? 'text-blue-400' : bot.exchange === 'KM' ? 'text-emerald-400' : 'text-orange-400') : 'text-gray-600'}`}>
                {bot.pair_b}/xyz {pair.symbol}
              </span>
              {/* Spread percentile value */}
              <span className={`text-[10px] font-mono w-12 text-right ${spreadBps != null && spreadBps > 5 ? 'text-accent-green' : 'text-gray-500'}`}>
                {spreadBps != null ? `${spreadBps.toFixed(1)}` : '--'}
              </span>
              {/* Tier indicator */}
              {pair.tier && (
                <span className={`w-4 h-4 rounded text-[8px] font-bold text-white flex items-center justify-center ${TIER_COLORS[pair.tier] || 'bg-gray-400'}`}>
                  {pair.tier}
                </span>
              )}
              {/* Toggle */}
              <button
                onClick={() => onPairToggle(bot.id, idx, !pair.enabled)}
                className={`w-8 h-4 rounded-full transition-colors relative ${pair.enabled ? 'bg-accent-red' : 'bg-gray-600'}`}
              >
                <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${pair.enabled ? 'right-0.5' : 'left-0.5'}`} />
              </button>
              {/* Z & bh */}
              <span className="text-[10px] font-mono text-gray-500 w-5 text-center">{pair.z ?? ''}</span>
              <span className="text-[10px] font-mono text-gray-500 w-6 text-center">{pair.bh ?? ''}</span>
            </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── API Key (Private Key) Field ─────────────────────────────
function ApiKeyField({ botId, maskedKey, onSave }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [showKey, setShowKey] = useState(false);

  const handleSave = () => {
    if (value.trim()) {
      onSave(botId, value.trim());
      setEditing(false);
      setValue('');
      setShowKey(false);
    }
  };

  return (
    <div className="flex items-center gap-2 mb-1.5 text-[10px]">
      <span className="text-gray-600 w-14">API Key:</span>
      {editing ? (
        <div className="flex-1 flex gap-1">
          <div className="flex-1 relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder="Private key (hex)..."
              className="w-full px-2 py-1 pr-12 text-[10px] bg-bg-primary border border-bg-border rounded font-mono text-gray-200 focus:outline-none focus:border-accent-blue"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-1 top-0.5 px-1.5 py-0.5 text-[8px] text-gray-500 hover:text-gray-300 transition-colors"
            >
              {showKey ? 'Hide' : 'Show'}
            </button>
          </div>
          <button
            onClick={handleSave}
            className="px-2 py-1 bg-accent-green text-white rounded text-[9px] font-semibold"
          >
            Save
          </button>
          <button
            onClick={() => { setEditing(false); setValue(''); setShowKey(false); }}
            className="px-2 py-1 bg-gray-600 text-gray-200 rounded text-[9px] font-semibold"
          >
            Cancel
          </button>
        </div>
      ) : (
        <>
          <span className="flex-1 font-mono text-gray-400 bg-bg-primary px-2 py-1 rounded border border-bg-border">
            {maskedKey ? `••••••${maskedKey}` : <span className="text-gray-600 italic">not set</span>}
          </span>
          <button
            onClick={() => setEditing(true)}
            className="px-2 py-0.5 bg-accent-blue text-white rounded text-[9px] font-semibold hover:brightness-110 transition-all"
          >
            Set
          </button>
        </>
      )}
    </div>
  );
}

// ─── Wallet/SubAccount Field ────────────────────────────────
function WalletField({ label, value, botId, field, editingWallet, setEditingWallet, walletInput, setWalletInput, onSet }) {
  const isEditing = editingWallet?.botId === botId && editingWallet?.field === field;

  return (
    <div className="flex items-center gap-2 mb-1.5 text-[10px]">
      <span className="text-gray-600 w-14">{label}:</span>
      {isEditing ? (
        <div className="flex-1 flex gap-1">
          <input
            type="text"
            value={walletInput}
            onChange={e => setWalletInput(e.target.value)}
            placeholder="0x..."
            className="flex-1 px-2 py-1 text-[10px] bg-bg-primary border border-bg-border rounded font-mono text-gray-200 focus:outline-none focus:border-accent-blue"
            autoFocus
          />
          <button
            onClick={() => onSet(botId, field, walletInput)}
            className="px-2 py-1 bg-accent-green text-white rounded text-[9px] font-semibold"
          >
            Save
          </button>
          <button
            onClick={() => { setEditingWallet(null); setWalletInput(''); }}
            className="px-2 py-1 bg-gray-600 text-gray-200 rounded text-[9px] font-semibold"
          >
            Cancel
          </button>
        </div>
      ) : (
        <>
          <span className="flex-1 font-mono text-gray-400 bg-bg-primary px-2 py-1 rounded border border-bg-border">
            {value ? truncAddr(value) : <span className="text-gray-600 italic">not set</span>}
          </span>
          {value && (
            <span className="font-mono text-[10px] text-gray-600 hidden lg:inline">{value}</span>
          )}
          <button
            onClick={() => { setEditingWallet({ botId, field }); setWalletInput(value || ''); }}
            className="px-2 py-0.5 bg-accent-blue text-white rounded text-[9px] font-semibold hover:brightness-110 transition-all"
          >
            Set
          </button>
        </>
      )}
    </div>
  );
}

// ─── Open Positions Section ─────────────────────────────────
function fmtDuration(seconds) {
  if (!seconds || seconds <= 0) return '0s';
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return m > 0 ? `${h}h${m}m` : `${h}h`;
}

function OpenPositionsSection({ bot }) {
  const [expanded, setExpanded] = useState({});
  const trades = bot.open_trades || [];

  if (trades.length === 0) {
    return (
      <div className="bg-bg-card rounded-xl border border-bg-border p-3">
        <div className="flex items-center gap-2">
          <div className="w-1 h-4 rounded bg-gray-600" />
          <span className="text-xs font-bold text-gray-400 uppercase">Open Positions</span>
          <span className="text-[10px] text-gray-600 ml-auto">No positions</span>
        </div>
      </div>
    );
  }

  const totalPnl = trades.reduce((s, t) => s + (t.unrealized_pnl_net || 0), 0);

  return (
    <div className="bg-bg-card rounded-xl border border-bg-border p-3 space-y-2">
      <div className="flex items-center gap-2">
        <div className="w-1 h-4 rounded bg-accent-blue" />
        <span className="text-xs font-bold text-gray-200 uppercase">Open Positions</span>
        <span className="text-[10px] text-gray-500 ml-1">({trades.length})</span>
        <span className={`text-xs font-mono font-bold ml-auto ${pnlClass(totalPnl)}`}>{fmtUsd(totalPnl)}</span>
      </div>

      {trades.map(t => {
        const isExpanded = expanded[t.coin];
        return (
          <div key={t.coin} className="border border-bg-border rounded-lg overflow-hidden">
            {/* Aggregated row */}
            <button
              onClick={() => setExpanded(prev => ({ ...prev, [t.coin]: !prev[t.coin] }))}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-bg-primary/50 transition-colors text-left"
            >
              <span className="text-[10px] font-bold text-accent-blue bg-accent-blue/10 px-1.5 py-0.5 rounded">{t.coin}</span>
              <span className={`text-[10px] font-semibold ${t.direction === 'long' ? 'text-accent-green' : 'text-accent-red'}`}>
                {t.direction?.toUpperCase()}
              </span>
              <span className="text-[10px] text-gray-400 font-mono">${(t.notional_usd || 0).toFixed(0)}</span>
              <span className="text-[10px] text-gray-500">{t.num_fills || 1} fill{(t.num_fills || 1) > 1 ? 's' : ''}</span>
              <span className="text-[10px] text-gray-500 ml-auto">{fmtDuration(t.duration_s)}</span>
              <span className={`text-xs font-mono font-bold ${pnlClass(t.unrealized_pnl_net)}`}>
                {fmtUsd(t.unrealized_pnl_net || 0)}
              </span>
              <svg className={`w-3 h-3 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Expanded details */}
            {isExpanded && (
              <div className="border-t border-bg-border bg-bg-primary/30 px-3 py-2 space-y-2">
                {/* Aggregate stats */}
                <div className="grid grid-cols-4 gap-2 text-[10px]">
                  <div>
                    <span className="text-gray-600 block">Avg Entry A</span>
                    <span className="text-gray-300 font-mono">{(t.avg_entry_a || 0).toFixed(4)}</span>
                  </div>
                  <div>
                    <span className="text-gray-600 block">Avg Entry B</span>
                    <span className="text-gray-300 font-mono">{(t.avg_entry_b || 0).toFixed(4)}</span>
                  </div>
                  <div>
                    <span className="text-gray-600 block">Mid A</span>
                    <span className="text-gray-300 font-mono">{(t.current_mid_a || 0).toFixed(4)}</span>
                  </div>
                  <div>
                    <span className="text-gray-600 block">Mid B</span>
                    <span className="text-gray-300 font-mono">{(t.current_mid_b || 0).toFixed(4)}</span>
                  </div>
                  <div>
                    <span className="text-gray-600 block">Size (units)</span>
                    <span className="text-gray-300 font-mono">{(t.total_size || 0).toFixed(4)}</span>
                  </div>
                  <div>
                    <span className="text-gray-600 block">Gross PnL</span>
                    <span className={`font-mono ${pnlClass(t.unrealized_pnl_gross)}`}>{fmtUsd(t.unrealized_pnl_gross || 0)}</span>
                  </div>
                  <div>
                    <span className="text-gray-600 block">Fees Est</span>
                    <span className="text-gray-300 font-mono">{fmtUsd(t.fees_est || 0)}</span>
                  </div>
                  <div>
                    <span className="text-gray-600 block">Avg Slip</span>
                    <span className="text-gray-300 font-mono">{(t.avg_slippage_bps || 0).toFixed(2)} bps</span>
                  </div>
                </div>

                {/* Individual fills */}
                {t.fills && t.fills.length > 0 && (
                  <div>
                    <div className="text-[9px] text-gray-600 uppercase tracking-wider font-semibold mb-1">Fills ({t.fills.length})</div>
                    <div className="space-y-1">
                      {t.fills.map((f, i) => (
                        <div key={i} className="flex items-center gap-2 text-[10px] bg-bg-primary/50 rounded px-2 py-1">
                          <span className="text-gray-500 w-4">#{i + 1}</span>
                          <span className="text-gray-400 font-mono">{(f.size || 0).toFixed(4)}</span>
                          <span className="text-gray-600">@</span>
                          <span className="text-gray-300 font-mono">{(f.entry_price_a || 0).toFixed(4)}</span>
                          <span className="text-gray-600">/</span>
                          <span className="text-gray-300 font-mono">{(f.entry_price_b || 0).toFixed(4)}</span>
                          <span className="text-gray-500 ml-auto">{(f.slippage_a || 0).toFixed(1)}/{(f.slippage_b || 0).toFixed(1)} bps</span>
                          <span className="text-gray-500">{f.edge_at_entry?.toFixed(1)} edge</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Metric Box ─────────────────────────────────────────────
function MetricBox({ label, value, color, valueColor, chart }) {
  return (
    <div className="bg-bg-primary border border-bg-border rounded-lg p-2.5 text-center">
      <div className={`text-sm font-mono font-bold ${color || valueColor || 'text-gray-200'}`}>{value}</div>
      {chart && (
        <div className="h-1 bg-bg-border rounded-full mt-1 mb-1 overflow-hidden">
          <div className={`h-full rounded-full ${parseFloat(String(value).replace(/[^0-9.-]/g, '')) >= 0 ? 'bg-accent-green' : 'bg-accent-red'}`}
            style={{ width: '30%' }} />
        </div>
      )}
      <div className="text-[9px] text-gray-600 uppercase tracking-wider">{label}</div>
    </div>
  );
}

// ─── Config Input ───────────────────────────────────────────
function ConfigInput({ label, value, onChange, suffix }) {
  return (
    <div className="flex-1">
      <label className="text-[10px] text-gray-500 block mb-0.5">{label}</label>
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={value ?? ''}
          onChange={e => onChange(e.target.value)}
          className="w-full px-2 py-1.5 text-xs bg-bg-primary border border-bg-border rounded-md text-gray-200 font-mono focus:outline-none focus:border-accent-blue"
        />
        {suffix && <span className="text-[10px] text-gray-500">{suffix}</span>}
      </div>
    </div>
  );
}
