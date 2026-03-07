'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import NavHeader from '../../components/NavHeader';
import BotCard from '../../components/BotCard';

export default function BotsPage() {
  const [bots, setBots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [pairs, setPairs] = useState([]);
  const [connected, setConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formPair, setFormPair] = useState('');
  const [formStrategy, setFormStrategy] = useState('mean_reversion');
  const [formEntry, setFormEntry] = useState(5.0);
  const [formExit, setFormExit] = useState(1.0);
  const [formSize, setFormSize] = useState(100);

  const fetchBots = useCallback(() => {
    fetch('/api/bots')
      .then(r => r.json())
      .then(data => {
        setBots(data.bots || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchBots();
    const interval = setInterval(fetchBots, 5000);
    return () => clearInterval(interval);
  }, [fetchBots]);

  // Fetch pairs for create form
  useEffect(() => {
    fetch('/api/pairs')
      .then(r => r.json())
      .then(data => {
        if (data.pairs) setPairs(data.pairs);
      })
      .catch(() => {});
  }, []);

  // SSE for connection status
  useEffect(() => {
    const es = new EventSource('/api/spreads/live');
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setConnected(data.connected || false);
        setLastUpdate(data.timestamp);
      } catch (e) {}
    };
    es.onerror = () => setConnected(false);
    return () => es.close();
  }, []);

  const handleAction = useCallback((id, action) => {
    fetch('/api/bots', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action }),
    })
      .then(r => r.json())
      .then(() => fetchBots())
      .catch(err => console.error('Action failed:', err));
  }, [fetchBots]);

  const handleCreate = useCallback((e) => {
    e.preventDefault();
    const selected = pairs.find(p => `${p.asset_a}|${p.asset_b}` === formPair);
    if (!selected) return;

    fetch('/api/bots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: formName,
        pair_a: selected.asset_a,
        pair_b: selected.asset_b,
        strategy: formStrategy,
        entry_threshold_bps: parseFloat(formEntry),
        exit_threshold_bps: parseFloat(formExit),
        position_size: parseFloat(formSize),
      }),
    })
      .then(r => r.json())
      .then(() => {
        fetchBots();
        setShowCreate(false);
        setFormName('');
        setFormPair('');
      })
      .catch(err => console.error('Create failed:', err));
  }, [formName, formPair, formStrategy, formEntry, formExit, formSize, pairs, fetchBots]);

  const handleDelete = useCallback((id) => {
    if (!confirm('Delete this bot?')) return;
    fetch(`/api/bots/${id}`, { method: 'DELETE' })
      .then(() => fetchBots())
      .catch(err => console.error('Delete failed:', err));
  }, [fetchBots]);

  // Summary stats
  const totalPnl = bots.reduce((sum, b) => sum + (b.metrics?.total_pnl || 0), 0);
  const runningCount = bots.filter(b => b.state === 'running').length;
  const totalTrades = bots.reduce((sum, b) => sum + (b.metrics?.total_trades || 0), 0);

  return (
    <div className="min-h-screen bg-bg-primary">
      <NavHeader connected={connected} lastUpdate={lastUpdate} />

      <main className="max-w-[1800px] mx-auto px-4 py-6 space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-bg-card border border-bg-border rounded-lg p-4">
            <div className="text-[10px] text-gray-600 uppercase tracking-wider">Total Bots</div>
            <div className="text-2xl font-mono font-bold text-white mt-1">{bots.length}</div>
          </div>
          <div className="bg-bg-card border border-bg-border rounded-lg p-4">
            <div className="text-[10px] text-gray-600 uppercase tracking-wider">Running</div>
            <div className="text-2xl font-mono font-bold text-accent-green mt-1">{runningCount}</div>
          </div>
          <div className="bg-bg-card border border-bg-border rounded-lg p-4">
            <div className="text-[10px] text-gray-600 uppercase tracking-wider">Total P&L</div>
            <div className={`text-2xl font-mono font-bold mt-1 ${totalPnl >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
              {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(2)}$
            </div>
          </div>
          <div className="bg-bg-card border border-bg-border rounded-lg p-4">
            <div className="text-[10px] text-gray-600 uppercase tracking-wider">Total Trades</div>
            <div className="text-2xl font-mono font-bold text-white mt-1">{totalTrades}</div>
          </div>
        </div>

        {/* Header row */}
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-300">Bot Management</h2>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="px-4 py-2 text-xs bg-accent-blue/20 text-accent-blue border border-accent-blue/30 rounded-lg hover:bg-accent-blue/30 transition-colors"
          >
            {showCreate ? 'Cancel' : '+ New Bot'}
          </button>
        </div>

        {/* Create form */}
        {showCreate && (
          <form onSubmit={handleCreate} className="bg-bg-card border border-accent-blue/30 rounded-lg p-6 space-y-4 fade-in">
            <h3 className="text-sm font-semibold text-accent-blue">Create New Bot</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-[10px] text-gray-600 uppercase tracking-wider mb-1">Bot Name</label>
                <input
                  type="text"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="My Arb Bot"
                  required
                  className="w-full px-3 py-2 text-sm bg-bg-primary border border-bg-border rounded-lg text-white placeholder-gray-600 focus:border-accent-blue/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] text-gray-600 uppercase tracking-wider mb-1">Pair</label>
                <select
                  value={formPair}
                  onChange={e => setFormPair(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-sm bg-bg-primary border border-bg-border rounded-lg text-white focus:border-accent-blue/50 focus:outline-none"
                >
                  <option value="">Select pair...</option>
                  {pairs.map(p => (
                    <option key={`${p.asset_a}|${p.asset_b}`} value={`${p.asset_a}|${p.asset_b}`}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-gray-600 uppercase tracking-wider mb-1">Strategy</label>
                <select
                  value={formStrategy}
                  onChange={e => setFormStrategy(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-bg-primary border border-bg-border rounded-lg text-white focus:border-accent-blue/50 focus:outline-none"
                >
                  <option value="mean_reversion">Mean Reversion</option>
                  <option value="directional">Directional</option>
                  <option value="market_making">Market Making</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-gray-600 uppercase tracking-wider mb-1">Entry Threshold (bps)</label>
                <input
                  type="number"
                  step="0.1"
                  value={formEntry}
                  onChange={e => setFormEntry(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-bg-primary border border-bg-border rounded-lg text-white focus:border-accent-blue/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] text-gray-600 uppercase tracking-wider mb-1">Exit Threshold (bps)</label>
                <input
                  type="number"
                  step="0.1"
                  value={formExit}
                  onChange={e => setFormExit(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-bg-primary border border-bg-border rounded-lg text-white focus:border-accent-blue/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] text-gray-600 uppercase tracking-wider mb-1">Position Size ($)</label>
                <input
                  type="number"
                  step="10"
                  value={formSize}
                  onChange={e => setFormSize(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-bg-primary border border-bg-border rounded-lg text-white focus:border-accent-blue/50 focus:outline-none"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                className="px-6 py-2 text-sm bg-accent-green/20 text-accent-green border border-accent-green/30 rounded-lg hover:bg-accent-green/30 transition-colors"
              >
                Create Bot
              </button>
            </div>
          </form>
        )}

        {/* Bot grid */}
        {loading ? (
          <div className="text-center text-gray-600 py-12">Loading bots...</div>
        ) : bots.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-gray-600 text-sm mb-4">No bots configured yet</div>
            <button
              onClick={() => setShowCreate(true)}
              className="px-6 py-3 text-sm bg-accent-blue/20 text-accent-blue border border-accent-blue/30 rounded-lg hover:bg-accent-blue/30 transition-colors"
            >
              Create Your First Bot
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {bots.map(bot => (
              <BotCard
                key={bot.id}
                bot={bot}
                onStart={(id) => handleAction(id, 'start')}
                onStop={(id) => handleAction(id, 'stop')}
                onPause={(id) => handleAction(id, 'pause')}
              />
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-bg-border py-4 mt-8">
        <div className="max-w-[1800px] mx-auto px-4 flex items-center justify-between text-xs text-gray-600">
          <span>HiP-3 Spread Analyzer — Bot Management</span>
          <span className="font-mono">{bots.length} bots configured</span>
        </div>
      </footer>
    </div>
  );
}
