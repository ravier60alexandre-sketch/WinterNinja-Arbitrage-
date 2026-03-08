"use client";

import { useBotStore } from "@/store/botStore";
import BotCard from "@/components/bot/BotCard";
import ConnectionStatus from "@/components/shared/ConnectionStatus";

export default function DashboardPage() {
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
    </div>
  );
}
