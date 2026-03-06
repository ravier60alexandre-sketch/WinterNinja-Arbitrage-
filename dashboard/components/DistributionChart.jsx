'use client';

import { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend
} from 'recharts';

const WINDOWS = ['1h', '6h', '12h', '24h', '7d'];

function buildHistogram(values, bins = 40) {
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
    const count = values.filter(v => v >= lo && (i === bins - 1 ? v <= hi : v < hi)).length;
    histogram.push({
      bin: center.toFixed(1),
      center,
      count
    });
  }

  return histogram;
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="bg-bg-card border border-bg-border rounded-lg p-2 shadow-xl">
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-gray-400">{entry.payload.bin} bps:</span>
          <span className="font-mono text-white">{entry.value} obs</span>
        </div>
      ))}
    </div>
  );
}

export default function DistributionChart({ historyData, feeThreshold, stats }) {
  const [window, setWindow] = useState('1h');
  const [showDir, setShowDir] = useState('both');

  const { histogram1, histogram2, p10, p50, p90 } = useMemo(() => {
    const data = historyData || [];
    const d1 = data.map(r => r.spread_1_bps).filter(v => v !== null && v !== undefined);
    const d2 = data.map(r => r.spread_2_bps).filter(v => v !== null && v !== undefined);

    const winStats = stats && stats[window];
    const s1 = winStats && winStats.direction_1;

    return {
      histogram1: buildHistogram(d1),
      histogram2: buildHistogram(d2),
      p10: s1 ? s1.p10 : null,
      p50: s1 ? s1.p50 : null,
      p90: s1 ? s1.p90 : null
    };
  }, [historyData, stats, window]);

  const activeData = showDir === 'd2' ? histogram2 : histogram1;

  // Merge for overlay
  const overlayData = useMemo(() => {
    if (showDir !== 'both') return activeData;
    const map = new Map();
    for (const d of histogram1) {
      map.set(d.bin, { bin: d.bin, center: d.center, dir1: d.count, dir2: 0 });
    }
    for (const d of histogram2) {
      if (map.has(d.bin)) {
        map.get(d.bin).dir2 = d.count;
      } else {
        map.set(d.bin, { bin: d.bin, center: d.center, dir1: 0, dir2: d.count });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.center - b.center);
  }, [histogram1, histogram2, activeData, showDir]);

  return (
    <div className="bg-bg-card border border-bg-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-300">Spread Distribution</h3>
        <div className="flex items-center gap-2">
          <div className="flex bg-bg-primary rounded-lg p-0.5">
            {['both', 'd1', 'd2'].map(d => (
              <button
                key={d}
                onClick={() => setShowDir(d)}
                className={`px-2 py-1 text-[10px] rounded-md transition-colors ${
                  showDir === d ? 'bg-accent-blue text-white' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {d === 'both' ? 'Overlay' : d === 'd1' ? 'Dir 1' : 'Dir 2'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="h-[250px]">
        {overlayData.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            Waiting for data...
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={overlayData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
              <XAxis
                dataKey="bin"
                stroke="#4a4a5a"
                tick={{ fontSize: 9, fill: '#6b7280' }}
              />
              <YAxis
                stroke="#4a4a5a"
                tick={{ fontSize: 10, fill: '#6b7280' }}
              />
              <Tooltip content={<CustomTooltip />} />

              {feeThreshold !== null && (
                <ReferenceLine
                  x={feeThreshold.toFixed(1)}
                  stroke="#f59e0b"
                  strokeDasharray="6 4"
                  label={{ value: 'Fee', position: 'top', fill: '#f59e0b', fontSize: 9 }}
                />
              )}

              {showDir === 'both' ? (
                <>
                  <Bar dataKey="dir1" name="XYZ Short / B Long" fill="#00d4aa" opacity={0.7} />
                  <Bar dataKey="dir2" name="XYZ Long / B Short" fill="#3b82f6" opacity={0.7} />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                </>
              ) : (
                <Bar
                  dataKey="count"
                  name={showDir === 'd1' ? 'XYZ Short / B Long' : 'XYZ Long / B Short'}
                  fill={showDir === 'd1' ? '#00d4aa' : '#3b82f6'}
                  opacity={0.8}
                />
              )}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
