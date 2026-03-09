"use client";

import { useState } from "react";
import { useBotStore } from "@/store/botStore";
import { useAggregatedMetrics } from "@/hooks/useMetrics";
import { cn, formatUSD, formatPercent, pnlColor } from "@/lib/formatters";
import BotCard from "@/components/bot/BotCard";
import BotManagementPanel from "@/components/bot/BotManagementPanel";
import ConnectionStatus from "@/components/shared/ConnectionStatus";
import WalletOverview from "@/components/dashboard/WalletOverview";
import ActivePositions from "@/components/dashboard/ActivePositions";
import RecentTrades from "@/components/dashboard/RecentTrades";

type Tab = "overview" | "bot";

const TABS: Array<{ id: Tab; label: string; icon: string }> = [
  { id: "overview", label: "Overview", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
  { id: "bot", label: "Bots", icon: "M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" },
];

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const bots = useBotStore((s) => s.bots);
  const { data: aggregated } = useAggregatedMetrics();

  const shortBots = bots.filter((b) => b.direction === "long_a_short_b");
  const longBots = bots.filter((b) => b.direction === "short_a_long_b");
  const connectedCount = bots.filter((b) => b.connected).length;
  const runningCount = bots.filter((b) => b.state === "RUNNING").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">6-Bot Deployer Router</h1>
          <p className="text-xs text-text-secondary mt-1">
            {connectedCount}/6 connected &middot; {runningCount} running
          </p>
        </div>
        <ConnectionStatus />
      </div>

      {/* Global Summary Bar */}
      {aggregated && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <SummaryCard label="Total PnL" value={formatUSD(aggregated.total_pnl)} color={pnlColor(aggregated.total_pnl)} />
          <SummaryCard label="Total Volume" value={formatUSD(aggregated.total_volume)} color="text-accent-cyan" />
          <SummaryCard label="Win Rate" value={formatPercent(aggregated.win_rate)} color={aggregated.win_rate > 50 ? "text-accent-green" : "text-accent-red"} />
          <SummaryCard label="Total Trades" value={aggregated.total_trades.toString()} />
          <SummaryCard label="Total Fees" value={formatUSD(aggregated.total_fees)} color="text-accent-amber" />
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-bg-surface border border-bg-border rounded-xl p-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all",
              activeTab === tab.id
                ? "bg-accent-indigo text-white shadow-sm"
                : "text-text-secondary hover:text-text-primary hover:bg-bg-border/50"
            )}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
            </svg>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Wallet Balances */}
          <WalletOverview />

          {/* Active Positions */}
          <ActivePositions />

          {/* Bot Grid */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="px-2.5 py-1 bg-accent-red/10 border border-accent-red/20 rounded text-xs font-bold text-accent-red">
                XYZ Short
              </span>
              <span className="text-xs text-text-secondary">Long A / Short B — 3 deployers</span>
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {shortBots.map((bot) => (
                <BotCard key={bot.id} bot={bot} />
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="px-2.5 py-1 bg-accent-green/10 border border-accent-green/20 rounded text-xs font-bold text-accent-green">
                XYZ Long
              </span>
              <span className="text-xs text-text-secondary">Short A / Long B — 3 deployers</span>
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {longBots.map((bot) => (
                <BotCard key={bot.id} bot={bot} />
              ))}
            </div>
          </div>

          {/* Recent Trades */}
          <RecentTrades />
        </div>
      )}

      {activeTab === "bot" && <BotManagementPanel />}
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-bg-surface border border-bg-border rounded-xl p-3">
      <p className="text-[9px] text-text-secondary uppercase tracking-wider mb-1">{label}</p>
      <p className={cn("font-mono text-lg font-semibold", color || "text-text-primary")}>{value}</p>
    </div>
  );
}
