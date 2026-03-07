'use client';

function MetricCard({ title, value, suffix, color, subtitle, children }) {
  return (
    <div className="bg-bg-card border border-bg-border rounded-xl p-4 flex flex-col gap-1">
      <span className="text-xs text-gray-500 uppercase tracking-wider font-medium">{title}</span>
      <div className="flex items-baseline gap-1">
        <span className={`text-2xl font-semibold font-mono ${color || 'text-white'}`}>
          {value !== null && value !== undefined ? value : '—'}
        </span>
        {suffix && <span className="text-xs text-gray-500 font-mono">{suffix}</span>}
      </div>
      {subtitle && <span className="text-xs text-gray-500">{subtitle}</span>}
      {children}
    </div>
  );
}

export default function MetricCards({ spreadData, stats, feeThreshold, bestOpportunity }) {
  if (!spreadData) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <MetricCard key={i} title="—" value="—" />
        ))}
      </div>
    );
  }

  const s1 = spreadData.spread_1_bps;
  const s2 = spreadData.spread_2_bps;
  const s1Color = s1 > feeThreshold ? 'text-accent-green' : s1 < 0 ? 'text-accent-red' : 'text-white';
  const s2Color = s2 > feeThreshold ? 'text-accent-green' : s2 < 0 ? 'text-accent-red' : 'text-white';

  const stats24h = stats && stats['24h'];
  const d1Stats = stats24h && stats24h.direction_1;
  const d2Stats = stats24h && stats24h.direction_2;

  // Edge frequencies
  const edgeFreq1 = d1Stats ? d1Stats.edge_freq : null;
  const edgeFreq2 = d2Stats ? d2Stats.edge_freq : null;
  const mrEdgeFreq1 = d1Stats ? d1Stats.mr_edge_freq : null;
  const mrEdgeFreq2 = d2Stats ? d2Stats.mr_edge_freq : null;

  // Amplitude
  const amplitude1 = d1Stats ? d1Stats.amplitude : null;
  const amplitude2 = d2Stats ? d2Stats.amplitude : null;
  const bestAmplitude = Math.max(amplitude1 || 0, amplitude2 || 0);

  // MR entry zones
  const d1MRAbove = d1Stats ? d1Stats.mr_entry_above : null;
  const d1MRBelow = d1Stats ? d1Stats.mr_entry_below : null;
  const d2MRAbove = d2Stats ? d2Stats.mr_entry_above : null;
  const d2MRBelow = d2Stats ? d2Stats.mr_entry_below : null;

  // Check if current spread is in MR zone
  const d1InMRZone = d1MRAbove !== null && (s1 > d1MRAbove || s1 < d1MRBelow);
  const d2InMRZone = d2MRAbove !== null && (s2 > d2MRAbove || s2 < d2MRBelow);

  // Best edge across directions and strategies
  const bestEdge = Math.max(edgeFreq1 || 0, edgeFreq2 || 0, mrEdgeFreq1 || 0, mrEdgeFreq2 || 0);

  return (
    <div className="space-y-3">
      {/* Main metrics row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard
          title="Spread · A Short / B Long"
          value={s1 !== undefined ? s1.toFixed(2) : null}
          suffix="bps"
          color={s1Color}
          subtitle="Direction 1"
        >
          {d1InMRZone && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 font-medium mt-1 inline-block">
              MR SIGNAL
            </span>
          )}
        </MetricCard>

        <MetricCard
          title="Exec Size · Dir 1"
          value={spreadData.exec_size_1 !== undefined ? spreadData.exec_size_1.toFixed(1) : null}
          suffix="units"
          color="text-white"
        />

        <MetricCard
          title="Spread · A Long / B Short"
          value={s2 !== undefined ? s2.toFixed(2) : null}
          suffix="bps"
          color={s2Color}
          subtitle="Direction 2"
        >
          {d2InMRZone && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 font-medium mt-1 inline-block">
              MR SIGNAL
            </span>
          )}
        </MetricCard>

        <MetricCard
          title="Exec Size · Dir 2"
          value={spreadData.exec_size_2 !== undefined ? spreadData.exec_size_2.toFixed(1) : null}
          suffix="units"
          color="text-white"
        />

        <MetricCard
          title="Amplitude (24h)"
          value={bestAmplitude > 0 ? bestAmplitude.toFixed(2) : null}
          suffix="bps"
          color={bestAmplitude > feeThreshold * 2 ? 'text-purple-400' : 'text-gray-400'}
          subtitle="P90 − P10 range"
        >
          {bestAmplitude > feeThreshold * 2 && (
            <span className="text-[10px] text-purple-400">MR profitable</span>
          )}
        </MetricCard>

        <MetricCard
          title="Best Edge (24h)"
          value={bestEdge > 0 ? (bestEdge * 100).toFixed(1) : null}
          suffix="%"
          color={bestEdge > 0.20 ? 'text-accent-green' : 'text-accent-amber'}
        >
          {bestOpportunity && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
              bestOpportunity.type === 'directional'
                ? 'bg-accent-green/20 text-accent-green'
                : 'bg-purple-500/20 text-purple-400'
            }`}>
              {bestOpportunity.type === 'directional' ? 'DIR' : 'MR'}{' '}
              {bestOpportunity.direction === 'direction_1' ? 'D1' : 'D2'}
            </span>
          )}
          {bestEdge > 0 && (
            <div className="w-full h-1.5 bg-bg-primary rounded-full mt-1 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  bestEdge > 0.20 ? 'bg-accent-green' : 'bg-accent-amber'
                }`}
                style={{ width: `${Math.min(bestEdge * 100, 100)}%` }}
              />
            </div>
          )}
        </MetricCard>
      </div>

      {/* MR Entry Zones for both directions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Direction 1 */}
        <div className="bg-bg-card border border-bg-border rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500 uppercase tracking-wider font-medium">Dir 1 · A Short / B Long</span>
            <div className="flex gap-2">
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-green/10 text-accent-green">
                DIR: {edgeFreq1 !== null ? (edgeFreq1 * 100).toFixed(1) : '—'}%
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400">
                MR: {mrEdgeFreq1 !== null ? (mrEdgeFreq1 * 100).toFixed(1) : '—'}%
              </span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <span className="text-[10px] text-gray-500 block">MR Short Above</span>
              <p className="font-mono text-sm text-accent-green">{d1MRAbove !== null ? d1MRAbove.toFixed(2) : '—'} <span className="text-[10px] text-gray-500">bps</span></p>
            </div>
            <div>
              <span className="text-[10px] text-gray-500 block">Median</span>
              <p className="font-mono text-sm text-white">{d1Stats && d1Stats.p50 !== null ? d1Stats.p50.toFixed(2) : '—'} <span className="text-[10px] text-gray-500">bps</span></p>
            </div>
            <div>
              <span className="text-[10px] text-gray-500 block">MR Long Below</span>
              <p className="font-mono text-sm text-accent-red">{d1MRBelow !== null ? d1MRBelow.toFixed(2) : '—'} <span className="text-[10px] text-gray-500">bps</span></p>
            </div>
          </div>
        </div>

        {/* Direction 2 */}
        <div className="bg-bg-card border border-bg-border rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500 uppercase tracking-wider font-medium">Dir 2 · A Long / B Short</span>
            <div className="flex gap-2">
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-green/10 text-accent-green">
                DIR: {edgeFreq2 !== null ? (edgeFreq2 * 100).toFixed(1) : '—'}%
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400">
                MR: {mrEdgeFreq2 !== null ? (mrEdgeFreq2 * 100).toFixed(1) : '—'}%
              </span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <span className="text-[10px] text-gray-500 block">MR Short Above</span>
              <p className="font-mono text-sm text-accent-green">{d2MRAbove !== null ? d2MRAbove.toFixed(2) : '—'} <span className="text-[10px] text-gray-500">bps</span></p>
            </div>
            <div>
              <span className="text-[10px] text-gray-500 block">Median</span>
              <p className="font-mono text-sm text-white">{d2Stats && d2Stats.p50 !== null ? d2Stats.p50.toFixed(2) : '—'} <span className="text-[10px] text-gray-500">bps</span></p>
            </div>
            <div>
              <span className="text-[10px] text-gray-500 block">MR Long Below</span>
              <p className="font-mono text-sm text-accent-red">{d2MRBelow !== null ? d2MRBelow.toFixed(2) : '—'} <span className="text-[10px] text-gray-500">bps</span></p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
