"use client";

import { useWalletBalances } from "@/hooks/useMetrics";
import { cn, formatUSD, pnlColor } from "@/lib/formatters";

export default function WalletOverview() {
  const { data, isLoading, isError } = useWalletBalances();

  if (isLoading) {
    return (
      <div className="rounded-xl border border-bg-border bg-bg-surface p-4">
        <h2 className="text-sm font-semibold text-text-primary mb-3">Wallet Balances</h2>
        <div className="flex items-center justify-center h-20">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent-indigo border-t-transparent" />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-xl border border-bg-border bg-bg-surface p-4">
        <h2 className="text-sm font-semibold text-text-primary mb-3">Wallet Balances</h2>
        <p className="text-xs text-text-secondary">Unable to load wallet data</p>
      </div>
    );
  }

  const wallets = data.wallets;

  // Aggregate totals
  const totalValue = wallets.reduce((sum, w) => sum + (parseFloat(w.account_value || "0") || 0), 0);
  const totalUsd = wallets.reduce((sum, w) => sum + (parseFloat(w.total_raw_usd || "0") || 0), 0);
  const totalMargin = wallets.reduce((sum, w) => sum + (parseFloat(w.total_margin_used || "0") || 0), 0);

  return (
    <div className="rounded-xl border border-bg-border bg-bg-surface p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-text-primary">Wallet Balances</h2>
        <div className="flex items-center gap-4 text-[10px] text-text-secondary">
          <span>Total Value: <span className="font-mono font-semibold text-accent-cyan">{formatUSD(totalValue)}</span></span>
          <span>USDC: <span className="font-mono font-semibold text-accent-green">{formatUSD(totalUsd)}</span></span>
          <span>Margin Used: <span className="font-mono font-semibold text-accent-amber">{formatUSD(totalMargin)}</span></span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {wallets.map((w) => {
          const posCount = w.exchange_positions.length;
          const totalUnrealizedPnl = w.exchange_positions.reduce(
            (sum, p) => sum + (parseFloat(p.unrealized_pnl || "0") || 0), 0
          );

          return (
            <div key={w.bot_id} className="bg-bg-primary border border-bg-border rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-text-primary">{w.bot_name}</span>
                <span className="text-[10px] font-mono text-text-secondary">
                  {w.address.slice(0, 6)}...{w.address.slice(-4)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-2">
                <div>
                  <p className="text-[9px] text-text-secondary uppercase tracking-wider">Account Value</p>
                  <p className="font-mono text-sm font-semibold text-accent-cyan">
                    {formatUSD(w.account_value)}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] text-text-secondary uppercase tracking-wider">Free USDC</p>
                  <p className="font-mono text-sm font-semibold text-accent-green">
                    {formatUSD(w.withdrawable)}
                  </p>
                </div>
              </div>

              {posCount > 0 && (
                <div className="border-t border-bg-border pt-2 mt-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] text-text-secondary uppercase tracking-wider">
                      {posCount} Position{posCount > 1 ? "s" : ""}
                    </span>
                    <span className={cn("text-[10px] font-mono font-semibold", pnlColor(totalUnrealizedPnl))}>
                      uPnL: {formatUSD(totalUnrealizedPnl)}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {w.exchange_positions.map((p, i) => (
                      <div key={i} className="flex items-center justify-between text-[10px]">
                        <span className="font-mono text-text-primary">{p.coin}</span>
                        <span className="font-mono text-text-secondary">{p.size}</span>
                        <span className={cn("font-mono", pnlColor(p.unrealized_pnl))}>
                          {formatUSD(p.unrealized_pnl)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {posCount === 0 && (
                <p className="text-[10px] text-text-secondary/50 mt-1">No open positions</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
