'use client';

import { useState } from 'react';

const WINDOWS = ['1h', '6h', '12h', '24h', '7d'];
const COLUMNS = [
  { key: 'mean', label: 'Mean' },
  { key: 'p50', label: 'Median' },
  { key: 'p10', label: 'P10' },
  { key: 'p90', label: 'P90' },
  { key: 'stddev', label: 'StdDev' },
  { key: 'edge_freq', label: 'Edge Freq' },
  { key: 'mean_reversion', label: 'Mean Rev' },
  { key: 'count', label: 'Count' }
];

function formatVal(key, val) {
  if (val === null || val === undefined) return '—';
  if (key === 'edge_freq') return `${(val * 100).toFixed(1)}%`;
  if (key === 'count') return val.toLocaleString();
  return val.toFixed(2);
}

function cellColor(key, val) {
  if (val === null || val === undefined) return '';
  if (key === 'edge_freq' && val > 0.20) return 'text-accent-green';
  if (key === 'edge_freq' && val < 0.05) return 'text-accent-red';
  if (key === 'mean_reversion' && val > 0) return 'text-accent-red';
  if (key === 'mean_reversion' && val < -0.2) return 'text-accent-green';
  return '';
}

export default function StatsTable({ stats }) {
  const [activeDir, setActiveDir] = useState(1);
  const [sortCol, setSortCol] = useState(null);
  const [sortAsc, setSortAsc] = useState(false);

  const dirKey = `direction_${activeDir}`;

  const rows = WINDOWS.map(w => {
    const s = stats && stats[w] && stats[w][dirKey];
    return { window: w, ...(s || {}) };
  });

  if (sortCol) {
    rows.sort((a, b) => {
      const va = a[sortCol] ?? -Infinity;
      const vb = b[sortCol] ?? -Infinity;
      return sortAsc ? va - vb : vb - va;
    });
  }

  const handleSort = (col) => {
    if (sortCol === col) {
      setSortAsc(!sortAsc);
    } else {
      setSortCol(col);
      setSortAsc(false);
    }
  };

  return (
    <div className="bg-bg-card border border-bg-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-300">Rolling Statistics</h3>
        <div className="flex bg-bg-primary rounded-lg p-0.5">
          <button
            onClick={() => setActiveDir(1)}
            className={`px-3 py-1 text-xs rounded-md transition-colors ${
              activeDir === 1 ? 'bg-accent-green/20 text-accent-green' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            XYZ Short / B Long
          </button>
          <button
            onClick={() => setActiveDir(2)}
            className={`px-3 py-1 text-xs rounded-md transition-colors ${
              activeDir === 2 ? 'bg-accent-blue/20 text-accent-blue' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            XYZ Long / B Short
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-bg-border">
              <th className="text-left py-2 px-2 text-gray-500 font-medium">Window</th>
              {COLUMNS.map(col => (
                <th
                  key={col.key}
                  className="text-right py-2 px-2 text-gray-500 font-medium cursor-pointer hover:text-gray-300 transition-colors"
                  onClick={() => handleSort(col.key)}
                >
                  <span className="flex items-center justify-end gap-1">
                    {col.label}
                    {sortCol === col.key && (
                      <span className="text-accent-blue">{sortAsc ? '↑' : '↓'}</span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.window} className="border-b border-bg-border/50 hover:bg-bg-border/30 transition-colors">
                <td className="py-2 px-2 font-mono text-gray-300 font-medium">{row.window}</td>
                {COLUMNS.map(col => (
                  <td
                    key={col.key}
                    className={`py-2 px-2 text-right font-mono ${cellColor(col.key, row[col.key]) || 'text-gray-300'}`}
                  >
                    {formatVal(col.key, row[col.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
