"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { cn } from "@/lib/formatters";

const WINDOWS = ["1h", "6h", "12h", "24h", "7d"] as const;

const COLUMNS = [
  { key: "label", label: "Pair", align: "left" as const, sortable: true },
  { key: "live_d1", label: "Live D1", align: "right" as const, sortable: true },
  { key: "live_d2", label: "Live D2", align: "right" as const, sortable: true },
  { key: "d1_mean", label: "D1 Mean", align: "right" as const, sortable: true },
  { key: "d1_p50", label: "D1 P50", align: "right" as const, sortable: true },
  { key: "d2_mean", label: "D2 Mean", align: "right" as const, sortable: true },
  { key: "d2_p50", label: "D2 P50", align: "right" as const, sortable: true },
  { key: "d1_amplitude", label: "D1 Ampl.", align: "right" as const, sortable: true },
  { key: "d2_amplitude", label: "D2 Ampl.", align: "right" as const, sortable: true },
  { key: "d1_edge", label: "D1 DIR%", align: "right" as const, pct: true, sortable: true },
  { key: "d2_edge", label: "D2 DIR%", align: "right" as const, pct: true, sortable: true },
  { key: "d1_mr", label: "D1 MR%", align: "right" as const, pct: true, sortable: true },
  { key: "d2_mr", label: "D2 MR%", align: "right" as const, pct: true, sortable: true },
  { key: "d1_stddev", label: "D1 Vol", align: "right" as const, sortable: true },
  { key: "d2_stddev", label: "D2 Vol", align: "right" as const, sortable: true },
  { key: "d1_count", label: "Obs", align: "right" as const, sortable: true },
];

interface FlatRow {
  pair_a: string;
  pair_b: string;
  label: string;
  [key: string]: any;
}

function flattenRow(pair: any, liveSpreads: Record<string, any>): FlatRow {
  const d1 = pair.direction_1 || {};
  const d2 = pair.direction_2 || {};
  const key = `${pair.pair_a}|${pair.pair_b}`;
  const live = liveSpreads[key];
  const fallbackLive = pair.live;
  return {
    pair_a: pair.pair_a,
    pair_b: pair.pair_b,
    label: pair.label,
    live_d1: live ? live.spread_1 : fallbackLive?.spread_1 ?? null,
    live_d2: live ? live.spread_2 : fallbackLive?.spread_2 ?? null,
    d1_mean: d1.mean ?? null,
    d1_p50: d1.p50 ?? null,
    d2_mean: d2.mean ?? null,
    d2_p50: d2.p50 ?? null,
    d1_amplitude: d1.amplitude ?? null,
    d2_amplitude: d2.amplitude ?? null,
    d1_edge: d1.edge_freq ?? null,
    d2_edge: d2.edge_freq ?? null,
    d1_mr: d1.mr_edge_freq ?? null,
    d2_mr: d2.mr_edge_freq ?? null,
    d1_stddev: d1.stddev ?? null,
    d2_stddev: d2.stddev ?? null,
    d1_count: d1.count ?? null,
  };
}

function formatCell(col: (typeof COLUMNS)[number], val: any): string {
  if (val === null || val === undefined) return "\u2014";
  if (col.key === "label") return val;
  if ("pct" in col && col.pct) return `${(val * 100).toFixed(1)}%`;
  if (col.key === "d1_count") return val.toLocaleString();
  if (typeof val === "number") return val.toFixed(2);
  return String(val);
}

function cellColorClass(col: (typeof COLUMNS)[number], val: any, feeThreshold: number): string {
  if (val === null || val === undefined) return "text-gray-600";
  if (col.key === "label") return "text-gray-200";

  if (col.key === "live_d1" || col.key === "live_d2") {
    if (val > feeThreshold) return "text-accent-green";
    if (val < 0) return "text-accent-red";
    return "text-gray-300";
  }

  if ("pct" in col && col.pct) {
    if (col.key.includes("mr")) {
      if (val > 0.2) return "text-purple-400 font-semibold";
      if (val > 0.1) return "text-purple-300";
      if (val < 0.03) return "text-gray-600";
      return "text-gray-400";
    }
    if (val > 0.2) return "text-accent-green font-semibold";
    if (val > 0.1) return "text-accent-green/70";
    if (val < 0.03) return "text-gray-600";
    return "text-gray-400";
  }

  if (col.key.includes("amplitude")) {
    if (val > feeThreshold * 2) return "text-purple-400";
    if (val > feeThreshold) return "text-gray-300";
    return "text-gray-500";
  }

  return "text-gray-300";
}

