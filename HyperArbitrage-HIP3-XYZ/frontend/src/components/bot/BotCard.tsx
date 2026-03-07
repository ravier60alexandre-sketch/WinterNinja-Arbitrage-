"use client";

import Link from "next/link";
import { BOT_STATE_BG, BOT_STATE_COLORS } from "@/lib/constants";
import { cn, formatUSD, pnlColor } from "@/lib/formatters";
import type { Bot } from "@/lib/types";

interface BotCardProps {
  bot: Bot;
  pnl?: string;
  trades?: number;
}

export default function BotCard({ bot, pnl, trades }: BotCardProps) {
  const dir = bot.direction === "long_a_short_b" ? "Long" : "Short";

  return (
    <Link href={`/dashboard/${bot.id}`}>
      <div className="bg-bg-surface border border-bg-border rounded-xl p-4 hover:border-accent-indigo/50 transition-colors cursor-pointer">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-text-primary">{bot.name}</h3>
          <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-medium border", BOT_STATE_BG[bot.state], BOT_STATE_COLORS[bot.state])}>
            {bot.state}
          </span>
        </div>

        <div className="text-xs text-text-secondary mb-3">
          {dir} {bot.pair_a} / {bot.pair_b}
        </div>

        <div className="flex justify-between text-xs">
          <div>
            <span className="text-text-secondary">PnL: </span>
            <span className={cn("font-mono", pnlColor(pnl))}>{pnl ? formatUSD(pnl) : "—"}</span>
          </div>
          <div>
            <span className="text-text-secondary">Trades: </span>
            <span className="font-mono text-text-primary">{trades ?? "—"}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
