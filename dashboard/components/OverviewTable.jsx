'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';

const COLUMNS = [
  { key: 'label', label: 'Pair', align: 'left', sortable: true },
  { key: 'live_d1', label: 'Live D1', align: 'right', suffix: 'bps', sortable: true },
  { key: 'live_d2', label: 'Live D2', align: 'right', suffix: 'bps', sortable: true },
  { key: 'd1_mean', label: 'D1 Mean', align: 'right', suffix: 'bps', sortable: true },
  { key: 'd1_p50', label: 'D1 P50', align: 'right', suffix: 'bps', sortable: true },
  { key: 'd2_mean', label: 'D2 Mean', align: 'right', suffix: 'bps', sortable: true },
  { key: 'd2_p50', label: 'D2 P50', align: 'right', suffix: 'bps', sortable: true },
  { key: 'd1_amplitude', label: 'D1 Ampl.', align: 'right', suffix: 'bps', sortable: true },
  { key: 'd2_amplitude', label: 'D2 Ampl.', align: 'right', suffix: 'bps', sortable: true },
  { key: 'd1_edge', label: 'D1 DIR%', align: 'right', pct: true, sortable: true },
  { key: 'd2_edge', label: 'D2 DIR%', align: 'right', pct: true, sortable: true },
  { key: 'd1_mr', label: 'D1 MR%', align: 'right', pct: true, sortable: true },
  { key: 'd2_mr', label: 'D2 MR%', align: 'right', pct: true, sortable: true },
  { key: 'd1_stddev', label: 'D1 Vol', align: 'right', suffix: 'bps', sortable: true },
  { key: 'd2_stddev', label: 'D2 Vol', align: 'right', suffix: 'bps', sortable: true },
  { key: 'd1_count', label: 'Obs', align: 'right', sortable: true },
];

function flattenRow(pair) {
  const d1 = pair.direction_1 || {};
  const d2 = pair.direction_2 || {};
  return {
    pair_a: pair.pair_a,
    pair_b: pair.pair_b,
    label: pair.label,
    live_d1: pair.live ? pair.live.spread_1 : null,
    live_d2: pair.live ? pair.live.spread_2 : null,
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
    d1_mean_rev: d1.mean_reversion ?? null,
    d2_mean_rev: d2.mean_reversion ?? null,
    live_ts: pair.live ? pair.live.timestamp : null,
  };
}

function formatCell(col, val) {
  if (val === null || val === undefined) return '—';
  if (col.key === 'label') return val;
  if (col.pct) return `${(val * 100).toFixed(1)}%`;
  if (col.key === 'd1_count') return val.toLocaleString();
  if (typeof val === 'number') return val.toFixed(2);
  return String(val);
}

function cellColorClass(col, val, feeThreshold) {
  if (val === null || val === undefined) return 'text-gray-600';
  if (col.key === 'label') return 'text-gray-200';

  // Live spread colors
  if (col.key === 'live_d1' || col.key === 'live_d2') {
    if (val > feeThreshold) return 'text-accent-green';
    if (val < 0) return 'text-accent-red';
    return 'text-gray-300';
  }

  // Edge frequencies
  if (col.pct) {
    if (col.key.includes('mr')) {
      if (val > 0.20) return 'text-purple-400 font-semibold';
      if (val > 0.10) return 'text-purple-300';
      if (val < 0.03) return 'text-gray-600';
      return 'text-gray-400';
    }
    if (val > 0.20) return 'text-accent-green font-semibold';
    if (val > 0.10) return 'text-accent-green/70';
    if (val < 0.03) return 'text-gray-600';
    return 'text-gray-400';
  }

  // Amplitude
  if (col.key.includes('amplitude')) {
    if (val > feeThreshold * 2) return 'text-purple-400';
    if (val > feeThreshold) return 'text-gray-300';
    return 'text-gray-500';
  }

  return 'text-gray-300';
}