export default function SpreadOverviewView() {
  const [selectedWindow, setSelectedWindow] = useState<string>("24h");
  const [data, setData] = useState<any>(null);
  const [liveSpreads, setLiveSpreads] = useState<Record<string, any>>({});
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [lastLiveUpdate, setLastLiveUpdate] = useState<Date | null>(null);
  const [sortCol, setSortCol] = useState("d1_edge");
  const [sortAsc, setSortAsc] = useState(false);
  const [filter, setFilter] = useState("");
  const [hideEmpty, setHideEmpty] = useState(true);

  // SSE for live spreads
  useEffect(() => {
    const es = new EventSource("/api/spread-analyzer/live");
    es.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.error) return;
        setConnected(msg.connected || false);
        setLastLiveUpdate(new Date());
        if (msg.spreads) {
          const spreadMap: Record<string, any> = {};
          for (const s of msg.spreads) {
            spreadMap[`${s.pair_a}|${s.pair_b}`] = {
              spread_1: s.spread_1_bps,
              spread_2: s.spread_2_bps,
              exec_1: s.exec_size_1,
              exec_2: s.exec_size_2,
              timestamp: s.timestamp || msg.timestamp,
            };
          }
          setLiveSpreads(spreadMap);
        }
      } catch { /* ignore */ }
    };
    es.onerror = () => setConnected(false);
    return () => es.close();
  }, []);

  // Fetch all-pair stats
  const fetchStats = useCallback(() => {
    setLoading(true);
    fetch(`/api/spread-analyzer/stats-all?window=${selectedWindow}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.error) {
          setData(d);
          setLastRefresh(new Date());
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [selectedWindow]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => {
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (e.key >= "1" && e.key <= "5") {
        setSelectedWindow(WINDOWS[parseInt(e.key) - 1]);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const feeThreshold = data?.fee_total_bps ?? 4.0;

  const rows = useMemo(() => {
    if (!data?.pairs) return [];
    let flattened = data.pairs.map((p: any) => flattenRow(p, liveSpreads));
    if (hideEmpty) flattened = flattened.filter((r: FlatRow) => r.d1_count !== null && r.d1_count > 0);
    if (filter) {
      const f = filter.toLowerCase();
      flattened = flattened.filter((r: FlatRow) => r.label.toLowerCase().includes(f));
    }
    if (sortCol) {
      flattened.sort((a: any, b: any) => {
        let va = a[sortCol];
        let vb = b[sortCol];
        if (typeof va === "string") {
          va = va.toLowerCase();
          vb = (vb || "").toLowerCase();
          return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
        }
        va = va ?? -Infinity;
        vb = vb ?? -Infinity;
        return sortAsc ? va - vb : vb - va;
      });
    }
    return flattened;
  }, [data, liveSpreads, sortCol, sortAsc, filter, hideEmpty]);

  const handleSort = (colKey: string) => {
    if (sortCol === colKey) setSortAsc(!sortAsc);
    else { setSortCol(colKey); setSortAsc(false); }
  };

  const summary = useMemo(() => {
    if (rows.length === 0) return null;
    const bestDirEdge = rows.reduce((best: any, r: any) => {
      const max = Math.max(r.d1_edge ?? 0, r.d2_edge ?? 0);
      if (max > best.val) return { val: max, label: r.label, dir: (r.d1_edge ?? 0) > (r.d2_edge ?? 0) ? "D1" : "D2" };
      return best;
    }, { val: 0, label: "", dir: "" });

    const bestMREdge = rows.reduce((best: any, r: any) => {
      const max = Math.max(r.d1_mr ?? 0, r.d2_mr ?? 0);
      if (max > best.val) return { val: max, label: r.label, dir: (r.d1_mr ?? 0) > (r.d2_mr ?? 0) ? "D1" : "D2" };
      return best;
    }, { val: 0, label: "", dir: "" });

    const bestAmplitude = rows.reduce((best: any, r: any) => {
      const max = Math.max(r.d1_amplitude ?? 0, r.d2_amplitude ?? 0);
      if (max > best.val) return { val: max, label: r.label, dir: (r.d1_amplitude ?? 0) > (r.d2_amplitude ?? 0) ? "D1" : "D2" };
      return best;
    }, { val: 0, label: "", dir: "" });

    return { bestDirEdge, bestMREdge, bestAmplitude, totalPairs: rows.length };
  }, [rows]);

  return (
    <div className="space-y-4">
      {/* Sub-header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-300">
            All Pairs — Rolling Stats <span className="text-accent-indigo font-mono">{selectedWindow}</span>
          </h2>
          <p className="text-[10px] text-gray-600 mt-1">
            Fees: {feeThreshold.toFixed(1)} bps round-trip · Live spreads via SSE (real-time) · Stats refresh every 30s
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-bg-primary rounded-lg p-0.5">
            {WINDOWS.map((w, i) => (
              <button
                key={w}
                onClick={() => setSelectedWindow(w)}
                className={cn(
                  "px-3 py-1 text-xs rounded-md transition-colors",
                  selectedWindow === w ? "bg-accent-indigo text-white" : "text-gray-500 hover:text-gray-300"
                )}
                title={`Press ${i + 1}`}
              >
                {w}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <span className={cn("w-2 h-2 rounded-full", connected ? "bg-accent-green animate-pulse" : "bg-accent-red")} />
            <span className="text-[10px] text-gray-500">{connected ? "LIVE" : "DISCONNECTED"}</span>
          </div>
          <button
            onClick={fetchStats}
            className="px-2 py-1 text-xs text-gray-500 hover:text-gray-300 border border-bg-border rounded transition-colors"
          >
            Refresh Stats
          </button>
          <div className="text-[10px] text-gray-600 font-mono">
            {lastLiveUpdate && <span className="text-accent-green">Live {lastLiveUpdate.toLocaleTimeString()}</span>}
            {lastRefresh && <span className="ml-2">Stats {lastRefresh.toLocaleTimeString()}</span>}
            {loading && <span className="ml-2 text-accent-amber">loading...</span>}
          </div>
        </div>
      </div>

      {/* Summary bar */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="bg-bg-surface border border-bg-border rounded-xl p-3 text-center">
            <span className="text-[10px] text-gray-500 uppercase tracking-wider">Total Pairs</span>
            <p className="font-mono text-xl text-white font-semibold">{summary.totalPairs}</p>
          </div>
          <div className="bg-bg-surface border border-bg-border rounded-xl p-3 text-center">
            <span className="text-[10px] text-accent-green uppercase tracking-wider">Best DIR Edge</span>
            <p className="font-mono text-xl text-accent-green font-semibold">{(summary.bestDirEdge.val * 100).toFixed(1)}%</p>
            <span className="text-[10px] text-gray-500">{summary.bestDirEdge.label} ({summary.bestDirEdge.dir})</span>
          </div>
          <div className="bg-bg-surface border border-bg-border rounded-xl p-3 text-center">
            <span className="text-[10px] text-purple-400 uppercase tracking-wider">Best MR Edge</span>
            <p className="font-mono text-xl text-purple-400 font-semibold">{(summary.bestMREdge.val * 100).toFixed(1)}%</p>
            <span className="text-[10px] text-gray-500">{summary.bestMREdge.label} ({summary.bestMREdge.dir})</span>
          </div>
          <div className="bg-bg-surface border border-bg-border rounded-xl p-3 text-center">
            <span className="text-[10px] text-purple-400 uppercase tracking-wider">Best Amplitude</span>
            <p className="font-mono text-xl text-purple-400 font-semibold">{summary.bestAmplitude.val.toFixed(2)} <span className="text-xs text-gray-500">bps</span></p>
            <span className="text-[10px] text-gray-500">{summary.bestAmplitude.label} ({summary.bestAmplitude.dir})</span>
          </div>
        </div>
      )}

      {/* Filter + controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Filter pairs..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="bg-bg-surface border border-bg-border rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-accent-indigo w-64"
          />
          <button
            onClick={() => setHideEmpty(!hideEmpty)}
            className={cn(
              "px-2 py-1 text-[10px] rounded transition-colors",
              hideEmpty
                ? "bg-accent-amber/20 text-accent-amber border border-accent-amber/30"
                : "text-gray-500 border border-bg-border hover:text-gray-300"
            )}
          >
            {hideEmpty ? "Active Only" : "Show All"}
          </button>
        </div>
        <span className="text-xs text-gray-600">Click column headers to sort</span>
      </div>

      {/* Main table */}
      <div className="bg-bg-surface border border-bg-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-bg-primary/50">
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    className={cn(
                      "py-2.5 px-2 font-medium text-gray-500 whitespace-nowrap cursor-pointer hover:text-gray-300 transition-colors",
                      col.align === "left" ? "text-left sticky left-0 bg-bg-primary/90 z-10" : "text-right",
                      col.key.includes("mr") && "bg-purple-500/5"
                    )}
                    onClick={() => col.sortable && handleSort(col.key)}
                  >
                    <span className="flex items-center gap-1 justify-end">
                      {col.align === "left" && <span>{col.label}</span>}
                      {sortCol === col.key && <span className="text-accent-indigo">{sortAsc ? "\u2191" : "\u2193"}</span>}
                      {col.align !== "left" && <span>{col.label}</span>}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length} className="py-8 text-center text-gray-500">
                    {loading ? "Loading..." : "No data available"}
                  </td>
                </tr>
              ) : (
                rows.map((row: FlatRow) => {
                  const liveGreen = (row.live_d1 > feeThreshold) || (row.live_d2 > feeThreshold);
                  const hasEdge = Math.max(row.d1_edge ?? 0, row.d2_edge ?? 0) > 0.15;
                  const hasMR = Math.max(row.d1_mr ?? 0, row.d2_mr ?? 0) > 0.15;

                  return (
                    <tr
                      key={`${row.pair_a}|${row.pair_b}`}
                      className={cn(
                        "border-b border-bg-border/30 hover:bg-bg-border/20 transition-colors",
                        liveGreen && "bg-accent-green/5"
                      )}
                    >
                      {COLUMNS.map((col) => (
                        <td
                          key={col.key}
                          className={cn(
                            "py-2 px-2 font-mono whitespace-nowrap",
                            col.align === "left" ? "text-left sticky left-0 bg-bg-surface z-10" : "text-right",
                            cellColorClass(col, row[col.key], feeThreshold),
                            col.key.includes("mr") && "bg-purple-500/5"
                          )}
                        >
                          {col.key === "label" ? (
                            <span className="flex items-center gap-1.5">
                              <span className="font-medium">{row.label}</span>
                              {hasEdge && <span className="w-1.5 h-1.5 rounded-full bg-accent-green inline-block" />}
                              {hasMR && <span className="w-1.5 h-1.5 rounded-full bg-purple-400 inline-block" />}
                            </span>
                          ) : (
                            formatCell(col, row[col.key])
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend */}
      <div className="bg-bg-surface border border-bg-border rounded-xl p-3 space-y-2">
        <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-1">Column Legend</p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1 text-[10px] text-gray-500">
          <div><span className="text-gray-300 font-medium">Pair</span> — Trading pair. D1 = short A / long B, D2 = long A / short B.</div>
          <div><span className="text-gray-300 font-medium">Live D1 / D2</span> — Current spread in bps (real-time).</div>
          <div><span className="text-gray-300 font-medium">D1 Mean / D2 Mean</span> — Average spread over the rolling window.</div>
          <div><span className="text-gray-300 font-medium">D1 P50 / D2 P50</span> — Median spread (50th percentile).</div>
          <div><span className="text-gray-300 font-medium">D1 Ampl. / D2 Ampl.</span> — Spread amplitude (P90 - P10).</div>
          <div><span className="text-gray-300 font-medium">D1 DIR% / D2 DIR%</span> — % of time spread exceeds fees.</div>
          <div><span className="text-purple-400 font-medium">D1 MR% / D2 MR%</span> — Mean-reversion edge frequency.</div>
          <div><span className="text-gray-300 font-medium">D1 Vol / D2 Vol</span> — Spread volatility (stddev).</div>
          <div><span className="text-gray-300 font-medium">Obs</span> — Number of observations in window.</div>
        </div>
        <div className="flex items-center gap-4 text-[10px] text-gray-500 pt-1 border-t border-bg-border/50">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-green inline-block" /> DIR Edge {"> "}15%
          </span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 inline-block" /> MR Edge {"> "}15%
          </span>
          <span><span className="text-accent-green">Green row</span> = live spread {"> "} fees (tradeable now)</span>
          <span><span className="text-accent-red">Red</span> = negative spread</span>
        </div>
      </div>
    </div>
  );
}
