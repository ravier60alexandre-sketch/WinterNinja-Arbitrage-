"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { useWebSocket } from "@/hooks/useWebSocket";
import { fetchBot, fetchTrades } from "@/lib/api";
import { useBotStore } from "@/store/botStore";
import type { Bot } from "@/lib/types";
import MetricsGrid from "@/components/bot/MetricsGrid";
import SpreadChart from "@/components/bot/SpreadChart";
import PnlChart from "@/components/bot/PnlChart";
import TradeHistory from "@/components/bot/TradeHistory";
import BotControls from "@/components/bot/BotControls";
import BotConfig from "@/components/bot/BotConfig";
import ConnectionStatus from "@/components/shared/ConnectionStatus";
import ExportButton from "@/components/shared/ExportButton";

export default function BotDetailPage() {
  const params = useParams();
  const botId = Number(params.botId);
  const [bot, setBot] = useState<Bot | null>(null);
  const [pnlData, setPnlData] = useState<Array<{ timestamp: number; cumulative_pnl: number }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const localBot = useBotStore((s) => s.getBotById(botId));

  useWebSocket(botId);

  const loadBot = useCallback(async () => {
    try {
      const data = await fetchBot(botId);
      setBot(data);
      setError(null);
    } catch (err: any) {
      if (!bot) {
        setError(err.message || "Failed to load bot");
      }
    } finally {
      setLoading(false);
    }
  }, [botId, bot]);

  const loadPnlData = useCallback(async () => {
    try {
      const data = await fetchTrades(botId, 1, 200);
      let cumulative = 0;
      const points = data.trades
        .filter((t) => t.net_pnl !== null)
        .reverse()
        .map((t) => {
          cumulative += parseFloat(t.net_pnl!);
          return { timestamp: new Date(t.exit_time || t.entry_time).getTime(), cumulative_pnl: cumulative };
        });
      setPnlData(points);
    } catch {
      // PnL data loading failed silently
    }
  }, [botId]);

  useEffect(() => {
    loadBot();
    loadPnlData();
    const interval = setInterval(() => {
      loadBot();
      loadPnlData();
    }, 10000);
    return () => clearInterval(interval);
  }, [loadBot, loadPnlData]);

  if (loading && !bot && !localBot) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent-indigo border-t-transparent" />
      </div>
    );
  }

  const displayName = bot?.name || localBot?.name || `Bot ${botId}`;
  const displayState = bot?.state || localBot?.state || "IDLE";
  const displayConfig = bot?.config || null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">
            {displayName}
          </h1>
          <p className="text-sm text-text-secondary">
            {bot ? (
              <>
                {bot.pair_a} / {bot.pair_b} &mdash;{" "}
                {bot.direction === "long_a_short_b"
                  ? `Long ${bot.pair_a} / Short ${bot.pair_b}`
                  : `Short ${bot.pair_a} / Long ${bot.pair_b}`}
              </>
            ) : localBot ? (
              <>vs {localBot.deployer} &mdash; {localBot.directionLabel}</>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <ExportButton botId={botId} />
          <ConnectionStatus />
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-accent-amber/30 bg-accent-amber/10 p-4">
          <p className="text-sm text-accent-amber">Backend unreachable</p>
          <p className="text-xs text-text-secondary mt-1">Start the backend server to enable full features.</p>
        </div>
      )}

      <BotControls botId={botId} state={displayState} />

      <MetricsGrid botId={botId} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="rounded-xl border border-bg-border bg-bg-surface p-4">
          <h2 className="mb-4 text-lg font-medium">Spread &amp; Edge</h2>
          <SpreadChart botId={botId} />
        </div>
        <div className="rounded-xl border border-bg-border bg-bg-surface p-4">
          <h2 className="mb-4 text-lg font-medium">Cumulative PnL</h2>
          <PnlChart data={pnlData} />
        </div>
      </div>

      <div className="rounded-xl border border-bg-border bg-bg-surface p-4">
        <h2 className="mb-4 text-lg font-medium">Trade History</h2>
        <TradeHistory botId={botId} />
      </div>

      <div className="rounded-xl border border-bg-border bg-bg-surface p-4">
        <h2 className="mb-4 text-lg font-medium">Configuration</h2>
        <BotConfig botId={botId} config={displayConfig} />
      </div>
    </div>
  );
}
