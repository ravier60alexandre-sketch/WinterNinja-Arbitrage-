'use client';

import { useState, useMemo } from 'react';

export default function EntryCalculator({ stats, defaultFee, defaultSlippage }) {
  const [buffer, setBuffer] = useState(0);
  const [slippage, setSlippage] = useState(defaultSlippage || 1.0);
  const [takerFee, setTakerFee] = useState(defaultFee || 1.5);
  const [percentile, setPercentile] = useState(0.75);

  const feeRT = takerFee * 2;
  const edgeMin = buffer + slippage;

  const thresholds = useMemo(() => {
    const result = {};

    for (const [window, windowStats] of Object.entries(stats || {})) {
      if (!windowStats) continue;
      for (const dir of ['direction_1', 'direction_2']) {
        const s = windowStats[dir];
        if (!s || s.p50 === null) continue;

        // Interpolate percentile value from available p10/p50/p90
        let pValue;
        if (percentile <= 0.10) {
          pValue = s.p10;
        } else if (percentile <= 0.50) {
          pValue = s.p10 != null ? s.p10 + (s.p50 - s.p10) * ((percentile - 0.10) / 0.40) : s.p50;
        } else if (percentile <= 0.90) {
          pValue = s.p50 + ((s.p90 ?? s.p50) - s.p50) * ((percentile - 0.50) / 0.40);
        } else {
          pValue = s.p90;
        }

        if (pValue == null) continue;

        // Entry threshold = P_selected + edge_min (buffer + slippage)
        const entryThreshold = pValue + edgeMin;

        if (!result[window]) result[window] = {};
        result[window][dir] = {
          pValue: Math.round(pValue * 100) / 100,
          entryThreshold: Math.round(entryThreshold * 100) / 100,
          feeRT: Math.round(feeRT * 100) / 100,
          edgeMin: Math.round(edgeMin * 100) / 100,
          edgeFreq: s.edge_freq,
        };
      }
    }

    return result;
  }, [stats, percentile, edgeMin, feeRT]);

  const pButtons = [
    { label: 'P50', value: 0.50 },
    { label: 'P60', value: 0.60 },
    { label: 'P70', value: 0.70 },
    { label: 'P75', value: 0.75 },
    { label: 'P80', value: 0.80 },
    { label: 'P85', value: 0.85 },
    { label: 'P90', value: 0.90 },
  ];

  // Show 24h stats by default, fallback to first available window
  const displayWindow = thresholds['24h'] ? '24h' : Object.keys(thresholds)[0];
  const displayData = displayWindow ? thresholds[displayWindow] : null;

  return (
    <div className="bg-bg-card border border-bg-border rounded-xl p-4">
      <h3 className="text-sm font-semibold text-gray-300 mb-4">Entry Threshold Calculator</h3>

      {/* Percentile selector */}
      <div className="mb-4">
        <div className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold mb-2">Percentile</div>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          {pButtons.map(p => (
            <button
              key={p.value}
              onClick={() => setPercentile(p.value)}
              className={`px-2.5 py-1 text-[10px] font-semibold rounded-md transition-all ${
                percentile === p.value
                  ? 'bg-accent-blue text-white'
                  : 'bg-bg-primary text-gray-500 border border-bg-border hover:text-gray-300'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500">P:</span>
          <input
            type="range"
            min="10"
            max="95"
            step="1"
            value={percentile * 100}
            onChange={e => setPercentile(parseInt(e.target.value) / 100)}
            className="flex-1 h-1.5 rounded-full appearance-none bg-bg-border accent-accent-blue"
          />
          <span className="text-[10px] font-mono text-gray-200 min-w-[36px] text-right">
            {(percentile * 100).toFixed(0)}
          </span>
        </div>
      </div>

      {/* Parameters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div>
          <label className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-gray-400">Taker Fee (bps/leg)</span>
            <span className="text-[10px] font-mono text-accent-blue">{takerFee.toFixed(1)}</span>
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
          <label className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-gray-400">Buffer (bps)</span>
            <span className="text-[10px] font-mono text-accent-blue">{buffer.toFixed(1)}</span>
          </label>
          <input
            type="range"
            min="0"
            max="10"
            step="0.1"
            value={buffer}
            onChange={(e) => setBuffer(parseFloat(e.target.value))}
            className="w-full h-1.5 bg-bg-primary rounded-full appearance-none cursor-pointer accent-accent-blue"
          />
        </div>
        <div>
          <label className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-gray-400">Slippage (bps)</span>
            <span className="text-[10px] font-mono text-accent-blue">{slippage.toFixed(1)}</span>
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

      {/* Summary formula */}
      <div className="flex items-center justify-center gap-3 mb-4 py-2 bg-bg-primary rounded-lg border border-bg-border">
        <span className="text-[10px] text-gray-500">Entry =</span>
        <span className="font-mono text-sm text-accent-blue font-semibold">P{(percentile * 100).toFixed(0)}</span>
        <span className="text-[10px] text-gray-500">+</span>
        <span className="font-mono text-sm text-accent-amber font-semibold">{edgeMin.toFixed(1)} bps</span>
        <span className="text-[10px] text-gray-600">(buf {buffer.toFixed(1)} + slip {slippage.toFixed(1)})</span>
        <span className="text-[10px] text-gray-600 ml-3">|</span>
        <span className="text-[10px] text-gray-500 ml-3">Fee RT =</span>
        <span className="font-mono text-sm text-accent-amber font-semibold">{feeRT.toFixed(1)} bps</span>
      </div>

      {/* Results per direction */}
      {displayData ? (
        <div className="space-y-3">
          {Object.entries(displayData).map(([dir, t]) => (
            <div key={dir} className="bg-bg-primary rounded-lg p-3 border border-bg-border">
              <p className="text-[10px] text-gray-500 mb-2 uppercase tracking-wider font-semibold">
                {dir === 'direction_1' ? 'XYZ Short / B Long' : 'XYZ Long / B Short'}
              </p>
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <span className="text-[10px] text-gray-600 block">P{(percentile * 100).toFixed(0)} Value</span>
                  <span className="font-mono text-lg text-accent-blue font-semibold">{t.pValue} <span className="text-xs text-gray-500">bps</span></span>
                </div>
                <div>
                  <span className="text-[10px] text-gray-600 block">Edge Min</span>
                  <span className="font-mono text-lg text-accent-amber font-semibold">{t.edgeMin} <span className="text-xs text-gray-500">bps</span></span>
                </div>
                <div>
                  <span className="text-[10px] text-accent-green block font-semibold">Entry Threshold</span>
                  <span className="font-mono text-lg text-accent-green font-bold">{t.entryThreshold} <span className="text-xs text-gray-500">bps</span></span>
                </div>
                <div>
                  <span className="text-[10px] text-gray-600 block">Fee RT</span>
                  <span className="font-mono text-lg text-gray-300 font-semibold">{t.feeRT} <span className="text-xs text-gray-500">bps</span></span>
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
        <p className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold mb-1">Formulas</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-0.5 text-[10px] text-gray-500">
          <div><span className="text-accent-green font-medium">Entry</span> — P_selected + buffer + slippage. Spread must exceed this to open.</div>
          <div><span className="text-accent-amber font-medium">Fee RT</span> — Taker fee x 2 legs. Total round-trip cost.</div>
          <div><span className="text-gray-300 font-medium">Close</span> — PnL &gt; fee RT + buffer. Closes progressively as liquidity allows.</div>
          <div><span className="text-gray-300 font-medium">Size</span> — Same size on both legs, no rounding.</div>
        </div>
      </div>
    </div>
  );
}
