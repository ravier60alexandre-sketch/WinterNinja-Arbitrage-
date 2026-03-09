"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/formatters";
import { API_URL } from "@/lib/constants";

interface TradeEntry {
  id: number;
  bot_id: number;
  bot_name: string;
  pair_a: string;
  pair_b: string;
  direction: string;
  side_a: string;
  side_b: string;
  size: string;
  entry_price_a: string;
  entry_price_b: string;
  exit_price_a?: string;
  exit_price_b?: string;
  entry_spread_bps?: number;
  edge_at_entry_bps?: number;
  net_pnl?: string;
  close_reason?: string;
  status: string;
  opened_at: string;
  closed_at?: string;
}

export default function LiveTradeFeed() {
  const [trades, setTrades] = useState<TradeEntry[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchTrades = () => {
      fetch(`${API_URL}/api/v1/wallet/recent-trades?limit=50`)
        .then((r) => r.json())
        .then((data) => {
          if (data.trades) setTrades(data.trades);
          else if (Array.isArray(data)) setTrades(data);
        })
        .catch(() => {});
    };
    fetchTrades();
    const interval = setInterval(fetchTrades, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (scrollRef.current && !collapsed) {
      scrollRef.current.scrollTop = 0;
    }
  }, [trades, collapsed]);

  const formatTime = (iso: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
  };

  const pnlValue = (pnl: string | undefined) => {
    if (!pnl) return 0;
    return parseFloat(pnl);
  };

  return (
    <div className="bg-bg-surface border border-bg-border rounded-xl overflow-hidden">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-bg-border/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-accent-green animate-pulse" />
          <span className="text-xs font-bold text-text-primary uppercase">Live Trade Feed</span>
          <span className="text-[10px] text-text-secondary">({trades.length} trades)</span>
        </div>
        <span className="text-text-secondary text-xs">{collapsed ? "Show" : "Hide"}</span>
      </button>

      {!collapsed && (
        <div
          ref={scrollRef}
          className="border-t border-bg-border bg-bg-primary max-h-[300px] overflow-y-auto font-mono text-[11px]"
        >
          {trades.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-500">
              No trades yet. Start a bot to see activity here.
              <br />
              <span className="text-[10px] text-gray-600 mt-1 block">
                Trades will appear in real-time as bots execute arbitrage
              </span>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-[10px] text-gray-500 uppercase border-b border-bg-border/50">
                  <th className="text-left px-3 py-1.5">Time</th>
                  <th className="text-left px-2 py-1.5">Bot</th>
                  <th className="text-left px-2 py-1.5">Pair</th>
                  <th className="text-left px-2 py-1.5">Dir</th>
                  <th className="text-right px-2 py-1.5">Size</th>
                  <th className="text-right px-2 py-1.5">Entry A</th>
                  <th className="text-right px-2 py-1.5">Entry B</th>
                  <th className="text-right px-2 py-1.5">Edge</th>
                  <th className="text-right px-2 py-1.5">PnL</th>
                  <th className="text-center px-2 py-1.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((trade, i) => {
                  const pnl = pnlValue(trade.net_pnl);
                  return (
                    <tr
                      key={trade.id || i}
                      className={cn(
                        "border-b border-bg-border/30 hover:bg-bg-border/20",
                        trade.status === "open" && "bg-accent-green/5",
                        pnl < 0 && trade.status !== "open" && "bg-accent-red/5"
                      )}
                    >
                      <td className="px-3 py-1.5 text-gray-500">
                        {formatTime(trade.closed_at || trade.opened_at)}
                      </td>
                      <td className="px-2 py-1.5 text-text-primary">
                        {trade.bot_name || `Bot#${trade.bot_id}`}
                      </td>
                      <td className="px-2 py-1.5 text-gray-300">
                        {trade.pair_a?.split(":")[1]}/{trade.pair_b?.split(":")[0]?.toUpperCase()}
                      </td>
                      <td className="px-2 py-1.5">
                        <span className={cn(
                          "text-[10px] px-1 py-0.5 rounded",
                          trade.direction === "long_a_short_b" ? "bg-accent-green/20 text-accent-green" : "bg-accent-red/20 text-accent-red"
                        )}>
                          {trade.side_a?.toUpperCase() || (trade.direction === "long_a_short_b" ? "LONG" : "SHORT")}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-right text-gray-300">
                        {trade.size ? parseFloat(trade.size).toFixed(2) : "--"}
                      </td>
                      <td className="px-2 py-1.5 text-right text-gray-300">
                        {trade.entry_price_a ? parseFloat(trade.entry_price_a).toFixed(4) : "--"}
                      </td>
                      <td className="px-2 py-1.5 text-right text-gray-300">
                        {trade.entry_price_b ? parseFloat(trade.entry_price_b).toFixed(4) : "--"}
                      </td>
                      <td className="px-2 py-1.5 text-right text-accent-green">
                        {trade.edge_at_entry_bps != null ? `${trade.edge_at_entry_bps.toFixed(1)}` : "--"}
                      </td>
                      <td className={cn(
                        "px-2 py-1.5 text-right font-semibold",
                        trade.status === "open" ? "text-gray-400" : pnl > 0 ? "text-accent-green" : pnl < 0 ? "text-accent-red" : "text-gray-400"
                      )}>
                        {trade.status === "open" ? "..." : trade.net_pnl ? `$${pnl.toFixed(4)}` : "--"}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <span className={cn(
                          "text-[9px] px-1.5 py-0.5 rounded font-semibold",
                          trade.status === "open" ? "bg-accent-green/20 text-accent-green" : "bg-gray-700 text-gray-400"
                        )}>
                          {trade.status === "open" ? "OPEN" : trade.close_reason || "CLOSED"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
