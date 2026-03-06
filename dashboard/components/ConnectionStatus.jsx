'use client';

export default function ConnectionStatus({ connected, lastUpdate }) {
  const timeSince = lastUpdate ? Math.round((Date.now() - lastUpdate) / 100) / 10 : null;

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        <div
          className={`w-2.5 h-2.5 rounded-full ${
            connected
              ? 'bg-accent-green animate-pulse-green'
              : 'bg-accent-red animate-pulse-red'
          }`}
        />
        <span className="text-sm text-gray-400">
          {connected ? 'Connected' : 'Disconnected'}
        </span>
      </div>
      {timeSince !== null && (
        <span className="text-xs text-gray-500 font-mono">
          Updated {timeSince}s ago
        </span>
      )}
    </div>
  );
}
