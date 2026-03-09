'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import OverviewTable from '../../components/OverviewTable';
import BotsPanel from '../../components/BotsPanel';
import DetailPanel from '../../components/DetailPanel';

const WINDOWS = ['1h', '6h', '12h', '24h', '7d'];
const TABS = ['detail', 'overview', 'bots'];

export default function OverviewPage() {
  return (
    <Suspense>
      <OverviewPageInner />
    </Suspense>
  );
}

function OverviewPageInner() {
  const searchParams = useSearchParams();
  const paramTab = searchParams.get('tab');
  const initialTab = TABS.includes(paramTab) ? paramTab : 'detail';

  const [activeTab, setActiveTab] = useState(initialTab);
  const [window, setWindow] = useState('24h');
  const [data, setData] = useState(null);
  const [liveSpreads, setLiveSpreads] = useState({});
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [lastLiveUpdate, setLastLiveUpdate] = useState(null);
  const liveCountRef = useRef(0);

  // Update URL without reload when tab changes
  const switchTab = useCallback((tab) => {
    setActiveTab(tab);
    const url = new URL(globalThis.location);
    url.searchParams.set('tab', tab);
    globalThis.history.replaceState(null, '', url);
  }, []);

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

  // Keyboard shortcuts: 1-5 for windows (only when overview tab active)
  useEffect(() => {
    const handleKey = (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (activeTab === 'overview' && e.key >= '1' && e.key <= '5') {
        setWindow(WINDOWS[parseInt(e.key) - 1]);
      }
    };
    addEventListener('keydown', handleKey);
    return () => removeEventListener('keydown', handleKey);
  }, [activeTab]);

  const feeThreshold = data ? data.fee_total_bps : 4.0;

  const tabClass = (tab) =>
    `px-3 py-1 text-xs rounded-md transition-colors ${
      activeTab === tab
        ? 'bg-accent-blue/20 text-accent-blue border border-accent-blue/30'
        : 'text-gray-500 hover:text-gray-300 border border-bg-border'
    }`;

  return (
    <div className="min-h-screen bg-bg-primary">
      {/* Header */}
      <header className="border-b border-bg-border bg-bg-card/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-[1800px] mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-lg font-bold text-white tracking-tight">
              HiP-3 <span className="text-accent-green">Spread Analyzer</span>
            </span>
            <div className="flex items-center gap-2">
              <button onClick={() => switchTab('detail')} className={tabClass('detail')}>
                Detail View
              </button>
              <button onClick={() => switchTab('overview')} className={tabClass('overview')}>
                Overview
              </button>
              <button onClick={() => switchTab('bots')} className={tabClass('bots')}>
                Bots
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Window selector (only show for overview tab) */}
            {activeTab === 'overview' && (
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
            )}

            {/* Connection status */}
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${connected ? 'bg-accent-green animate-pulse' : 'bg-accent-red'}`} />
              <span className="text-[10px] text-gray-500">
                {connected ? 'LIVE' : 'DISCONNECTED'}
              </span>
            </div>

            {/* Manual stats refresh (only for overview) */}
            {activeTab === 'overview' && (
              <button
                onClick={fetchStats}
                className="px-2 py-1 text-xs text-gray-500 hover:text-gray-300 border border-bg-border rounded transition-colors"
              >
                Refresh Stats
              </button>
            )}

            {/* Status */}
            <div className="text-[10px] text-gray-600 font-mono">
              {lastLiveUpdate && (
                <span className="text-accent-green">Live {lastLiveUpdate.toLocaleTimeString()}</span>
              )}
              {activeTab === 'overview' && lastRefresh && (
                <span className="ml-2">Stats {lastRefresh.toLocaleTimeString()}</span>
              )}
              {activeTab === 'overview' && loading && <span className="ml-2 text-accent-amber">loading...</span>}
            </div>
          </div>
        </div>
      </header>

      {/* Content — all panels stay mounted, hidden via CSS */}
      <main className="max-w-[1800px] mx-auto px-4 py-6">
        {/* Detail View tab */}
        <div className={activeTab === 'detail' ? '' : 'hidden'}>
          <DetailPanel />
        </div>

        {/* Overview tab */}
        <div className={activeTab === 'overview' ? '' : 'hidden'}>
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
        </div>

        {/* Bots tab */}
        <div className={activeTab === 'bots' ? '' : 'hidden'}>
          <BotsPanel />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-bg-border py-4 mt-8">
        <div className="max-w-[1800px] mx-auto px-4 flex items-center justify-between text-xs text-gray-600">
          <span>HiP-3 Spread Analyzer — Hyperliquid</span>
          <span className="font-mono">
            {activeTab === 'detail' ? 'Keys: ←/→ pairs · 1-5 windows' :
             activeTab === 'overview' ? 'Keys: 1-5 windows' : '6-Bot Deployer Router'}
          </span>
        </div>
      </footer>
    </div>
  );
}
