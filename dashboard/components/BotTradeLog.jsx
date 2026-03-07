'use client';

export default function BotTradeLog({ trades }) {
  if (!trades || trades.length === 0) {
    return (
      <div className="bg-bg-card border border-bg-border rounded-lg p-6 text-center text-gray-600 text-sm">
        No trades yet
      </div>
    );
  }

  return (
    <div className="bg-bg-card border border-bg-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-bg-border">
        <h3 className="text-sm font-semibold text-gray-300">Trade History</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-600 border-b border-bg-border">
              <th className="px-4 py-2 text-left font-medium">Time</th>
              <th className="px-4 py-2 text-left font-medium">Side</th>
              <th className="px-4 py-2 text-right font-medium">Spread (bps)</th>
              <th className="px-4 py-2 text-right font-medium">Size ($)</th>
              <th className="px-4 py-2 text-right font-medium">P&L ($)</th>
              <th className="px-4 py-2 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((trade, i) => {
              const isPositive = (trade.pnl || 0) >= 0;
              return (
                <tr key={i} className="border-b border-bg-border/50 hover:bg-bg-primary/50">
                  <td className="px-4 py-2 font-mono text-gray-400">
                    {new Date(trade.timestamp).toLocaleString()}
                  </td>
                  <td className="px-4 py-2">
                    <span className={trade.side === 'long_a_short_b' ? 'text-accent-green' : 'text-accent-red'}>
                      {trade.side === 'long_a_short_b' ? 'Long A / Short B' : 'Short A / Long B'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-white">{trade.entry_spread?.toFixed(2)}</td>
                  <td className="px-4 py-2 text-right font-mono text-gray-300">{trade.size?.toFixed(2)}</td>
                  <td className={`px-4 py-2 text-right font-mono font-semibold ${isPositive ? 'text-accent-green' : 'text-accent-red'}`}>
                    {isPositive ? '+' : ''}{(trade.pnl || 0).toFixed(2)}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                      trade.status === 'closed' ? 'bg-gray-500/20 text-gray-400' :
                      trade.status === 'open' ? 'bg-accent-blue/20 text-accent-blue' :
                      'bg-accent-amber/20 text-accent-amber'
                    }`}>
                      {trade.status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
