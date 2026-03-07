'use client';

import { useState, useMemo } from 'react';

export default function EntryCalculator({ stats, defaultFee, defaultSlippage }) {
  const [takerFee, setTakerFee] = useState(defaultFee || 1.5);
  const [slippage, setSlippage] = useState(defaultSlippage || 1.0);

  const totalFee = takerFee * 2 + slippage;

  const thresholds = useMemo(() => {
    const s24 = stats && stats['24h'];
    const result = {};

    for (const dir of ['direction_1', 'direction_2']) {
      const s = s24 && s24[dir];
      if (s && s.p50 !== null) {
        result[dir] = {
          aggressive: Math.round((s.p10 + totalFee) * 100) / 100,
          standard: Math.round((s.p50 + totalFee) * 100) / 100,
          conservative: Math.round(s.p90 * 100) / 100
        };

        // Edge frequency at each threshold
        // We approximate using the stats
        result[dir].aggressiveEdge = s.edge_freq !== null
          ? Math.min(s.edge_freq * 1.5, 1.0).toFixed(1)
          : '—';
        result[dir].standardEdge = s.edge_freq !== null
          ? (s.edge_freq * 1.0).toFixed(1)
          : '—';
        result[dir].conservativeEdge = s.edge_freq !== null
          ? Math.max(s.edge_freq * 0.5, 0).toFixed(1)
          : '—';
      }
    }

    return result;
  }, [stats, totalFee]);

  return (
    <div className="bg-bg-card border border-bg-border rounded-xl p-4">
      <h3 className="text-sm font-semibold text-gray-300 mb-4">Entry Threshold Calculator</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div>
          <label className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-400">Taker Fee (bps/leg)</span>
            <span className="text-xs font-mono text-accent-blue">{takerFee.toFixed(1)}</span>
          </label>
          <input
            type="range"
            min="0"
            max="5"
            step="0.1"
            value={takerFee}
            onChange={(e) => setTakerFee(parseFloat(e.target.value))}
            className="w-full h-1.5 bg-bg-primary rounded-full appearance-none cursor-pointer accent-accent-blue"
          />
        </div>
        <div>
          <label className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-400">Slippage Buffer (bps)</span>
            <span className="text-xs font-mono text-accent-blue">{slippage.toFixed(1)}</span>
          </label>
          <input
            type="range"
            min="0"
            max="5"
            step="0.1"
            value={slippage}
            onChange={(e) => setSlippage(parseFloat(e.target.value))}
            className="w-full h-1.5 bg-bg-primary rounded-full appearance-none cursor-pointer accent-accent-blue"
          />
        </div>
      </div>

      <div className="text-center mb-4">
        <span className="text-xs text-gray-500">Total Round-Trip Cost: </span>
        <span className="font-mono text-sm text-accent-amber font-semibold">{totalFee.toFixed(1)} bps</span>
      </div>

      {Object.entries(thresholds).length > 0 ? (
        <div className="space-y-4">
          {Object.entries(thresholds).map(([dir, t]) => (
            <div key={dir}>
              <p className="text-xs text-gray-500 mb-2">
                {dir === 'direction_1' ? 'XYZ Short / B Long' : 'XYZ Long / B Short'}
              </p>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-bg-primary rounded-lg p-3 border border-accent-green/20">
                  <span className="text-[10px] text-accent-green uppercase tracking-wider font-medium">Aggressive</span>
                  <p className="font-mono text-lg text-white font-semibold mt-1">{t.aggressive} <span className="text-xs text-gray-500">bps</span></p>
                  <p className="text-[10px] text-gray-500 mt-1">~{t.aggressiveEdge}% edge</p>
                </div>
                <div className="bg-bg-primary rounded-lg p-3 border border-accent-blue/20">
                  <span className="text-[10px] text-accent-blue uppercase tracking-wider font-medium">Standard</span>
                  <p className="font-mono text-lg text-white font-semibold mt-1">{t.standard} <span className="text-xs text-gray-500">bps</span></p>
                  <p className="text-[10px] text-gray-500 mt-1">~{t.standardEdge}% edge</p>
                </div>
                <div className="bg-bg-primary rounded-lg p-3 border border-accent-amber/20">
                  <span className="text-[10px] text-accent-amber uppercase tracking-wider font-medium">Conservative</span>
                  <p className="font-mono text-lg text-white font-semibold mt-1">{t.conservative} <span className="text-xs text-gray-500">bps</span></p>
                  <p className="text-[10px] text-gray-500 mt-1">~{t.conservativeEdge}% edge</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-4 text-gray-500 text-sm">
          Collecting data for threshold calculations...
        </div>
      )}

      {/* Legend */}
      <div className="mt-4 pt-3 border-t border-bg-border/50">
        <p className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold mb-1">Calculator Legend</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-0.5 text-[10px] text-gray-500">
          <div><span className="text-gray-300 font-medium">Taker Fee</span> — Fee per leg in bps. HiP-3 taker fee ~ 1.5 bps/leg.</div>
          <div><span className="text-gray-300 font-medium">Slippage Buffer</span> — Extra margin (bps) for execution slippage.</div>
          <div><span className="text-accent-amber font-medium">Round-Trip Cost</span> — Total cost = (taker fee x 2 legs) + slippage. Spread must exceed this to profit.</div>
          <div><span className="text-accent-green font-medium">Aggressive</span> — Entry at P10 + fees. More trades, lower edge per trade.</div>
          <div><span className="text-accent-blue font-medium">Standard</span> — Entry at P50 + fees. Balanced frequency vs edge.</div>
          <div><span className="text-accent-amber font-medium">Conservative</span> — Entry at P90. Fewer trades, highest edge per trade.</div>
        </div>
      </div>
    </div>
  );
}
