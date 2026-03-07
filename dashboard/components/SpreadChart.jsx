'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Area, ComposedChart, Legend
} from 'recharts';

const TIME_WINDOWS = [
  { label: '1h', value: '1h', key: '1' },
  { label: '6h', value: '6h', key: '2' },
  { label: '12h', value: '12h', key: '3' },
  { label: '24h', value: '24h', key: '4' },
  { label: '7d', value: '7d', key: '5' }
];

const COMPARE_COLORS = ['#00d4aa', '#3b82f6', '#f59e0b', '#ff4757', '#a855f7'];

function formatTime(timestamp) {
  const d = new Date(timestamp);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="bg-bg-card border border-bg-border rounded-lg p-3 shadow-xl">
      <p className="text-xs text-gray-400 font-mono mb-2">{new Date(label).toLocaleString()}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-gray-400">{entry.name}:</span>
          <span className="font-mono font-medium text-white">{entry.value?.toFixed(2)} bps</span>
        </div>
      ))}
    </div>
  );
}

export default function SpreadChart({
  historyData,
  feeThreshold,
  selectedWindow,
  onWindowChange,
  compareMode,
  comparePairs,
  compareData,
  stats
}) {
  const chartData = useMemo(() => {
    if (compareMode && compareData) {
      const timeMap = new Map();
      for (const [pairKey, data] of Object.entries(compareData)) {
        for (const row of (data || [])) {
          const ts = row.timestamp;
          if (!timeMap.has(ts)) timeMap.set(ts, { timestamp: ts });
          timeMap.get(ts)[`${pairKey}_d1`] = row.spread_1_bps;
          timeMap.get(ts)[`${pairKey}_d2`] = row.spread_2_bps;
        }
      }
      return Array.from(timeMap.values()).sort((a, b) => a.timestamp - b.timestamp);
    }

    if (!historyData || historyData.length === 0) return [];
    return historyData.map(row => ({
      timestamp: row.timestamp,
      spread_1: row.spread_1_bps,
      spread_2: row.spread_2_bps,
      exec_1: row.exec_size_1,
      exec_2: row.exec_size_2
    }));
  }, [historyData, compareMode, compareData]);

  // Get MR entry zones from stats
  const mrZones = useMemo(() => {
    if (!stats) return null;
    // Use the matching window stats, fallback to 24h
    const windowStats = stats[selectedWindow] || stats['24h'];
    if (!windowStats) return null;

    const d1 = windowStats.direction_1;
    const d2 = windowStats.direction_2;
    return {
      d1_median: d1 ? d1.p50 : null,
      d1_above: d1 ? d1.mr_entry_above : null,
      d1_below: d1 ? d1.mr_entry_below : null,
      d2_median: d2 ? d2.p50 : null,
      d2_above: d2 ? d2.mr_entry_above : null,
      d2_below: d2 ? d2.mr_entry_below : null
    };
  }, [stats, selectedWindow]);

  const handleExportCSV = useCallback(() => {
    if (!chartData.length) return;
    const headers = Object.keys(chartData[0]).join(',');
    const rows = chartData.map(row => Object.values(row).join(','));
    const csv = [headers, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `spread_data_${selectedWindow}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [chartData, selectedWindow]);

  const [showMRZones, setShowMRZones] = useState(true);

  return (
    <div className="bg-bg-card border border-bg-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-gray-300">
            {compareMode ? 'Multi-Pair Spread Comparison' : 'Real-Time Spread'}
          </h3>
          {!compareMode && (
            <button
              onClick={() => setShowMRZones(!showMRZones)}
              className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
                showMRZones
                  ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                  : 'text-gray-500 border border-bg-border hover:text-gray-300'
              }`}
            >
              MR Zones
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-bg-primary rounded-lg p-0.5">
            {TIME_WINDOWS.map(w => (
              <button
                key={w.value}
                onClick={() => onWindowChange(w.value)}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${
                  selectedWindow === w.value
                    ? 'bg-accent-blue text-white'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>
          <button
            onClick={handleExportCSV}
            className="px-2 py-1 text-xs text-gray-500 hover:text-gray-300 border border-bg-border rounded transition-colors"
            title="Export CSV"
          >
            CSV
          </button>
        </div>
      </div>

      <div className="h-[350px]">
        {chartData.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            Waiting for data...
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
              <XAxis
                dataKey="timestamp"
                tickFormatter={formatTime}
                stroke="#4a4a5a"
                tick={{ fontSize: 10, fill: '#6b7280' }}
                type="number"
                domain={['dataMin', 'dataMax']}
                scale="time"
              />
              <YAxis
                stroke="#4a4a5a"
                tick={{ fontSize: 10, fill: '#6b7280' }}
                tickFormatter={v => `${v.toFixed(1)}`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: '11px', color: '#9ca3af' }}
              />

              {/* Fee threshold line */}
              <ReferenceLine
                y={feeThreshold}
                stroke="#f59e0b"
                strokeDasharray="6 4"
                label={{ value: `Fee: ${feeThreshold} bps`, position: 'right', fill: '#f59e0b', fontSize: 10 }}
              />
              <ReferenceLine y={0} stroke="#4a4a5a" />

              {/* MR zones for Direction 1 */}
              {!compareMode && showMRZones && mrZones && mrZones.d1_median !== null && (
                <>
                  <ReferenceLine
                    y={mrZones.d1_median}
                    stroke="#00d4aa"
                    strokeDasharray="3 3"
                    strokeOpacity={0.5}
                    label={{ value: `D1 Med: ${mrZones.d1_median}`, position: 'insideTopLeft', fill: '#00d4aa', fontSize: 9 }}
                  />
                  <ReferenceLine
                    y={mrZones.d1_above}
                    stroke="#a855f7"
                    strokeDasharray="4 4"
                    strokeOpacity={0.6}
                    label={{ value: `D1 MR↑: ${mrZones.d1_above}`, position: 'insideTopLeft', fill: '#a855f7', fontSize: 9 }}
                  />
                  <ReferenceLine
                    y={mrZones.d1_below}
                    stroke="#a855f7"
                    strokeDasharray="4 4"
                    strokeOpacity={0.6}
                    label={{ value: `D1 MR↓: ${mrZones.d1_below}`, position: 'insideBottomLeft', fill: '#a855f7', fontSize: 9 }}
                  />
                </>
              )}

              {/* MR zones for Direction 2 */}
              {!compareMode && showMRZones && mrZones && mrZones.d2_median !== null && (
                <>
                  <ReferenceLine
                    y={mrZones.d2_median}
                    stroke="#3b82f6"
                    strokeDasharray="3 3"
                    strokeOpacity={0.5}
                    label={{ value: `D2 Med: ${mrZones.d2_median}`, position: 'insideBottomRight', fill: '#3b82f6', fontSize: 9 }}
                  />
                  <ReferenceLine
                    y={mrZones.d2_above}
                    stroke="#a855f7"
                    strokeDasharray="4 4"
                    strokeOpacity={0.4}
                    label={{ value: `D2 MR↑: ${mrZones.d2_above}`, position: 'insideTopRight', fill: '#a855f7', fontSize: 9 }}
                  />
                  <ReferenceLine
                    y={mrZones.d2_below}
                    stroke="#a855f7"
                    strokeDasharray="4 4"
                    strokeOpacity={0.4}
                    label={{ value: `D2 MR↓: ${mrZones.d2_below}`, position: 'insideBottomRight', fill: '#a855f7', fontSize: 9 }}
                  />
                </>
              )}

              {compareMode && comparePairs ? (
                comparePairs.map((pair, i) => {
                  const key = `${pair.asset_a}|${pair.asset_b}`;
                  const deployer = pair.asset_b.split(':')[0].toUpperCase();
                  return (
                    <Line
                      key={key}
                      type="monotone"
                      dataKey={`${key}_d1`}
                      name={`vs ${deployer}`}
                      stroke={COMPARE_COLORS[i % COMPARE_COLORS.length]}
                      dot={false}
                      strokeWidth={1.5}
                      connectNulls
                    />
                  );
                })
              ) : (
                <>
                  <Line
                    type="monotone"
                    dataKey="spread_1"
                    name="A Short / B Long"
                    stroke="#00d4aa"
                    dot={false}
                    strokeWidth={1.5}
                  />
                  <Line
                    type="monotone"
                    dataKey="spread_2"
                    name="A Long / B Short"
                    stroke="#3b82f6"
                    dot={false}
                    strokeWidth={1.5}
                  />
                </>
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
