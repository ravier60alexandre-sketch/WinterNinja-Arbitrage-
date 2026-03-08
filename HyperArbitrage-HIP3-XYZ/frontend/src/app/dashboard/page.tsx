"use client";

import { useState } from "react";
import { useBotStore } from "@/store/botStore";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useBots } from "@/hooks/useBotData";
import BotCard from "@/components/bot/BotCard";
import SetupBotForm from "@/components/bot/SetupBotForm";
import ConnectionStatus from "@/components/shared/ConnectionStatus";

export default function DashboardPage() {
  const bots = useBotStore((s) => s.bots);
  const [showSetup, setShowSetup] = useState(false);
  useBots();
  useWebSocket();

  const hasBots = bots.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-text-primary">
          Bot Dashboard
        </h1>
        <div className="flex items-center gap-3">
          {hasBots && !showSetup && (
            <button
              onClick={() => setShowSetup(true)}
              className="px-4 py-2 bg-accent-indigo text-white text-xs font-semibold rounded-lg hover:bg-accent-indigo/80 transition-colors"
            >
              + New Bot
            </button>
          )}
          <ConnectionStatus />
        </div>
      </div>

      {showSetup && (
        <SetupBotForm
          onSuccess={() => setShowSetup(false)}
          onCancel={() => setShowSetup(false)}
        />
      )}

      {hasBots && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
          {bots.map((bot) => (
            <BotCard key={bot.id} bot={bot} pnl={null} trades={0} />
          ))}
        </div>
      )}

      {!hasBots && !showSetup && (
        <div className="flex flex-col items-center justify-center h-96 rounded-xl border border-bg-border bg-bg-surface">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-accent-indigo/10 border border-accent-indigo/20 flex items-center justify-center">
              <svg className="w-7 h-7 text-accent-indigo" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-text-primary mb-1">No bots deployed yet</h3>
              <p className="text-xs text-text-secondary max-w-sm">
                Connect your Hyperliquid API key and deploy your first arbitrage bot to get started.
              </p>
            </div>
            <button
              onClick={() => setShowSetup(true)}
              className="px-6 py-2.5 bg-accent-indigo text-white text-sm font-semibold rounded-lg hover:bg-accent-indigo/80 transition-colors"
            >
              Deploy First Bot
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
