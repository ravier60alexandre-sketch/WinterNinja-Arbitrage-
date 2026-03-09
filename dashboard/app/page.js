'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import ConnectionStatus from '../components/ConnectionStatus';
import PairSelector from '../components/PairSelector';
import MetricCards from '../components/MetricCards';
import SpreadChart from '../components/SpreadChart';
import DistributionChart from '../components/DistributionChart';
import StatsTable from '../components/StatsTable';
import EntryCalculator from '../components/EntryCalculator';

export default function DashboardPage() {
  const [pairs, setPairs] = useState([]);
  const [selectedPair, setSelectedPair] = useState(null);
  const [connected, setConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [liveSpreads, setLiveSpreads] = useState({});
  const [historyData, setHistoryData] = useState([]);
  const [stats, setStats] = useState(null);
  const [bestOpportunity, setBestOpportunity] = useState(null);
  const [selectedWindow, setSelectedWindow] = useState('1h');
  const [compareMode, setCompareMode] = useState(false);
  const [comparePairs, setComparePairs] = useState([]);
  const [compareData, setCompareData] = useState({});

  const eventSourceRef = useRef(null);
  const pairsListRef = useRef([]);

  const feeThreshold = 4.0; // 2 * 1.5 + 1.0

  // Fetch pairs on mount
  useEffect(() => {
    fetch('/api/pairs')
      .then(r => r.json())
      .then(data => {
        if (data.pairs) {
          setPairs(data.pairs);
          pairsListRef.current = data.pairs;
          if (data.pairs.length > 0 && !selectedPair) {
            setSelectedPair(data.pairs[0]);
          }
        }
      })
      .catch(err => console.error('Failed to fetch pairs:', err));
  }, []);

  // SSE connection
  useEffect(() => {
    const es = new EventSource('/api/spreads/live');
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.error) return;

        setConnected(data.connected || false);
        setLastUpdate(data.timestamp);

        if (data.spreads) {
          const spreadMap = {};
          for (const s of data.spreads) {
            spreadMap[`${s.pair_a}|${s.pair_b}`] = s;
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

    return () => {
      es.close();
    };
  }, []);

  // Fetch history when pair or window changes
  useEffect(() => {
    if (!selectedPair || compareMode) return;

    const fetchHistory = () => {
      fetch(`/api/spreads/history?pair_a=${encodeURIComponent(selectedPair.asset_a)}&pair_b=${encodeURIComponent(selectedPair.asset_b)}&window=${selectedWindow}&limit=1000`)
        .then(r => r.json())
        .then(data => {
          if (data.data) setHistoryData(data.data);
        })
        .catch(() => {});
    };

    fetchHistory();
    const interval = setInterval(fetchHistory, 5000);
    return () => clearInterval(interval);
  }, [selectedPair, selectedWindow, compareMode]);

  // Fetch stats when pair changes
  useEffect(() => {
    if (!selectedPair) return;

    const fetchStats = () => {
      fetch(`/api/stats?pair_a=${encodeURIComponent(selectedPair.asset_a)}&pair_b=${encodeURIComponent(selectedPair.asset_b)}`)
        .then(r => r.json())
        .then(data => {
          if (data.stats) setStats(data.stats);
          if (data.best_opportunity) setBestOpportunity(data.best_opportunity);
        })
        .catch(() => {});
    };

    fetchStats();
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, [selectedPair]);

  // Fetch compare data
  useEffect(() => {
    if (!compareMode || comparePairs.length === 0) return;

    const fetchAll = () => {
      const promises = comparePairs.map(pair =>
        fetch(`/api/spreads/history?pair_a=${encodeURIComponent(pair.asset_a)}&pair_b=${encodeURIComponent(pair.asset_b)}&window=${selectedWindow}&limit=500`)
          .then(r => r.json())
          .then(data => ({ key: `${pair.asset_a}|${pair.asset_b}`, data: data.data || [] }))
      );

      Promise.all(promises).then(results => {
        const cd = {};
        for (const r of results) {
          cd[r.key] = r.data;
        }
        setCompareData(cd);
      });
    };

    fetchAll();
    const interval = setInterval(fetchAll, 5000);
    return () => clearInterval(interval);
  }, [compareMode, comparePairs, selectedWindow]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e) => {
      if (e.target.tagName === 'INPUT') return;

      const windows = ['1h', '6h', '12h', '24h', '7d'];
      if (e.key >= '1' && e.key <= '5') {
        setSelectedWindow(windows[parseInt(e.key) - 1]);
        return;
      }

      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const allPairs = pairsListRef.current;
        if (allPairs.length === 0 || !selectedPair) return;
        const idx = allPairs.findIndex(p => p.asset_a === selectedPair.asset_a && p.asset_b === selectedPair.asset_b);
        const next = e.key === 'ArrowRight'
          ? (idx + 1) % allPairs.length
          : (idx - 1 + allPairs.length) % allPairs.length;
        setSelectedPair(allPairs[next]);
        setCompareMode(false);
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [selectedPair]);

  const handleSelectPair = useCallback((pair) => {
    setSelectedPair(pair);
    setCompareMode(false);
    setComparePairs([]);
    setCompareData({});
  }, []);

  const handleCompareAll = useCallback((underlying, groupPairs) => {
    setCompareMode(true);
    setComparePairs(groupPairs);
    if (groupPairs.length > 0) {
      setSelectedPair(groupPairs[0]);
    }
  }, []);

  const handleWindowChange = useCallback((w) => {
    setSelectedWindow(w);
  }, []);

  const currentSpread = selectedPair
    ? liveSpreads[`${selectedPair.asset_a}|${selectedPair.asset_b}`]
    : null;

  return (
    <div className="min-h-screen bg-bg-primary">
      {/* Header */}
      <header className="border-b border-bg-border bg-bg-card/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-lg font-bold text-white tracking-tight hover:text-accent-blue transition-colors">
              HiP-3 <span className="text-accent-green">Spread Analyzer</span>
            </Link>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 text-xs bg-accent-blue/20 text-accent-blue border border-accent-blue/30 rounded-md">
                Detail
              </span>
              <Link
                href="/overview"
                className="px-3 py-1 text-xs text-gray-500 hover:text-gray-300 border border-bg-border rounded-md transition-colors"
              >
                Overview
              </Link>
              <Link
                href="/overview?tab=bots"
                className="px-3 py-1 text-xs text-gray-500 hover:text-gray-300 border border-bg-border rounded-md transition-colors"
              >
                Bots
              </Link>
            </div>
            <PairSelector
              pairs={pairs}
              selectedPair={selectedPair}
              onSelect={handleSelectPair}
              onCompareAll={handleCompareAll}
            />
            {compareMode && (
              <button
                onClick={() => { setCompareMode(false); setComparePairs([]); setCompareData({}); }}
                className="px-2 py-1 text-xs bg-accent-amber/20 text-accent-amber rounded hover:bg-accent-amber/30 transition-colors"
              >
                Exit Compare
              </button>
            )}
          </div>
          <ConnectionStatus connected={connected} lastUpdate={lastUpdate} />
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1600px] mx-auto px-4 py-6 space-y-6">
        {/* Metric Cards */}
        <MetricCards
          spreadData={currentSpread}
          stats={stats}
          feeThreshold={feeThreshold}
          bestOpportunity={bestOpportunity}
        />

        {/* Spread Chart */}
        <SpreadChart
          historyData={historyData}
          feeThreshold={feeThreshold}
          selectedWindow={selectedWindow}
          onWindowChange={handleWindowChange}
          compareMode={compareMode}
          comparePairs={comparePairs}
          compareData={compareData}
          stats={stats}
        />

        {/* Distribution + Stats side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <DistributionChart
            historyData={historyData}
            feeThreshold={feeThreshold}
            stats={stats}
          />
          <StatsTable stats={stats} />
        </div>

        {/* Entry Calculator */}
        <EntryCalculator
          stats={stats}
          defaultFee={1.5}
          defaultSlippage={1.0}
        />
      </main>

      {/* Footer */}
      <footer className="border-t border-bg-border py-4 mt-8">
        <div className="max-w-[1600px] mx-auto px-4 flex items-center justify-between text-xs text-gray-600">
          <span>HiP-3 Spread Analyzer — Hyperliquid</span>
          <span className="font-mono">
            Keys: ←/→ pairs · 1-5 windows
          </span>
        </div>
      </footer>
    </div>
  );
}
