"use client";

import { useState } from "react";
import { useBotStore } from "@/store/botStore";
import { cn } from "@/lib/formatters";
import BotCard from "@/components/bot/BotCard";
import BotManagementPanel from "@/components/bot/BotManagementPanel";
import ConnectionStatus from "@/components/shared/ConnectionStatus";

type Tab = "overview" | "bot";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "bot", label: "Bot" },
];

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const bots = useBotStore((s) => s.bots);

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

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-bg-surface border border-bg-border rounded-xl p-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all",
              activeTab === tab.id
                ? "bg-accent-indigo text-white shadow-sm"
                : "text-text-secondary hover:text-text-primary hover:bg-bg-border/50"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "overview" && (
        <>
          {/* XYZ Short section */}
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

          {/* XYZ Long section */}
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
        </>
      )}

      {activeTab === "bot" && <BotManagementPanel />}
    </div>
  );
}
