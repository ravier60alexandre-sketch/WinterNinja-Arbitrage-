'use client';

import { useState, useEffect, useCallback } from 'react';
import NavHeader from '../../components/NavHeader';

// ─── Color helpers ──────────────────────────────────────────
const pnlClass = (v) => v > 0 ? 'text-green-400' : v < 0 ? 'text-red-400' : 'text-gray-400';
const fmtUsd = (v) => (v >= 0 ? '+' : '') + '$' + Math.abs(v).toFixed(4);
const fmtK = (v) => v >= 1000 ? '$' + (v / 1000).toFixed(2) + 'K' : '$' + v.toFixed(2);
const fmtPct = (v) => v === null || v === undefined ? '--%' : v.toFixed(0) + '%';
const truncAddr = (a) => a ? `${a.slice(0, 6)}...${a.slice(-4)}` : '';

const EXCHANGE_COLORS = {
  FLX: { border: 'border-orange-400', bg: 'bg-orange-400/10', text: 'text-orange-400', tag: 'bg-orange-400' },
  KM: { border: 'border-emerald-400', bg: 'bg-emerald-400/10', text: 'text-emerald-400', tag: 'bg-emerald-400' },
  CASH: { border: 'border-blue-400', bg: 'bg-blue-400/10', text: 'text-blue-400', tag: 'bg-blue-400' },
};

const TIER_COLORS = {
  P: 'bg-red-500',
  A: 'bg-green-500',
  N: 'bg-amber-500',
};

