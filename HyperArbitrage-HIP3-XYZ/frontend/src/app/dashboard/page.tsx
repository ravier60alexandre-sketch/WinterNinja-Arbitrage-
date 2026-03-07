"use client";

import { useBotStore } from "@/store/botStore";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useBots } from "@/hooks/useBotData";
import BotCard from "@/components/bot/BotCard";
import ConnectionStatus from "@/components/shared/ConnectionStatus";

export default function DashboardPage() {
  const bots = useBotStore((s) => s.bots);
  useBots();
  useWebSocket();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-text-primary">
          Bot Dashboard
        </h1>
        <ConnectionStatus />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
        {bots.map((bot) => (
          <BotCard key={bot.id} bot={bot} pnl={null} trades={0} />
        ))}
      </div>

      {bots.length === 0 && (
        <div className="flex h-64 items-center justify-center rounded-xl border border-bg-border bg-bg-surface">
          <p className="text-text-secondary">
            No bots configured. Check backend connection.
          </p>
        </div>
      )}
    </div>
  );
}
