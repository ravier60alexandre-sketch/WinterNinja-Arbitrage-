"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ComposedChart, Legend,
  BarChart, Bar,
} from "recharts";
import { cn } from "@/lib/formatters";
import { AVAILABLE_PAIRS } from "@/lib/constants";

interface PairDef {
  asset_a: string;
  asset_b: string;
  label: string;
}

interface SpreadLive {
  pair_a: string;
  pair_b: string;
  spread_1_bps: number;
  spread_2_bps: number;
  exec_size_1: number;
  exec_size_2: number;
}

const TIME_WINDOWS = ["1h", "6h", "12h", "24h", "7d"] as const;
const FEE_THRESHOLD = 4.0;

function formatTime(timestamp: number) {
  const d = new Date(timestamp);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

function SpreadTooltip({ active, payload, label }: any) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-bg-surface border border-bg-border rounded-lg p-3 shadow-xl">
      <p className="text-xs text-text-secondary font-mono mb-2">{new Date(label).toLocaleString()}</p>
      {payload.map((entry: any, i: number) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-text-secondary">{entry.name}:</span>
          <span className="font-mono font-medium text-text-primary">{entry.value?.toFixed(2)} bps</span>
        </div>
      ))}
    </div>
  );
}

function buildHistogram(values: number[], bins = 40) {
  if (!values || values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return [{ bin: min.toFixed(1), center: min, count: values.length }];
  const binWidth = (max - min) / bins;
  const histogram = [];
  for (let i = 0; i < bins; i++) {
    const lo = min + i * binWidth;
    const hi = lo + binWidth;
    const center = (lo + hi) / 2;
    const count = values.filter((v) => v >= lo && (i === bins - 1 ? v <= hi : v < hi)).length;
    histogram.push({ bin: center.toFixed(1), center, count });
  }
  return histogram;
}

// ----------- PairSelector component -----------
function PairSelector({
  pairs,
  selectedPair,
  onSelect,
}: {
  pairs: PairDef[];
  selectedPair: PairDef | null;
  onSelect: (pair: PairDef) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const grouped: Record<string, PairDef[]> = {};
  for (const pair of pairs) {
    const match = pair.asset_a.match(/^xyz:(.+)$/);
    if (match) {
      const underlying = match[1];
      if (!grouped[underlying]) grouped[underlying] = [];
      grouped[underlying].push(pair);
    }
  }

  const searchLower = search.toLowerCase();
  const filtered = Object.entries(grouped)
    .filter(([u]) => u.toLowerCase().includes(searchLower))
    .sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-bg-surface border border-bg-border rounded-lg text-sm font-medium hover:border-accent-indigo transition-colors min-w-[260px]"
      >
        <span className="font-mono text-text-primary truncate">
          {selectedPair?.label || "Select a pair"}
        </span>
        <svg className={cn("w-4 h-4 text-text-secondary transition-transform", isOpen && "rotate-180")} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full mt-1 left-0 w-[340px] max-h-[480px] bg-bg-surface border border-bg-border rounded-lg shadow-2xl z-50 overflow-hidden">
          <div className="p-2 border-b border-bg-border">
            <input
              type="text"
              placeholder="Search asset..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-3 py-2 bg-bg-primary border border-bg-border rounded text-sm text-text-primary placeholder-text-secondary/40 focus:outline-none focus:border-accent-indigo"
              autoFocus
            />
          </div>
          <div className="overflow-y-auto max-h-[400px]">
            {filtered.map(([underlying, groupPairs]) => (
              <div key={underlying}>
                <div className="px-3 py-2 bg-bg-primary/50">
                  <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">{underlying}</span>
                </div>
                {groupPairs.map((pair) => {
                  const deployer = pair.asset_b.split(":")[0].toUpperCase();
                  const isSelected = selectedPair?.asset_a === pair.asset_a && selectedPair?.asset_b === pair.asset_b;
                  return (
                    <button
                      key={`${pair.asset_a}-${pair.asset_b}`}
                      onClick={() => { onSelect(pair); setIsOpen(false); setSearch(""); }}
                      className={cn(
                        "w-full text-left px-4 py-2 text-sm hover:bg-bg-border/50 transition-colors",
                        isSelected ? "bg-accent-indigo/10 text-accent-indigo" : "text-text-secondary"
                      )}
                    >
                      <span className="font-mono">XYZ vs {deployer}</span>
                    </button>
                  );
                })}
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="p-4 text-center text-text-secondary text-sm">No pairs found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ----------- Main SpreadAnalyzerPage -----------
export default function SpreadAnalyzerPage() {
  const [pairs, setPairs] = useState<PairDef[]>([]);
  const [selectedPair, setSelectedPair] = useState<PairDef | null>(null);
  const [connected, setConnected] = useState(false);
  const [liveSpreads, setLiveSpreads] = useState<Record<string, SpreadLive>>({});
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [bestOpportunity, setBestOpportunity] = useState<any>(null);
  const [selectedWindow, setSelectedWindow] = useState<string>("1h");
  const [distDir, setDistDir] = useState<"both" | "d1" | "d2">("both");

  const pairsRef = useRef<PairDef[]>([]);

  // Fetch pairs
  useEffect(() => {
    fetch("/api/spread-analyzer/pairs")
      .then((r) => r.json())
      .then((data) => {
        if (data.pairs) {
          setPairs(data.pairs);
          pairsRef.current = data.pairs;
          if (data.pairs.length > 0 && !selectedPair) {
            setSelectedPair(data.pairs[0]);
          }
        }
      })
      .catch(() => {
        // Fallback to AVAILABLE_PAIRS constant
        const fallback = AVAILABLE_PAIRS.map((p) => ({ asset_a: p.asset_a, asset_b: p.asset_b, label: p.label }));
        setPairs(fallback);
        pairsRef.current = fallback;
        if (fallback.length > 0) setSelectedPair(fallback[0]);
      });
  }, []);

  // SSE for live spreads
  useEffect(() => {
    const es = new EventSource("/api/spread-analyzer/live");
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.error) return;
        setConnected(data.connected || false);
        if (data.spreads) {
          const spreadMap: Record<string, SpreadLive> = {};
          for (const s of data.spreads) {
            spreadMap[`${s.pair_a}|${s.pair_b}`] = s;
          }
          setLiveSpreads(spreadMap);
        }
      } catch {
        // ignore
      }
    };
    es.onerror = () => setConnected(false);
    return () => es.close();
  }, []);

  // Fetch history
  useEffect(() => {
    if (!selectedPair) return;
    const fetchHistory = () => {
      fetch(`/api/spread-analyzer/history?pair_a=${encodeURIComponent(selectedPair.asset_a)}&pair_b=${encodeURIComponent(selectedPair.asset_b)}&window=${selectedWindow}&limit=1000`)
        .then((r) => r.json())
        .then((data) => { if (data.data) setHistoryData(data.data); })
        .catch(() => {});
    };
    fetchHistory();
    const interval = setInterval(fetchHistory, 5000);
    return () => clearInterval(interval);
  }, [selectedPair, selectedWindow]);

  // Fetch stats
  useEffect(() => {
    if (!selectedPair) return;
    const fetchStats = () => {
      fetch(`/api/spread-analyzer/stats?pair_a=${encodeURIComponent(selectedPair.asset_a)}&pair_b=${encodeURIComponent(selectedPair.asset_b)}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.stats) setStats(data.stats);
          if (data.best_opportunity) setBestOpportunity(data.best_opportunity);
        })
        .catch(() => {});
    };
    fetchStats();
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, [selectedPair]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      const windows = ["1h", "6h", "12h", "24h", "7d"];
      if (e.key >= "1" && e.key <= "5") {
        setSelectedWindow(windows[parseInt(e.key) - 1]);
        return;
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const all = pairsRef.current;
        if (all.length === 0 || !selectedPair) return;
        const idx = all.findIndex((p) => p.asset_a === selectedPair.asset_a && p.asset_b === selectedPair.asset_b);
        const next = e.key === "ArrowRight" ? (idx + 1) % all.length : (idx - 1 + all.length) % all.length;
        setSelectedPair(all[next]);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedPair]);

  const currentSpread = selectedPair ? liveSpreads[`${selectedPair.asset_a}|${selectedPair.asset_b}`] : null;

  // Chart data
  const chartData = useMemo(() => {
    if (!historyData || historyData.length === 0) return [];
    return historyData.map((row) => ({
      timestamp: row.timestamp,
      spread_1: row.spread_1_bps,
      spread_2: row.spread_2_bps,
    }));
  }, [historyData]);

  // MR zones
  const mrZones = useMemo(() => {
    if (!stats) return null;
    const windowStats = stats[selectedWindow] || stats["24h"];
    if (!windowStats) return null;
    const d1 = windowStats.direction_1;
    const d2 = windowStats.direction_2;
    return {
      d1_median: d1?.p50 ?? null,
      d1_above: d1?.mr_entry_above ?? null,
      d1_below: d1?.mr_entry_below ?? null,
      d2_median: d2?.p50 ?? null,
      d2_above: d2?.mr_entry_above ?? null,
      d2_below: d2?.mr_entry_below ?? null,
    };
  }, [stats, selectedWindow]);

  // Distribution data
  const { histogram1, histogram2 } = useMemo(() => {
    const data = historyData || [];
    const d1 = data.map((r: any) => r.spread_1_bps).filter((v: any) => v != null);
    const d2 = data.map((r: any) => r.spread_2_bps).filter((v: any) => v != null);
    return { histogram1: buildHistogram(d1), histogram2: buildHistogram(d2) };
  }, [historyData]);

  const distData = useMemo(() => {
    if (distDir === "d1") return histogram1.map((d) => ({ ...d, dir1: d.count }));
    if (distDir === "d2") return histogram2.map((d) => ({ ...d, dir2: d.count }));
    const map = new Map<string, any>();
    for (const d of histogram1) map.set(d.bin, { bin: d.bin, center: d.center, dir1: d.count, dir2: 0 });
    for (const d of histogram2) {
      if (map.has(d.bin)) map.get(d.bin).dir2 = d.count;
      else map.set(d.bin, { bin: d.bin, center: d.center, dir1: 0, dir2: d.count });
    }
    return Array.from(map.values()).sort((a, b) => a.center - b.center);
  }, [histogram1, histogram2, distDir]);

  // Stats table data
  const statsTableDir = useState<1 | 2>(1);
  const [activeDir, setActiveDir] = statsTableDir;
  const dirKey = `direction_${activeDir}`;
  const STAT_COLUMNS = [
    { key: "mean", label: "Mean" },
    { key: "p50", label: "Median" },
    { key: "p10", label: "P10" },
    { key: "p90", label: "P90" },
    { key: "amplitude", label: "Amplitude" },
    { key: "stddev", label: "StdDev" },
    { key: "edge_freq", label: "DIR Edge" },
    { key: "mr_edge_freq", label: "MR Edge" },
    { key: "mean_reversion", label: "Mean Rev" },
    { key: "count", label: "Count" },
  ];
  const statsRows = TIME_WINDOWS.map((w) => {
    const s = stats?.[w]?.[dirKey];
    return { window: w, ...(s || {}) };
  });

  const s1 = currentSpread?.spread_1_bps;
  const s2 = currentSpread?.spread_2_bps;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-semibold text-text-primary">
            Spread Analyzer
          </h1>
          <PairSelector pairs={pairs} selectedPair={selectedPair} onSelect={setSelectedPair} />
        </div>
        <div className="flex items-center gap-2 text-xs text-text-secondary">
          <span className={cn("w-2 h-2 rounded-full", connected ? "bg-accent-green animate-pulse" : "bg-accent-red")} />
          <span>{connected ? "Connected" : "Disconnected"}</span>
        </div>
      </div>

      {/* Live Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-bg-surface border border-bg-border rounded-xl p-4">
          <p className="text-[10px] text-text-secondary uppercase tracking-wider mb-1">Spread D1</p>
          <p className={cn("font-mono text-xl font-semibold", s1 != null && s1 > FEE_THRESHOLD ? "text-accent-green" : s1 != null && s1 < 0 ? "text-accent-red" : "text-text-primary")}>
            {s1 != null ? s1.toFixed(2) : "--"} <span className="text-xs text-text-secondary">bps</span>
          </p>
          <p className="text-[10px] text-text-secondary">A Short / B Long</p>
        </div>
        <div className="bg-bg-surface border border-bg-border rounded-xl p-4">
          <p className="text-[10px] text-text-secondary uppercase tracking-wider mb-1">Exec Size D1</p>
          <p className="font-mono text-xl font-semibold text-text-primary">
            {currentSpread?.exec_size_1 != null ? currentSpread.exec_size_1.toFixed(1) : "--"}
          </p>
        </div>
        <div className="bg-bg-surface border border-bg-border rounded-xl p-4">
          <p className="text-[10px] text-text-secondary uppercase tracking-wider mb-1">Spread D2</p>
          <p className={cn("font-mono text-xl font-semibold", s2 != null && s2 > FEE_THRESHOLD ? "text-accent-green" : s2 != null && s2 < 0 ? "text-accent-red" : "text-text-primary")}>
            {s2 != null ? s2.toFixed(2) : "--"} <span className="text-xs text-text-secondary">bps</span>
          </p>
          <p className="text-[10px] text-text-secondary">A Long / B Short</p>
        </div>
        <div className="bg-bg-surface border border-bg-border rounded-xl p-4">
          <p className="text-[10px] text-text-secondary uppercase tracking-wider mb-1">Exec Size D2</p>
          <p className="font-mono text-xl font-semibold text-text-primary">
            {currentSpread?.exec_size_2 != null ? currentSpread.exec_size_2.toFixed(1) : "--"}
          </p>
        </div>
        <div className="bg-bg-surface border border-bg-border rounded-xl p-4">
          <p className="text-[10px] text-text-secondary uppercase tracking-wider mb-1">Amplitude 24h</p>
          <p className="font-mono text-xl font-semibold text-text-primary">
            {stats?.["24h"]?.direction_1?.amplitude != null
              ? Math.max(stats["24h"].direction_1.amplitude, stats["24h"]?.direction_2?.amplitude || 0).toFixed(2)
              : "--"}{" "}
            <span className="text-xs text-text-secondary">bps</span>
          </p>
        </div>
        <div className="bg-bg-surface border border-bg-border rounded-xl p-4">
          <p className="text-[10px] text-text-secondary uppercase tracking-wider mb-1">Best Edge 24h</p>
          <p className="font-mono text-xl font-semibold text-accent-green">
            {bestOpportunity ? `${(bestOpportunity.edge_freq * 100).toFixed(1)}%` : "--"}
          </p>
          {bestOpportunity && (
            <span className={cn(
              "text-[10px] px-1.5 py-0.5 rounded font-medium",
              bestOpportunity.type === "directional" ? "bg-accent-green/20 text-accent-green" : "bg-purple-500/20 text-purple-400"
            )}>
              {bestOpportunity.type === "directional" ? "DIR" : "MR"}{" "}
              {bestOpportunity.direction === "direction_1" ? "D1" : "D2"}
            </span>
          )}
        </div>
      </div>

      {/* Spread Chart */}
      <div className="rounded-xl border border-bg-border bg-bg-surface p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-text-primary">Real-Time Spread</h2>
          <div className="flex items-center gap-1 bg-bg-primary rounded-lg p-0.5">
            {TIME_WINDOWS.map((w) => (
              <button
                key={w}
                onClick={() => setSelectedWindow(w)}
                className={cn(
                  "px-3 py-1 text-xs rounded-md transition-colors",
                  selectedWindow === w ? "bg-accent-indigo text-white" : "text-text-secondary hover:text-text-primary"
                )}
              >
                {w}
              </button>
            ))}
          </div>
        </div>
        <div className="h-[350px]">
          {chartData.length === 0 ? (
            <div className="flex items-center justify-center h-full text-text-secondary text-sm">
              Waiting for data...
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                <XAxis dataKey="timestamp" tickFormatter={formatTime} stroke="#4a4a5a" tick={{ fontSize: 10, fill: "#6b7280" }} type="number" domain={["dataMin", "dataMax"]} scale="time" />
                <YAxis stroke="#4a4a5a" tick={{ fontSize: 10, fill: "#6b7280" }} tickFormatter={(v: number) => `${v.toFixed(1)}`} />
                <Tooltip content={<SpreadTooltip />} />
                <Legend wrapperStyle={{ fontSize: "11px", color: "#9ca3af" }} />
                <ReferenceLine y={FEE_THRESHOLD} stroke="#f59e0b" strokeDasharray="6 4" label={{ value: `Fee: ${FEE_THRESHOLD} bps`, position: "right", fill: "#f59e0b", fontSize: 10 }} />
                <ReferenceLine y={0} stroke="#4a4a5a" />
                {mrZones && mrZones.d1_median !== null && (
                  <>
                    <ReferenceLine y={mrZones.d1_median} stroke="#00d4aa" strokeDasharray="3 3" strokeOpacity={0.5} />
                    {mrZones.d1_above !== null && <ReferenceLine y={mrZones.d1_above} stroke="#a855f7" strokeDasharray="4 4" strokeOpacity={0.6} />}
                    {mrZones.d1_below !== null && <ReferenceLine y={mrZones.d1_below} stroke="#a855f7" strokeDasharray="4 4" strokeOpacity={0.6} />}
                  </>
                )}
                <Line type="monotone" dataKey="spread_1" name="A Short / B Long" stroke="#00d4aa" dot={false} strokeWidth={1.5} />
                <Line type="monotone" dataKey="spread_2" name="A Long / B Short" stroke="#3b82f6" dot={false} strokeWidth={1.5} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Distribution + Stats Table */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Distribution */}
        <div className="rounded-xl border border-bg-border bg-bg-surface p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-text-primary">Spread Distribution</h2>
            <div className="flex bg-bg-primary rounded-lg p-0.5">
              {(["both", "d1", "d2"] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setDistDir(d)}
                  className={cn(
                    "px-2 py-1 text-[10px] rounded-md transition-colors",
                    distDir === d ? "bg-accent-indigo text-white" : "text-text-secondary hover:text-text-primary"
                  )}
                >
                  {d === "both" ? "Overlay" : d === "d1" ? "Dir 1" : "Dir 2"}
                </button>
              ))}
            </div>
          </div>
          <div className="h-[250px]">
            {distData.length === 0 ? (
              <div className="flex items-center justify-center h-full text-text-secondary text-sm">Waiting for data...</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={distData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                  <XAxis dataKey="bin" stroke="#4a4a5a" tick={{ fontSize: 9, fill: "#6b7280" }} />
                  <YAxis stroke="#4a4a5a" tick={{ fontSize: 10, fill: "#6b7280" }} />
                  <Tooltip contentStyle={{ backgroundColor: "#12121a", border: "1px solid #1e1e2e", borderRadius: 8 }} />
                  {distDir === "both" ? (
                    <>
                      <Bar dataKey="dir1" name="XYZ Short / B Long" fill="#00d4aa" opacity={0.7} />
                      <Bar dataKey="dir2" name="XYZ Long / B Short" fill="#3b82f6" opacity={0.7} />
                      <Legend wrapperStyle={{ fontSize: "10px" }} />
                    </>
                  ) : distDir === "d1" ? (
                    <Bar dataKey="dir1" name="XYZ Short / B Long" fill="#00d4aa" opacity={0.8} />
                  ) : (
                    <Bar dataKey="dir2" name="XYZ Long / B Short" fill="#3b82f6" opacity={0.8} />
                  )}
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Stats Table */}
        <div className="rounded-xl border border-bg-border bg-bg-surface p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-text-primary">Rolling Statistics</h2>
            <div className="flex bg-bg-primary rounded-lg p-0.5">
              <button
                onClick={() => setActiveDir(1)}
                className={cn("px-3 py-1 text-xs rounded-md transition-colors", activeDir === 1 ? "bg-accent-green/20 text-accent-green" : "text-text-secondary hover:text-text-primary")}
              >
                A Short / B Long
              </button>
              <button
                onClick={() => setActiveDir(2)}
                className={cn("px-3 py-1 text-xs rounded-md transition-colors", activeDir === 2 ? "bg-accent-indigo/20 text-accent-indigo" : "text-text-secondary hover:text-text-primary")}
              >
                A Long / B Short
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-bg-border">
                  <th className="text-left py-2 px-2 text-text-secondary font-medium">Window</th>
                  {STAT_COLUMNS.map((col) => (
                    <th key={col.key} className="text-right py-2 px-2 text-text-secondary font-medium">{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {statsRows.map((row) => (
                  <tr key={row.window} className="border-b border-bg-border/50 hover:bg-bg-border/30 transition-colors">
                    <td className="py-2 px-2 font-mono text-text-primary font-medium">{row.window}</td>
                    {STAT_COLUMNS.map((col) => {
                      const val = (row as any)[col.key];
                      let display = "--";
                      let color = "text-text-secondary";
                      if (val != null) {
                        if (col.key === "edge_freq" || col.key === "mr_edge_freq") {
                          display = `${(val * 100).toFixed(1)}%`;
                          if (val > 0.2) color = col.key === "mr_edge_freq" ? "text-purple-400" : "text-accent-green";
                        } else if (col.key === "count") {
                          display = val.toLocaleString();
                          color = "text-text-primary";
                        } else {
                          display = val.toFixed(2);
                          color = "text-text-primary";
                        }
                      }
                      return (
                        <td key={col.key} className={cn("py-2 px-2 text-right font-mono", color)}>
                          {display}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Footer hint */}
      <div className="text-xs text-text-secondary text-center pb-4">
        Keys: left/right arrows to switch pairs, 1-5 to change time window
      </div>
    </div>
  );
}