export default function DeployerRouterPage() {
  const [data, setData] = useState({ bots: [], global_stats: {} });
  const [tab, setTab] = useState('short'); // 'short' or 'long'
  const [connected, setConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [editingWallet, setEditingWallet] = useState(null); // { botId, field }
  const [walletInput, setWalletInput] = useState('');

  const fetchData = useCallback(() => {
    fetch('/api/bots')
      .then(r => r.json())
      .then(d => setData(d))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // SSE for connection status
  useEffect(() => {
    const es = new EventSource('/api/spreads/live');
    es.onmessage = (event) => {
      try {
        const d = JSON.parse(event.data);
        setConnected(d.connected || false);
        setLastUpdate(d.timestamp);
      } catch (e) {}
    };
    es.onerror = () => setConnected(false);
    return () => es.close();
  }, []);

  const handleAction = useCallback((botId, action) => {
    fetch('/api/bots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bot_id: botId, action }),
    }).then(() => fetchData()).catch(console.error);
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

  // Filter bots by current tab
  const shortBots = data.bots.filter(b => b.direction === 'short').sort((a, b) => a.id - b.id);
  const longBots = data.bots.filter(b => b.direction === 'long').sort((a, b) => a.id - b.id);
  const displayedBots = tab === 'short' ? shortBots : longBots;

  const gs = data.global_stats || {};

  // Per-bot route counts (mock)
  const botCounters = data.bots.map(b => ({
    id: b.id,
    label: `BOT${b.id} ${b.exchange}`,
    count: b.metrics?.closed || 0,
  }));

  return (
    <div className="min-h-screen bg-[#faf7f2]">
      {/* ─── Top header ──── */}
      <div className="bg-[#faf7f2] border-b border-[#e8e0d4] px-6 py-4">
        <div className="max-w-[1800px] mx-auto">
          {/* Title + tab toggle */}
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-sm font-bold text-[#2d2a26] tracking-wide">6-BOT DEPLOYER ROUTER</h1>
            <div className="flex bg-[#f0ece4] rounded-lg p-0.5">
              <button
                onClick={() => setTab('short')}
                className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${
                  tab === 'short'
                    ? 'bg-[#f5a623] text-white shadow-sm'
                    : 'text-[#8a8478] hover:text-[#5a564e]'
                }`}
              >
                XYZ Short
              </button>
              <button
                onClick={() => setTab('long')}
                className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${
                  tab === 'long'
                    ? 'bg-[#f5a623] text-white shadow-sm'
                    : 'text-[#8a8478] hover:text-[#5a564e]'
                }`}
              >
                XYZ Long
              </button>
            </div>
          </div>

          {/* Global stats row */}
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-3">
            <StatBox label="COMBINED OPEN" value={gs.combined_open || displayedBots.reduce((s, b) => s + (b.metrics?.open || 0), 0)} />
            <StatBox label="NET PNL" value={fmtUsd(displayedBots.reduce((s, b) => s + (b.metrics?.pnl_net || 0), 0))}
              className={pnlClass(displayedBots.reduce((s, b) => s + (b.metrics?.pnl_net || 0), 0))} />
            <StatBox label="TOTAL FEES" value={fmtUsd(displayedBots.reduce((s, b) => s + (b.metrics?.fees || 0), 0))} />
            <StatBox label="TOTAL FUNDING" value={fmtUsd(displayedBots.reduce((s, b) => s + (b.metrics?.funding || 0), 0))} />
            <StatBox label="TOTAL VOLUME" value={fmtK(displayedBots.reduce((s, b) => s + (b.metrics?.volume || 0), 0))} />
            <StatBox label="TOTAL TRADES" value={displayedBots.reduce((s, b) => s + (b.metrics?.closed || 0), 0)} />
          </div>

          {/* Route counters */}
          <div className="flex flex-wrap gap-3 text-[10px]">
            <CounterChip label="ROUTED" value={gs.routed || 0} color="text-green-600" />
            <CounterChip label="REJECTED" value={gs.rejected || 0} color="text-red-500" />
            {botCounters.map(bc => (
              <CounterChip key={bc.id} label={bc.label} value={bc.count} color="text-[#5a564e]" />
            ))}
          </div>
        </div>
      </div>

      {/* ─── Bot Cards Grid ──── */}
      <div className="max-w-[1800px] mx-auto px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {displayedBots.map(bot => (
            <BotColumn
              key={bot.id}
              bot={bot}
              onAction={handleAction}
              onConfigUpdate={handleConfigUpdate}
              onWalletSet={handleWalletSet}
              onPairToggle={handlePairToggle}
              onTiersToggle={handleTiersToggle}
              editingWallet={editingWallet}
              setEditingWallet={setEditingWallet}
              walletInput={walletInput}
              setWalletInput={setWalletInput}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Stat box (header) ──────────────────────────────────────
function StatBox({ label, value, className = '' }) {
  return (
    <div className="bg-white rounded-lg border border-[#e8e0d4] px-3 py-2">
      <div className="text-[9px] text-[#b0a898] uppercase tracking-wider">{label}</div>
      <div className={`text-lg font-mono font-bold mt-0.5 ${className || 'text-[#2d2a26]'}`}>{value}</div>
    </div>
  );
}

function CounterChip({ label, value, color }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[#b0a898] uppercase">{label}</span>
      <span className={`font-mono font-bold ${color}`}>{value}</span>
    </div>
  );
}

// ─── Bot Column (full section) ──────────────────────────────
function BotColumn({ bot, onAction, onConfigUpdate, onWalletSet, onPairToggle, onTiersToggle, editingWallet, setEditingWallet, walletInput, setWalletInput }) {
  const ec = EXCHANGE_COLORS[bot.exchange] || EXCHANGE_COLORS.FLX;
  const [localConfig, setLocalConfig] = useState(bot.config);

  useEffect(() => {
    setLocalConfig(bot.config);
  }, [bot.config]);

  const updateLocal = (key, val) => {
    setLocalConfig(prev => ({ ...prev, [key]: val }));
  };

  const applyConfig = () => {
    onConfigUpdate(bot.id, localConfig);
  };

  return (
    <div className="space-y-4">
      {/* ─── Bot Header Card ──── */}
      <div className={`bg-white rounded-xl border-2 ${ec.border} p-4`}>
        {/* Title row */}
        <div className="flex items-center gap-2 mb-3">
          <span className={`${ec.tag} text-white text-[10px] font-bold px-2 py-0.5 rounded`}>{bot.exchange}</span>
          <span className="text-sm font-bold text-[#2d2a26]">{bot.name.toUpperCase()} — {bot.label}</span>
        </div>

        {/* Status + Controls */}
        <div className="flex items-center gap-2 mb-3">
          <span className={`flex items-center gap-1.5 text-xs font-semibold ${bot.state === 'running' ? 'text-green-500' : 'text-red-500'}`}>
            <span className={`w-2 h-2 rounded-full ${bot.state === 'running' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
            {bot.state.toUpperCase()}
          </span>
          <div className="flex gap-1.5 ml-auto">
            <button onClick={() => onAction(bot.id, 'start')}
              className="px-3 py-1 text-[10px] font-semibold bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors">
              Start
            </button>
            <button onClick={() => onAction(bot.id, 'liquidate')}
              className="px-3 py-1 text-[10px] font-semibold bg-amber-500 text-white rounded-md hover:bg-amber-600 transition-colors">
              LIQUIDATION
            </button>
            <button onClick={() => onAction(bot.id, 'reset')}
              className="px-3 py-1 text-[10px] font-semibold bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors">
              Reset
            </button>
          </div>
        </div>

        {/* Collateral row */}
        <div className="flex items-center gap-4 text-[10px] text-[#8a8478] mb-2">
          <span>COLL:</span>
          <span>USDC <span className="font-mono text-green-600">{bot.collateral?.usdc?.toFixed(2) || '0.00'}</span></span>
          <span>USDH <span className="font-mono text-green-600">{bot.collateral?.usdh?.toFixed(2) || '0.00'}</span></span>
          <span>Total <span className="font-mono text-green-600">{bot.collateral?.total?.toFixed(2) || '0.00'}</span></span>
          <span className="ml-auto">Ping <span className="font-mono text-[#2d2a26]">{bot.ping_ms || 0}ms</span></span>
        </div>

        {/* Fees */}
        <div className="text-[10px] text-[#8a8478] mb-3">
          Fees <span className="font-mono text-green-600">{bot.fees_bps || 0.45}bps</span>
        </div>

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
      <div className="bg-white rounded-xl border border-[#e8e0d4] p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className={`w-1 h-4 rounded ${ec.tag}`} />
          <span className="text-xs font-bold text-[#2d2a26] uppercase">Dashboard {bot.name}</span>
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
          <MetricBox label="ERRORS" value={bot.metrics?.errors || 0} valueColor="text-red-500" />
          <MetricBox label="ORPHANS" value={fmtUsd(bot.metrics?.orphans || 0)} valueColor="text-green-600" />
          <MetricBox label="FUNDING" value={fmtUsd(bot.metrics?.funding || 0)} valueColor="text-green-600" />
        </div>
      </div>

      {/* ─── Config Section ──── */}
      <div className="bg-white rounded-xl border border-[#e8e0d4] p-4">
        <div className="flex items-center gap-2 mb-4">
          <div className={`w-1 h-4 rounded ${ec.tag}`} />
          <span className="text-xs font-bold text-[#2d2a26] uppercase">Config {bot.name}</span>
        </div>

        {/* Position Sizing */}
        <div className="mb-4">
          <div className="text-[10px] text-[#b0a898] uppercase tracking-wider font-semibold mb-2">Position Sizing</div>
          <div className="flex gap-3">
            <ConfigInput label="Max Pos ($)" value={localConfig?.max_pos} onChange={v => updateLocal('max_pos', parseFloat(v))} />
            <ConfigInput label="Max Global" value={localConfig?.max_global} onChange={v => updateLocal('max_global', parseFloat(v))} />
          </div>
        </div>

        {/* Risk */}
        <div className="mb-4">
          <div className="text-[10px] text-[#b0a898] uppercase tracking-wider font-semibold mb-2">Risk</div>
          <div className="flex gap-3">
            <ConfigInput label="Max Lev" value={localConfig?.max_lev} onChange={v => updateLocal('max_lev', parseFloat(v))} />
            <ConfigInput label="SL (bps)" value={localConfig?.sl_bps} onChange={v => updateLocal('sl_bps', parseFloat(v))} />
            <ConfigInput label="MaxLoss(bps)" value={localConfig?.max_loss_bps} onChange={v => updateLocal('max_loss_bps', parseFloat(v))} />
          </div>
        </div>

        {/* Entry Mode - Percentile based (p50-p90) */}
        <div className="mb-4">
          <div className="text-[10px] text-[#b0a898] uppercase tracking-wider font-semibold mb-2">Entry Mode (Percentile)</div>
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
                    ? 'bg-[#f5a623] text-white'
                    : 'bg-[#f0ece4] text-[#8a8478] hover:bg-[#e8e0d4]'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {/* Percentile slider */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] text-[#8a8478]">P:</span>
            <input
              type="range"
              min="50"
              max="95"
              step="1"
              value={(localConfig?.percentile || 0.75) * 100}
              onChange={e => updateLocal('percentile', parseInt(e.target.value) / 100)}
              className="flex-1 h-1.5 rounded-full appearance-none bg-[#e8e0d4] accent-[#f5a623]"
            />
            <span className="text-[10px] font-mono text-[#2d2a26] min-w-[36px] text-right">
              {((localConfig?.percentile || 0.75) * 100).toFixed(0)}
            </span>
          </div>
          <div className="flex gap-3">
            <ConfigInput label="Buf" value={localConfig?.buf} onChange={v => updateLocal('buf', parseFloat(v))} />
            <ConfigInput label="Slip" value={localConfig?.slip} onChange={v => updateLocal('slip', parseFloat(v))} />
            <div>
              <label className="text-[10px] text-[#8a8478] block mb-0.5">Timer</label>
              <select
                value={localConfig?.timer || '6h'}
                onChange={e => updateLocal('timer', e.target.value)}
                className="w-full px-2 py-1.5 text-xs bg-[#faf7f2] border border-[#e8e0d4] rounded-md text-[#2d2a26] font-mono"
              >
                {['1h', '6h', '12h', '24h'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Close (BE-Based) */}
        <div className="mb-4">
          <div className="text-[10px] text-[#b0a898] uppercase tracking-wider font-semibold mb-2">Close (BE-Based)</div>
          <div className="flex items-center gap-3">
            <ConfigInput label="Buffer" value={localConfig?.close_buffer_bps} onChange={v => updateLocal('close_buffer_bps', parseFloat(v))} suffix="bps" />
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={localConfig?.zmr || false}
                onChange={e => updateLocal('zmr', e.target.checked)}
                className="w-3.5 h-3.5 rounded border-[#e8e0d4] accent-[#f5a623]"
              />
              <span className="text-[10px] text-[#2d2a26] font-semibold">ZMR</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={localConfig?.close_fee_rt_buffer || false}
                onChange={e => updateLocal('close_fee_rt_buffer', e.target.checked)}
                className="w-3.5 h-3.5 rounded border-[#e8e0d4] accent-[#f5a623]"
              />
              <span className="text-[10px] text-[#2d2a26]">Close = feeRT + buffer</span>
            </label>
          </div>
        </div>

        {/* Apply button */}
        <button
          onClick={applyConfig}
          className={`w-full py-2.5 text-xs font-bold text-white rounded-lg transition-colors ${
            bot.exchange === 'FLX' ? 'bg-orange-400 hover:bg-orange-500' :
            bot.exchange === 'KM' ? 'bg-emerald-500 hover:bg-emerald-600' :
            'bg-blue-500 hover:bg-blue-600'
          }`}
        >
          Apply {bot.name}
        </button>
      </div>

      {/* ─── Pair Toggles ──── */}
      <div className="bg-white rounded-xl border border-[#e8e0d4] p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold text-[#2d2a26] uppercase">Pair Toggles</span>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={bot.tiers_enabled ?? true}
              onChange={e => onTiersToggle(bot.id, e.target.checked)}
              className="w-3.5 h-3.5 rounded border-[#e8e0d4] accent-[#f5a623]"
            />
            <span className="text-[10px] font-semibold text-[#2d2a26]">TIERS</span>
          </label>
        </div>

        <div className="space-y-1.5">
          {(bot.pairs || []).map((pair, idx) => (
            <div key={pair.symbol} className="flex items-center gap-2 py-1 px-2 rounded-md hover:bg-[#faf7f2]">
              <span className={`text-xs font-mono flex-1 ${pair.enabled ? (bot.exchange === 'CASH' ? 'text-blue-600' : bot.exchange === 'KM' ? 'text-emerald-600' : 'text-orange-600') : 'text-[#b0a898]'}`}>
                {bot.pair_b}/xyz {pair.symbol}
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
                className={`w-8 h-4 rounded-full transition-colors relative ${pair.enabled ? 'bg-red-500' : 'bg-gray-300'}`}
              >
                <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${pair.enabled ? 'right-0.5' : 'left-0.5'}`} />
              </button>
              {/* Z & bh */}
              <span className="text-[10px] font-mono text-[#8a8478] w-5 text-center">{pair.z ?? ''}</span>
              <span className="text-[10px] font-mono text-[#8a8478] w-6 text-center">{pair.bh ?? ''}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Wallet/SubAccount Field ────────────────────────────────
function WalletField({ label, value, botId, field, editingWallet, setEditingWallet, walletInput, setWalletInput, onSet }) {
  const isEditing = editingWallet?.botId === botId && editingWallet?.field === field;

  return (
    <div className="flex items-center gap-2 mb-1.5 text-[10px]">
      <span className="text-[#b0a898] w-14">{label}:</span>
      {isEditing ? (
        <div className="flex-1 flex gap-1">
          <input
            type="text"
            value={walletInput}
            onChange={e => setWalletInput(e.target.value)}
            placeholder="0x..."
            className="flex-1 px-2 py-1 text-[10px] bg-[#faf7f2] border border-[#e8e0d4] rounded font-mono text-[#2d2a26]"
            autoFocus
          />
          <button
            onClick={() => onSet(botId, field, walletInput)}
            className="px-2 py-1 bg-green-500 text-white rounded text-[9px] font-semibold"
          >
            Save
          </button>
          <button
            onClick={() => { setEditingWallet(null); setWalletInput(''); }}
            className="px-2 py-1 bg-gray-300 text-gray-600 rounded text-[9px] font-semibold"
          >
            Cancel
          </button>
        </div>
      ) : (
        <>
          <span className="flex-1 font-mono text-[#5a564e] bg-[#f0ece4] px-2 py-1 rounded">
            {value ? truncAddr(value) : <span className="text-[#b0a898] italic">not set</span>}
          </span>
          {value && (
            <span className="font-mono text-[10px] text-[#b0a898] hidden lg:inline">{value}</span>
          )}
          <button
            onClick={() => { setEditingWallet({ botId, field }); setWalletInput(value || ''); }}
            className="px-2 py-0.5 bg-[#f5a623] text-white rounded text-[9px] font-semibold hover:bg-[#e09520] transition-colors"
          >
            Set
          </button>
        </>
      )}
    </div>
  );
}

// ─── Metric Box ─────────────────────────────────────────────
function MetricBox({ label, value, color, valueColor, chart }) {
  return (
    <div className="bg-[#faf7f2] border border-[#e8e0d4] rounded-lg p-2.5 text-center">
      <div className={`text-sm font-mono font-bold ${color || valueColor || 'text-[#2d2a26]'}`}>{value}</div>
      {chart && (
        <div className="h-1 bg-[#e8e0d4] rounded-full mt-1 mb-1 overflow-hidden">
          <div className={`h-full rounded-full ${parseFloat(String(value).replace(/[^0-9.-]/g, '')) >= 0 ? 'bg-green-400' : 'bg-red-400'}`}
            style={{ width: '30%' }} />
        </div>
      )}
      <div className="text-[9px] text-[#b0a898] uppercase tracking-wider">{label}</div>
    </div>
  );
}

// ─── Config Input ───────────────────────────────────────────
function ConfigInput({ label, value, onChange, suffix }) {
  return (
    <div className="flex-1">
      <label className="text-[10px] text-[#8a8478] block mb-0.5">{label}</label>
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={value ?? ''}
          onChange={e => onChange(e.target.value)}
          className="w-full px-2 py-1.5 text-xs bg-[#faf7f2] border border-[#e8e0d4] rounded-md text-[#2d2a26] font-mono focus:outline-none focus:border-[#f5a623]"
        />
        {suffix && <span className="text-[10px] text-[#8a8478]">{suffix}</span>}
      </div>
    </div>
  );
}