export default function OverviewTable({ data, feeThreshold }) {
  const [sortCol, setSortCol] = useState('d1_edge');
  const [sortAsc, setSortAsc] = useState(false);
  const [filter, setFilter] = useState('');
  const [hideEmpty, setHideEmpty] = useState(true);

  const rows = useMemo(() => {
    if (!data || !data.pairs) return [];

    let flattened = data.pairs.map(flattenRow);

    // Hide pairs without data
    if (hideEmpty) {
      flattened = flattened.filter(r => r.d1_count !== null && r.d1_count > 0);
    }

    // Text filter
    if (filter) {
      const f = filter.toLowerCase();
      flattened = flattened.filter(r => r.label.toLowerCase().includes(f));
    }

    // Sort
    if (sortCol) {
      flattened.sort((a, b) => {
        let va = a[sortCol];
        let vb = b[sortCol];
        if (typeof va === 'string') {
          va = va.toLowerCase();
          vb = (vb || '').toLowerCase();
          return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
        }
        va = va ?? -Infinity;
        vb = vb ?? -Infinity;
        return sortAsc ? va - vb : vb - va;
      });
    }

    return flattened;
  }, [data, sortCol, sortAsc, filter]);

  const handleSort = (colKey) => {
    if (sortCol === colKey) {
      setSortAsc(!sortAsc);
    } else {
      setSortCol(colKey);
      setSortAsc(false);
    }
  };

  // Summary row
  const summary = useMemo(() => {
    if (rows.length === 0) return null;
    const bestDirEdge = rows.reduce((best, r) => {
      const e1 = r.d1_edge ?? 0;
      const e2 = r.d2_edge ?? 0;
      const max = Math.max(e1, e2);
      if (max > best.val) return { val: max, label: r.label, dir: e1 > e2 ? 'D1' : 'D2' };
      return best;
    }, { val: 0, label: '', dir: '' });

    const bestMREdge = rows.reduce((best, r) => {
      const e1 = r.d1_mr ?? 0;
      const e2 = r.d2_mr ?? 0;
      const max = Math.max(e1, e2);
      if (max > best.val) return { val: max, label: r.label, dir: e1 > e2 ? 'D1' : 'D2' };
      return best;
    }, { val: 0, label: '', dir: '' });

    const bestAmplitude = rows.reduce((best, r) => {
      const a1 = r.d1_amplitude ?? 0;
      const a2 = r.d2_amplitude ?? 0;
      const max = Math.max(a1, a2);
      if (max > best.val) return { val: max, label: r.label, dir: a1 > a2 ? 'D1' : 'D2' };
      return best;
    }, { val: 0, label: '', dir: '' });

    return { bestDirEdge, bestMREdge, bestAmplitude, totalPairs: rows.length };
  }, [rows]);

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="bg-bg-card border border-bg-border rounded-xl p-3 text-center">
            <span className="text-[10px] text-gray-500 uppercase tracking-wider">Total Pairs</span>
            <p className="font-mono text-xl text-white font-semibold">{summary.totalPairs}</p>
          </div>
          <div className="bg-bg-card border border-bg-border rounded-xl p-3 text-center">
            <span className="text-[10px] text-accent-green uppercase tracking-wider">Best DIR Edge</span>
            <p className="font-mono text-xl text-accent-green font-semibold">{(summary.bestDirEdge.val * 100).toFixed(1)}%</p>
            <span className="text-[10px] text-gray-500">{summary.bestDirEdge.label} ({summary.bestDirEdge.dir})</span>
          </div>
          <div className="bg-bg-card border border-bg-border rounded-xl p-3 text-center">
            <span className="text-[10px] text-purple-400 uppercase tracking-wider">Best MR Edge</span>
            <p className="font-mono text-xl text-purple-400 font-semibold">{(summary.bestMREdge.val * 100).toFixed(1)}%</p>
            <span className="text-[10px] text-gray-500">{summary.bestMREdge.label} ({summary.bestMREdge.dir})</span>
          </div>
          <div className="bg-bg-card border border-bg-border rounded-xl p-3 text-center">
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
            className="bg-bg-card border border-bg-border rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-accent-blue w-64"
          />
          <button
            onClick={() => setHideEmpty(!hideEmpty)}
            className={`px-2 py-1 text-[10px] rounded transition-colors ${
              hideEmpty
                ? 'bg-accent-amber/20 text-accent-amber border border-accent-amber/30'
                : 'text-gray-500 border border-bg-border hover:text-gray-300'
            }`}
          >
            {hideEmpty ? 'Active Only' : 'Show All'}
          </button>
        </div>
        <span className="text-xs text-gray-600">
          Click column headers to sort · Click pair name for details
        </span>
      </div>

      {/* Main table */}
      <div className="bg-bg-card border border-bg-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-bg-primary/50">
                {COLUMNS.map(col => (
                  <th
                    key={col.key}
                    className={`py-2.5 px-2 font-medium text-gray-500 whitespace-nowrap cursor-pointer hover:text-gray-300 transition-colors ${
                      col.align === 'left' ? 'text-left sticky left-0 bg-bg-primary/90 z-10' : 'text-right'
                    } ${col.key.includes('mr') ? 'bg-purple-500/5' : ''}`}
                    onClick={() => col.sortable && handleSort(col.key)}
                  >
                    <span className="flex items-center gap-1 justify-end">
                      {col.align === 'left' && <span>{col.label}</span>}
                      {sortCol === col.key && (
                        <span className="text-accent-blue">{sortAsc ? '↑' : '↓'}</span>
                      )}
                      {col.align !== 'left' && <span>{col.label}</span>}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length} className="py-8 text-center text-gray-500">
                    No data available
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  // Determine if this row has a strong signal
                  const hasEdge = Math.max(row.d1_edge ?? 0, row.d2_edge ?? 0) > 0.15;
                  const hasMR = Math.max(row.d1_mr ?? 0, row.d2_mr ?? 0) > 0.15;
                  const liveGreen = (row.live_d1 > feeThreshold) || (row.live_d2 > feeThreshold);

                  return (
                    <tr
                      key={`${row.pair_a}|${row.pair_b}`}
                      className={`border-b border-bg-border/30 hover:bg-bg-border/20 transition-colors ${
                        liveGreen ? 'bg-accent-green/5' : ''
                      }`}
                    >
                      {COLUMNS.map(col => (
                        <td
                          key={col.key}
                          className={`py-2 px-2 font-mono whitespace-nowrap ${
                            col.align === 'left'
                              ? 'text-left sticky left-0 bg-bg-card z-10'
                              : 'text-right'
                          } ${cellColorClass(col, row[col.key], feeThreshold)} ${
                            col.key.includes('mr') ? 'bg-purple-500/5' : ''
                          }`}
                        >
                          {col.key === 'label' ? (
                            <Link
                              href={`/?pair_a=${encodeURIComponent(row.pair_a)}&pair_b=${encodeURIComponent(row.pair_b)}`}
                              className="hover:text-accent-blue transition-colors flex items-center gap-1.5"
                            >
                              <span className="font-medium">{row.label}</span>
                              {hasEdge && <span className="w-1.5 h-1.5 rounded-full bg-accent-green inline-block" />}
                              {hasMR && <span className="w-1.5 h-1.5 rounded-full bg-purple-400 inline-block" />}
                            </Link>
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
      <div className="flex items-center gap-4 text-[10px] text-gray-600">
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-accent-green inline-block" /> DIR Edge {'>'} 15%
        </span>
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-purple-400 inline-block" /> MR Edge {'>'} 15%
        </span>
        <span>
          <span className="text-accent-green">Green live</span> = spread {'>'} fees
        </span>
        <span>
          <span className="text-purple-400">Purple cols</span> = mean reversion metrics
        </span>
      </div>
    </div>
  );
}
