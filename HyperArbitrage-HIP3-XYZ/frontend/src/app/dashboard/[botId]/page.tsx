"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { useWebSocket } from "@/hooks/useWebSocket";
import { fetchBot, fetchTrades } from "@/lib/api";
import type { Bot, Trade } from "@/lib/types";
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
  const [pnlData, setPnlData] = useState<Array<{ time: string; pnl: number }>>([]);

  useWebSocket();

  const loadBot = useCallback(async () => {
    const data = await fetchBot(botId);
    setBot(data);
  }, [botId]);

  const loadPnlData = useCallback(async () => {
    const data = await fetchTrades(botId, 1, 200);
    let cumulative = 0;
    const points = data.trades
      .filter((t) => t.net_pnl !== null)
      .reverse()
      .map((t) => {
        cumulative += parseFloat(t.net_pnl!);
        return { time: t.exit_time || t.entry_time, pnl: cumulative };
      });
    setPnlData(points);
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

  if (!bot) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent-indigo border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">
            {bot.name}
          </h1>
          <p className="text-sm text-text-secondary">
            {bot.pair_a} / {bot.pair_b} &mdash;{" "}
            {bot.direction === "long_a_short_b"
              ? `Long ${bot.pair_a} / Short ${bot.pair_b}`
              : `Short ${bot.pair_a} / Long ${bot.pair_b}`}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <ExportButton botId={botId} />
          <ConnectionStatus />
        </div>
      </div>

      <BotControls botId={botId} state={bot.state} />

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
        <BotConfig botId={botId} config={bot.config} />
      </div>
    </div>
  );
}
