'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import OverviewTable from '../../components/OverviewTable';

const WINDOWS = ['1h', '6h', '12h', '24h', '7d'];

export default function OverviewPage() {
  const [window, setWindow] = useState('24h');
  const [data, setData] = useState(null);
  const [liveSpreads, setLiveSpreads] = useState({});
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [lastLiveUpdate, setLastLiveUpdate] = useState(null);
  const liveCountRef = useRef(0);

  // 1) SSE for live spreads — instant updates every 500ms
  useEffect(() => {
    const es = new EventSource('/api/spreads/live');

    es.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.error) return;

        setConnected(msg.connected || false);
        setLastLiveUpdate(new Date());
        liveCountRef.current++;

        if (msg.spreads) {
          const spreadMap = {};
          for (const s of msg.spreads) {
            spreadMap[`${s.pair_a}|${s.pair_b}`] = {
              spread_1: s.spread_1_bps,
              spread_2: s.spread_2_bps,
              exec_1: s.exec_size_1,
              exec_2: s.exec_size_2,
              timestamp: s.timestamp || msg.timestamp
            };
          }
          setLiveSpreads(spreadMap);
        }
      } catch (err) {
        // Ignore parse errors
      }
    };

    es.onerror = () => {
      setConnected(false);
    };

    return () => es.close();
  }, []);

  // 2) Polling for rolling stats only — every 30s (stats change slowly)
  const fetchStats = useCallback(() => {
    setLoading(true);
    fetch(`/api/stats/all?window=${window}`)
      .then(r => r.json())
      .then(d => {
        if (!d.error) {
          setData(d);
          setLastRefresh(new Date());
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [window]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  // Keyboard shortcuts: 1-5 for windows
  useEffect(() => {
    const handleKey = (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.key >= '1' && e.key <= '5') {
        setWindow(WINDOWS[parseInt(e.key) - 1]);
      }
    };
    addEventListener('keydown', handleKey);
    return () => removeEventListener('keydown', handleKey);
  }, []);

  const feeThreshold = data ? data.fee_total_bps : 4.0;

  return (
    <div className="min-h-screen bg-bg-primary">
      {/* Header */}
      <header className="border-b border-bg-border bg-bg-card/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-[1800px] mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-lg font-bold text-white tracking-tight hover:text-accent-blue transition-colors">
              HiP-3 <span className="text-accent-green">Spread Analyzer</span>
            </Link>
            <div className="flex items-center gap-2">
              <Link
                href="/"
                className="px-3 py-1 text-xs text-gray-500 hover:text-gray-300 border border-bg-border rounded-md transition-colors"
              >
                Detail View
              </Link>
              <span className="px-3 py-1 text-xs bg-accent-blue/20 text-accent-blue border border-accent-blue/30 rounded-md">
                Overview
              </span>
              <Link
                href="/bots"
                className="px-3 py-1 text-xs text-gray-500 hover:text-gray-300 border border-bg-border rounded-md transition-colors"
              >
                Bots
              </Link>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Window selector */}
            <div className="flex bg-bg-primary rounded-lg p-0.5">
              {WINDOWS.map((w, i) => (
                <button
                  key={w}
                  onClick={() => setWindow(w)}
                  className={`px-3 py-1 text-xs rounded-md transition-colors ${
                    window === w
                      ? 'bg-accent-blue text-white'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                  title={`Press ${i + 1}`}
                >
                  {w}
                </button>
              ))}
            </div>

            {/* Connection status */}
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${connected ? 'bg-accent-green animate-pulse' : 'bg-accent-red'}`} />
              <span className="text-[10px] text-gray-500">
                {connected ? 'LIVE' : 'DISCONNECTED'}
              </span>
            </div>

            {/* Manual stats refresh */}
            <button
              onClick={fetchStats}
              className="px-2 py-1 text-xs text-gray-500 hover:text-gray-300 border border-bg-border rounded transition-colors"
            >
              Refresh Stats
            </button>

            {/* Status */}
            <div className="text-[10px] text-gray-600 font-mono">
              {lastLiveUpdate && (
                <span className="text-accent-green">Live {lastLiveUpdate.toLocaleTimeString()}</span>
              )}
              {lastRefresh && (
                <span className="ml-2">Stats {lastRefresh.toLocaleTimeString()}</span>
              )}
              {loading && <span className="ml-2 text-accent-amber">loading...</span>}
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-[1800px] mx-auto px-4 py-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-300">
              All Pairs — Rolling Stats <span className="text-accent-blue font-mono">{window}</span>
            </h2>
            <p className="text-[10px] text-gray-600 mt-1">
              Fees: {feeThreshold.toFixed(1)} bps round-trip · Live spreads via SSE (real-time) · Stats refresh every 30s
            </p>
          </div>
        </div>

        <OverviewTable data={data} liveSpreads={liveSpreads} feeThreshold={feeThreshold} />
      </main>

      {/* Footer */}
      <footer className="border-t border-bg-border py-4 mt-8">
        <div className="max-w-[1800px] mx-auto px-4 flex items-center justify-between text-xs text-gray-600">
          <span>HiP-3 Spread Analyzer — Hyperliquid</span>
          <span className="font-mono">
            Keys: 1-5 windows
          </span>
        </div>
      </footer>
    </div>
  );
}
