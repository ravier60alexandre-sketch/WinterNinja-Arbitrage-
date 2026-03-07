'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import OverviewTable from '../../components/OverviewTable';

const WINDOWS = ['1h', '6h', '12h', '24h', '7d'];

export default function OverviewPage() {
  const [window, setWindow] = useState('24h');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchData = useCallback(() => {
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

  // Fetch on mount and window change
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh every 15s (lighter on DB than 5s)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchData]);

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

            {/* Auto-refresh toggle */}
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                autoRefresh
                  ? 'bg-accent-green/20 text-accent-green border border-accent-green/30'
                  : 'text-gray-500 border border-bg-border hover:text-gray-300'
              }`}
            >
              {autoRefresh ? 'LIVE' : 'PAUSED'}
            </button>

            {/* Manual refresh */}
            <button
              onClick={fetchData}
              className="px-2 py-1 text-xs text-gray-500 hover:text-gray-300 border border-bg-border rounded transition-colors"
            >
              Refresh
            </button>

            {/* Status */}
            <div className="text-[10px] text-gray-600 font-mono">
              {lastRefresh && `${lastRefresh.toLocaleTimeString()}`}
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
              Fees: {feeThreshold.toFixed(1)} bps round-trip · Each pair shows Direction 1 (A Short/B Long) and Direction 2 (A Long/B Short)
            </p>
          </div>
        </div>

        <OverviewTable data={data} feeThreshold={feeThreshold} />
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
