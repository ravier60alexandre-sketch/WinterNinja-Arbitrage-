'use client';

import Link from 'next/link';

const STATE_COLORS = {
  running: { bg: 'bg-accent-green/20', text: 'text-accent-green', border: 'border-accent-green/30', dot: 'bg-accent-green' },
  paused:  { bg: 'bg-accent-amber/20', text: 'text-accent-amber', border: 'border-accent-amber/30', dot: 'bg-accent-amber' },
  stopped: { bg: 'bg-gray-500/20', text: 'text-gray-400', border: 'border-gray-500/30', dot: 'bg-gray-500' },
  error:   { bg: 'bg-accent-red/20', text: 'text-accent-red', border: 'border-accent-red/30', dot: 'bg-accent-red' },
};

export default function BotCard({ bot, onStart, onStop, onPause }) {
  const colors = STATE_COLORS[bot.state] || STATE_COLORS.stopped;
  const pnl = bot.metrics?.total_pnl || 0;
  const trades = bot.metrics?.total_trades || 0;
  const winRate = bot.metrics?.win_rate || 0;
  const isPositive = pnl >= 0;

  return (
    <div className="bg-bg-card border border-bg-border rounded-lg p-4 hover:border-accent-blue/30 transition-all group">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <Link href={`/bots/${bot.id}`} className="text-sm font-semibold text-white group-hover:text-accent-blue transition-colors truncate">
          #{bot.id} {bot.name}
        </Link>
        <span className={`px-2 py-0.5 text-[10px] font-mono uppercase rounded ${colors.bg} ${colors.text} border ${colors.border}`}>
          <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${colors.dot} ${bot.state === 'running' ? 'animate-pulse' : ''}`} />
          {bot.state}
        </span>
      </div>

      {/* Pair info */}
      <div className="text-xs text-gray-500 mb-3 font-mono">
        <span className="text-accent-blue">{bot.pair_a}</span>
        <span className="mx-1">⇄</span>
        <span className="text-accent-amber">{bot.pair_b}</span>
      </div>

      {/* Strategy */}
      <div className="text-[10px] text-gray-600 mb-3">
        {bot.strategy} · Entry: {bot.entry_threshold_bps} bps · Size: ${bot.position_size}
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="text-center">
          <div className={`text-sm font-mono font-semibold ${isPositive ? 'text-accent-green' : 'text-accent-red'}`}>
            {isPositive ? '+' : ''}{pnl.toFixed(2)}
          </div>
          <div className="text-[10px] text-gray-600">P&L ($)</div>
        </div>
        <div className="text-center">
          <div className="text-sm font-mono font-semibold text-white">{trades}</div>
          <div className="text-[10px] text-gray-600">Trades</div>
        </div>
        <div className="text-center">
          <div className={`text-sm font-mono font-semibold ${winRate >= 50 ? 'text-accent-green' : 'text-accent-red'}`}>
            {winRate.toFixed(0)}%
          </div>
          <div className="text-[10px] text-gray-600">Win Rate</div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex gap-2 pt-2 border-t border-bg-border">
        {bot.state === 'stopped' || bot.state === 'error' ? (
          <button
            onClick={() => onStart(bot.id)}
            className="flex-1 px-2 py-1.5 text-xs bg-accent-green/20 text-accent-green border border-accent-green/30 rounded hover:bg-accent-green/30 transition-colors"
          >
            Start
          </button>
        ) : bot.state === 'running' ? (
          <>
            <button
              onClick={() => onPause(bot.id)}
              className="flex-1 px-2 py-1.5 text-xs bg-accent-amber/20 text-accent-amber border border-accent-amber/30 rounded hover:bg-accent-amber/30 transition-colors"
            >
              Pause
            </button>
            <button
              onClick={() => onStop(bot.id)}
              className="flex-1 px-2 py-1.5 text-xs bg-accent-red/20 text-accent-red border border-accent-red/30 rounded hover:bg-accent-red/30 transition-colors"
            >
              Stop
            </button>
          </>
        ) : bot.state === 'paused' ? (
          <>
            <button
              onClick={() => onStart(bot.id)}
              className="flex-1 px-2 py-1.5 text-xs bg-accent-green/20 text-accent-green border border-accent-green/30 rounded hover:bg-accent-green/30 transition-colors"
            >
              Resume
            </button>
            <button
              onClick={() => onStop(bot.id)}
              className="flex-1 px-2 py-1.5 text-xs bg-accent-red/20 text-accent-red border border-accent-red/30 rounded hover:bg-accent-red/30 transition-colors"
            >
              Stop
            </button>
          </>
        ) : null}
        <Link
          href={`/bots/${bot.id}`}
          className="px-3 py-1.5 text-xs text-gray-500 border border-bg-border rounded hover:text-gray-300 hover:border-accent-blue/30 transition-colors"
        >
          Details
        </Link>
      </div>
    </div>
  );
}
