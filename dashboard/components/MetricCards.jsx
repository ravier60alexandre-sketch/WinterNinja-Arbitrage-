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

export default function MetricCards({ spreadData, stats, feeThreshold }) {
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
  const edgeFreq = stats24h && stats24h.direction_1 ? stats24h.direction_1.edge_freq : null;
  const recEntry = stats24h && stats24h.direction_1
    ? (stats24h.direction_1.p50 !== null ? (stats24h.direction_1.p50 + feeThreshold).toFixed(2) : null)
    : null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      <MetricCard
        title="Spread · XYZ Short / B Long"
        value={s1 !== undefined ? s1.toFixed(2) : null}
        suffix="bps"
        color={s1Color}
        subtitle="Direction 1"
      />
      <MetricCard
        title="Exec Size · Dir 1"
        value={spreadData.exec_size_1 !== undefined ? spreadData.exec_size_1.toFixed(1) : null}
        suffix="units"
        color="text-white"
      />
      <MetricCard
        title="Spread · XYZ Long / B Short"
        value={s2 !== undefined ? s2.toFixed(2) : null}
        suffix="bps"
        color={s2Color}
        subtitle="Direction 2"
      />
      <MetricCard
        title="Exec Size · Dir 2"
        value={spreadData.exec_size_2 !== undefined ? spreadData.exec_size_2.toFixed(1) : null}
        suffix="units"
        color="text-white"
      />
      <MetricCard
        title="Rec. Entry Threshold"
        value={recEntry}
        suffix="bps"
        color="text-accent-blue"
        subtitle="24h p50 + fees"
      />
      <MetricCard
        title="Edge Frequency (24h)"
        value={edgeFreq !== null ? (edgeFreq * 100).toFixed(1) : null}
        suffix="%"
        color={edgeFreq > 0.20 ? 'text-accent-green' : 'text-accent-amber'}
      >
        {edgeFreq !== null && (
          <div className="w-full h-1.5 bg-bg-primary rounded-full mt-1 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                edgeFreq > 0.20 ? 'bg-accent-green' : 'bg-accent-amber'
              }`}
              style={{ width: `${Math.min(edgeFreq * 100, 100)}%` }}
            />
          </div>
        )}
      </MetricCard>
    </div>
  );
}
