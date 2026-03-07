'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import NavHeader from '../../../components/NavHeader';
import BotTradeLog from '../../../components/BotTradeLog';

const STATE_COLORS = {
  running: { bg: 'bg-accent-green/20', text: 'text-accent-green', border: 'border-accent-green/30', dot: 'bg-accent-green' },
  paused:  { bg: 'bg-accent-amber/20', text: 'text-accent-amber', border: 'border-accent-amber/30', dot: 'bg-accent-amber' },
  stopped: { bg: 'bg-gray-500/20', text: 'text-gray-400', border: 'border-gray-500/30', dot: 'bg-gray-500' },
  error:   { bg: 'bg-accent-red/20', text: 'text-accent-red', border: 'border-accent-red/30', dot: 'bg-accent-red' },
};

export default function BotDetailPage() {
  const { botId } = useParams();
  const router = useRouter();
  const [bot, setBot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [liveSpread, setLiveSpread] = useState(null);
  const [connected, setConnected] = useState(false);

  // Edit form
  const [editEntry, setEditEntry] = useState(0);
  const [editExit, setEditExit] = useState(0);
  const [editSize, setEditSize] = useState(0);

  const fetchBot = useCallback(() => {
    fetch(`/api/bots/${botId}`)
      .then(r => r.json())
      .then(data => {
        if (data.bot) {
          setBot(data.bot);
          setEditEntry(data.bot.entry_threshold_bps);
          setEditExit(data.bot.exit_threshold_bps);
          setEditSize(data.bot.position_size);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [botId]);

  useEffect(() => {
    fetchBot();
    const interval = setInterval(fetchBot, 5000);
    return () => clearInterval(interval);
  }, [fetchBot]);

  // SSE for live spread of this bot's pair
  useEffect(() => {
    const es = new EventSource('/api/spreads/live');
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setConnected(data.connected || false);
        if (data.spreads && bot) {
          const match = data.spreads.find(
            s => s.pair_a === bot.pair_a && s.pair_b === bot.pair_b
          );
          if (match) setLiveSpread(match);
        }
      } catch (e) {}
    };
    es.onerror = () => setConnected(false);
    return () => es.close();
  }, [bot?.pair_a, bot?.pair_b]);

  const handleAction = useCallback((action) => {
    fetch('/api/bots', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: botId, action }),
    })
      .then(() => fetchBot())
      .catch(err => console.error('Action failed:', err));
  }, [botId, fetchBot]);

  const handleSave = useCallback(() => {
    fetch(`/api/bots/${botId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entry_threshold_bps: parseFloat(editEntry),
        exit_threshold_bps: parseFloat(editExit),
        position_size: parseFloat(editSize),
      }),
    })
      .then(() => {
        fetchBot();
        setEditing(false);
      })
      .catch(err => console.error('Save failed:', err));
  }, [botId, editEntry, editExit, editSize, fetchBot]);

  const handleDelete = useCallback(() => {
    if (!confirm('Are you sure you want to delete this bot?')) return;
    fetch(`/api/bots/${botId}`, { method: 'DELETE' })
      .then(() => router.push('/bots'))
      .catch(err => console.error('Delete failed:', err));
  }, [botId, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-primary">
        <NavHeader connected={connected} />
        <div className="flex items-center justify-center h-64 text-gray-600">Loading...</div>
      </div>
    );
  }

  if (!bot) {
    return (
      <div className="min-h-screen bg-bg-primary">
        <NavHeader connected={connected} />
        <div className="flex flex-col items-center justify-center h-64 text-gray-600">
          <p>Bot not found</p>
          <Link href="/bots" className="mt-4 text-accent-blue hover:underline text-sm">Back to Bots</Link>
        </div>
      </div>
    );
  }

  const colors = STATE_COLORS[bot.state] || STATE_COLORS.stopped;
  const pnl = bot.metrics?.total_pnl || 0;
  const isPositive = pnl >= 0;

  return (
    <div className="min-h-screen bg-bg-primary">
      <NavHeader connected={connected} />

      <main className="max-w-[1400px] mx-auto px-4 py-6 space-y-6">
        {/* Back link */}
        <Link href="/bots" className="text-xs text-gray-600 hover:text-gray-400 transition-colors">
          &larr; Back to Bots
        </Link>

        {/* Bot header */}
        <div className="bg-bg-card border border-bg-border rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl font-bold text-white">{bot.name}</h1>
              <div className="text-xs text-gray-500 font-mono mt-1">
                <span className="text-accent-blue">{bot.pair_a}</span>
                <span className="mx-2">&#8652;</span>
                <span className="text-accent-amber">{bot.pair_b}</span>
                <span className="mx-3">|</span>
                <span>{bot.strategy}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1 text-xs font-mono uppercase rounded-lg ${colors.bg} ${colors.text} border ${colors.border}`}>
                <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${colors.dot} ${bot.state === 'running' ? 'animate-pulse' : ''}`} />
                {bot.state}
              </span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex gap-3 flex-wrap">
            {(bot.state === 'stopped' || bot.state === 'error') && (
              <button onClick={() => handleAction('start')} className="px-4 py-2 text-xs bg-accent-green/20 text-accent-green border border-accent-green/30 rounded-lg hover:bg-accent-green/30 transition-colors">
                Start Bot
              </button>
            )}
            {bot.state === 'running' && (
              <>
                <button onClick={() => handleAction('pause')} className="px-4 py-2 text-xs bg-accent-amber/20 text-accent-amber border border-accent-amber/30 rounded-lg hover:bg-accent-amber/30 transition-colors">
                  Pause
                </button>
                <button onClick={() => handleAction('stop')} className="px-4 py-2 text-xs bg-accent-red/20 text-accent-red border border-accent-red/30 rounded-lg hover:bg-accent-red/30 transition-colors">
                  Stop
                </button>
              </>
            )}
            {bot.state === 'paused' && (
              <>
                <button onClick={() => handleAction('start')} className="px-4 py-2 text-xs bg-accent-green/20 text-accent-green border border-accent-green/30 rounded-lg hover:bg-accent-green/30 transition-colors">
                  Resume
                </button>
                <button onClick={() => handleAction('stop')} className="px-4 py-2 text-xs bg-accent-red/20 text-accent-red border border-accent-red/30 rounded-lg hover:bg-accent-red/30 transition-colors">
                  Stop
                </button>
              </>
            )}
            <button
              onClick={() => setEditing(!editing)}
              className="px-4 py-2 text-xs text-gray-500 border border-bg-border rounded-lg hover:text-gray-300 hover:border-accent-blue/30 transition-colors"
            >
              {editing ? 'Cancel Edit' : 'Edit Config'}
            </button>
            <button
              onClick={handleDelete}
              className="px-4 py-2 text-xs text-gray-600 border border-bg-border rounded-lg hover:text-accent-red hover:border-accent-red/30 transition-colors"
            >
              Delete Bot
            </button>
          </div>
        </div>

        {/* Edit form */}
        {editing && (
          <div className="bg-bg-card border border-accent-blue/30 rounded-lg p-6 space-y-4 fade-in">
            <h3 className="text-sm font-semibold text-accent-blue">Edit Configuration</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-[10px] text-gray-600 uppercase tracking-wider mb-1">Entry Threshold (bps)</label>
                <input
                  type="number"
                  step="0.1"
                  value={editEntry}
                  onChange={e => setEditEntry(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-bg-primary border border-bg-border rounded-lg text-white focus:border-accent-blue/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] text-gray-600 uppercase tracking-wider mb-1">Exit Threshold (bps)</label>
                <input
                  type="number"
                  step="0.1"
                  value={editExit}
                  onChange={e => setEditExit(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-bg-primary border border-bg-border rounded-lg text-white focus:border-accent-blue/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] text-gray-600 uppercase tracking-wider mb-1">Position Size ($)</label>
                <input
                  type="number"
                  step="10"
                  value={editSize}
                  onChange={e => setEditSize(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-bg-primary border border-bg-border rounded-lg text-white focus:border-accent-blue/50 focus:outline-none"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                onClick={handleSave}
                className="px-6 py-2 text-sm bg-accent-green/20 text-accent-green border border-accent-green/30 rounded-lg hover:bg-accent-green/30 transition-colors"
              >
                Save Changes
              </button>
            </div>
          </div>
        )}

        {/* Metrics grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-bg-card border border-bg-border rounded-lg p-4">
            <div className="text-[10px] text-gray-600 uppercase tracking-wider">Total P&L</div>
            <div className={`text-xl font-mono font-bold mt-1 ${isPositive ? 'text-accent-green' : 'text-accent-red'}`}>
              {isPositive ? '+' : ''}{pnl.toFixed(2)}$
            </div>
          </div>
          <div className="bg-bg-card border border-bg-border rounded-lg p-4">
            <div className="text-[10px] text-gray-600 uppercase tracking-wider">Trades</div>
            <div className="text-xl font-mono font-bold text-white mt-1">{bot.metrics?.total_trades || 0}</div>
          </div>
          <div className="bg-bg-card border border-bg-border rounded-lg p-4">
            <div className="text-[10px] text-gray-600 uppercase tracking-wider">Win Rate</div>
            <div className={`text-xl font-mono font-bold mt-1 ${(bot.metrics?.win_rate || 0) >= 50 ? 'text-accent-green' : 'text-accent-red'}`}>
              {(bot.metrics?.win_rate || 0).toFixed(1)}%
            </div>
          </div>
          <div className="bg-bg-card border border-bg-border rounded-lg p-4">
            <div className="text-[10px] text-gray-600 uppercase tracking-wider">Max Drawdown</div>
            <div className="text-xl font-mono font-bold text-accent-red mt-1">
              {(bot.metrics?.max_drawdown || 0).toFixed(2)}$
            </div>
          </div>
          <div className="bg-bg-card border border-bg-border rounded-lg p-4">
            <div className="text-[10px] text-gray-600 uppercase tracking-wider">Avg Hold Time</div>
            <div className="text-xl font-mono font-bold text-white mt-1">
              {(bot.metrics?.avg_hold_time_min || 0).toFixed(0)}m
            </div>
          </div>
        </div>

        {/* Live spread */}
        {liveSpread && (
          <div className="bg-bg-card border border-bg-border rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-300 mb-3">Live Spread</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-[10px] text-gray-600 uppercase">Dir 1 (Long A / Short B)</div>
                <div className="text-lg font-mono font-bold text-accent-green">{liveSpread.spread_1_bps?.toFixed(2)} bps</div>
              </div>
              <div>
                <div className="text-[10px] text-gray-600 uppercase">Dir 2 (Short A / Long B)</div>
                <div className="text-lg font-mono font-bold text-accent-amber">{liveSpread.spread_2_bps?.toFixed(2)} bps</div>
              </div>
              <div>
                <div className="text-[10px] text-gray-600 uppercase">Exec Size Dir 1</div>
                <div className="text-lg font-mono text-white">${liveSpread.exec_size_1?.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-[10px] text-gray-600 uppercase">Exec Size Dir 2</div>
                <div className="text-lg font-mono text-white">${liveSpread.exec_size_2?.toFixed(2)}</div>
              </div>
            </div>
            {/* Entry threshold indicator */}
            <div className="mt-3 pt-3 border-t border-bg-border">
              <div className="flex items-center gap-4 text-xs">
                <span className="text-gray-600">Entry threshold: <span className="text-white font-mono">{bot.entry_threshold_bps} bps</span></span>
                {liveSpread.spread_1_bps >= bot.entry_threshold_bps && (
                  <span className="px-2 py-0.5 bg-accent-green/20 text-accent-green border border-accent-green/30 rounded text-[10px] animate-pulse">
                    DIR 1 ENTRY SIGNAL
                  </span>
                )}
                {liveSpread.spread_2_bps >= bot.entry_threshold_bps && (
                  <span className="px-2 py-0.5 bg-accent-green/20 text-accent-green border border-accent-green/30 rounded text-[10px] animate-pulse">
                    DIR 2 ENTRY SIGNAL
                  </span>
                )}
                {liveSpread.spread_1_bps < bot.entry_threshold_bps && liveSpread.spread_2_bps < bot.entry_threshold_bps && (
                  <span className="px-2 py-0.5 bg-gray-500/20 text-gray-500 rounded text-[10px]">
                    NO SIGNAL
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Config summary */}
        <div className="bg-bg-card border border-bg-border rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Configuration</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-gray-600">Strategy</span>
              <div className="text-white font-mono mt-0.5">{bot.strategy}</div>
            </div>
            <div>
              <span className="text-gray-600">Entry Threshold</span>
              <div className="text-white font-mono mt-0.5">{bot.entry_threshold_bps} bps</div>
            </div>
            <div>
              <span className="text-gray-600">Exit Threshold</span>
              <div className="text-white font-mono mt-0.5">{bot.exit_threshold_bps} bps</div>
            </div>
            <div>
              <span className="text-gray-600">Position Size</span>
              <div className="text-white font-mono mt-0.5">${bot.position_size}</div>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-bg-border text-[10px] text-gray-600 font-mono">
            ID: {bot.id} · Created: {new Date(bot.created_at).toLocaleString()}
          </div>
        </div>

        {/* Trade log */}
        <BotTradeLog trades={bot.trades || []} />
      </main>
    </div>
  );
}
