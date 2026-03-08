"use client";

import { useState } from "react";
import Link from "next/link";
import { useBotStore, type BotSlot } from "@/store/botStore";
import { useBotAction, useBotConfigUpdate } from "@/hooks/useBotData";
import { useBotMetrics } from "@/hooks/useMetrics";
import { BOT_STATE_BG, BOT_STATE_COLORS, PERCENTILE_OPTIONS } from "@/lib/constants";
import { cn, formatUSD, formatPercent, pnlColor } from "@/lib/formatters";
import type { BotAction, BotConfig } from "@/lib/types";
import SetupBotForm from "./SetupBotForm";

/* ── Single Bot Row with controls, metrics, config ─────────── */

function BotRow({ bot }: { bot: BotSlot }) {
  const [expanded, setExpanded] = useState(false);
  const [confirmAction, setConfirmAction] = useState<BotAction | null>(null);

  const updateBotState = useBotStore((s) => s.updateBotState);
  const connectBot = useBotStore((s) => s.connectBot);
  const disconnectBot = useBotStore((s) => s.disconnectBot);

  const { data: metrics } = useBotMetrics(bot.id);

  /* Connect form state */
  const [showConnect, setShowConnect] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [wallet, setWallet] = useState("");
  const [subAccount, setSubAccount] = useState("");

  const handleConnect = () => {
    if (!apiKey.trim() || !wallet.trim()) return;
    connectBot(bot.id, apiKey.trim(), wallet.trim(), subAccount.trim());
    setShowConnect(false);
    setApiKey("");
    setWallet("");
    setSubAccount("");
  };

  /* Bot actions */
  const handleAction = async (action: BotAction) => {
    if (action === "liquidate" || action === "reset") {
      setConfirmAction(action);
      return;
    }
    executeAction(action);
  };

  const executeAction = async (action: BotAction) => {
    const stateMap: Record<BotAction, string> = {
      start: "CONNECTING",
      stop: "STOPPED",
      liquidate: "LIQUIDATING",
      reset: "IDLE",
    };
    updateBotState(bot.id, stateMap[action] as any);
    try {
      const { botAction: apiBotAction } = await import("@/lib/api");
      await apiBotAction(bot.id, action);
      if (action === "start") updateBotState(bot.id, "RUNNING");
    } catch {
      // keep state as-is
    }
    setConfirmAction(null);
  };

  const dirColor = bot.direction === "long_a_short_b" ? "text-accent-red" : "text-accent-green";
  const dirBg = bot.direction === "long_a_short_b"
    ? "bg-accent-red/10 border-accent-red/20"
    : "bg-accent-green/10 border-accent-green/20";

  const actionButtons: Array<{ action: BotAction; label: string; color: string; enabled: boolean }> = [
    { action: "start", label: "START", color: "bg-accent-green hover:bg-accent-green/80", enabled: bot.connected && bot.state !== "RUNNING" && bot.state !== "CONNECTING" },
    { action: "stop", label: "STOP", color: "bg-accent-red hover:bg-accent-red/80", enabled: bot.state === "RUNNING" || bot.state === "PAUSED" },
    { action: "liquidate", label: "LIQUIDATE", color: "bg-orange-500 hover:bg-orange-500/80", enabled: bot.state === "RUNNING" },
    { action: "reset", label: "RESET", color: "bg-text-secondary hover:bg-text-secondary/80", enabled: bot.state === "PAUSED" || bot.state === "STOPPED" || bot.state === "IDLE" },
  ];

  return (
    <div className="bg-bg-surface border border-bg-border rounded-xl overflow-hidden">
      {/* Header Row - always visible */}
      <div
        className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-bg-border/20 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold border", dirBg, dirColor)}>
            {bot.directionLabel}
          </span>
          <span className="text-sm font-bold text-text-primary">{bot.name}</span>
          <span className="text-xs text-text-secondary">vs {bot.deployer}</span>
        </div>

        <div className="flex items-center gap-3">
          {/* Quick metrics */}
          {metrics && (
            <div className="hidden md:flex items-center gap-4 mr-4">
              <span className="text-[10px] text-text-secondary">
                PnL: <span className={cn("font-mono font-semibold", pnlColor(metrics.net_pnl))}>{formatUSD(metrics.net_pnl)}</span>
              </span>
              <span className="text-[10px] text-text-secondary">
                Win: <span className="font-mono font-semibold text-text-primary">{formatPercent(metrics.win_rate)}</span>
              </span>
              <span className="text-[10px] text-text-secondary">
                Trades: <span className="font-mono font-semibold text-text-primary">{metrics.total_trades}</span>
              </span>
            </div>
          )}

          {/* Connection indicator */}
          {bot.connected ? (
            <span className="w-2 h-2 rounded-full bg-accent-green" title="Connected" />
          ) : (
            <span className="w-2 h-2 rounded-full bg-text-secondary/30" title="Disconnected" />
          )}

          {/* State badge */}
          <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-medium border", BOT_STATE_BG[bot.state], BOT_STATE_COLORS[bot.state])}>
            {bot.state}
            {(bot.state === "CONNECTING" || bot.state === "LIQUIDATING") && (
              <span className="ml-1 inline-block animate-spin">&#9696;</span>
            )}
          </span>

          {/* Expand arrow */}
          <svg
            className={cn("w-4 h-4 text-text-secondary transition-transform", expanded && "rotate-180")}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div className="border-t border-bg-border p-4 space-y-4">
          {/* Not connected - show connect form */}
          {!bot.connected && !showConnect && (
            <div className="text-center py-4">
              <p className="text-xs text-text-secondary mb-3">This bot is not connected. Connect your API key to enable it.</p>
              <button
                onClick={(e) => { e.stopPropagation(); setShowConnect(true); }}
                className="px-5 py-2 bg-accent-indigo text-white text-xs font-semibold rounded-lg hover:bg-accent-indigo/80 transition-colors"
              >
                Connect API Key
              </button>
            </div>
          )}

          {!bot.connected && showConnect && (
            <div className="max-w-md mx-auto space-y-3">
              <div>
                <label className="block text-[10px] text-text-secondary mb-1">API Key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Your Hyperliquid API key"
                  className="w-full bg-bg-primary border border-bg-border rounded-lg px-3 py-2 text-xs text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:border-accent-indigo/50 font-mono"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              <div>
                <label className="block text-[10px] text-text-secondary mb-1">Wallet Address</label>
                <input
                  type="text"
                  value={wallet}
                  onChange={(e) => setWallet(e.target.value)}
                  placeholder="0x..."
                  className="w-full bg-bg-primary border border-bg-border rounded-lg px-3 py-2 text-xs text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:border-accent-indigo/50 font-mono"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              <div>
                <label className="block text-[10px] text-text-secondary mb-1">Sub-Account <span className="text-text-secondary/40">(optional)</span></label>
                <input
                  type="text"
                  value={subAccount}
                  onChange={(e) => setSubAccount(e.target.value)}
                  placeholder="0x... or leave empty"
                  className="w-full bg-bg-primary border border-bg-border rounded-lg px-3 py-2 text-xs text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:border-accent-indigo/50 font-mono"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); handleConnect(); }}
                  disabled={!apiKey.trim() || !wallet.trim()}
                  className="flex-1 px-3 py-2 bg-accent-green text-white text-xs font-semibold rounded-lg disabled:opacity-30 disabled:cursor-not-allowed hover:bg-accent-green/80 transition-colors"
                >
                  Connect
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setShowConnect(false); }}
                  className="px-3 py-2 border border-bg-border text-text-secondary text-xs rounded-lg hover:text-text-primary transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Connected - show controls + config */}
          {bot.connected && (
            <>
              {/* Connection info */}
              <div className="flex items-center gap-6 text-[10px]">
                <span className="text-text-secondary">
                  Wallet: <span className="font-mono text-text-primary">
                    {bot.walletAddress ? `${bot.walletAddress.slice(0, 6)}...${bot.walletAddress.slice(-4)}` : "—"}
                  </span>
                </span>
                {bot.subAccountAddress && (
                  <span className="text-text-secondary">
                    Sub: <span className="font-mono text-text-primary">
                      {bot.subAccountAddress.slice(0, 6)}...{bot.subAccountAddress.slice(-4)}
                    </span>
                  </span>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 flex-wrap">
                {actionButtons.map(({ action, label, color, enabled }) => (
                  <button
                    key={action}
                    onClick={(e) => { e.stopPropagation(); handleAction(action); }}
                    disabled={!enabled}
                    className={cn(
                      "px-4 py-2 rounded-lg text-xs font-semibold text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed",
                      color
                    )}
                  >
                    {label}
                  </button>
                ))}

                <div className="flex-1" />

                <button
                  onClick={(e) => { e.stopPropagation(); disconnectBot(bot.id); }}
                  className="px-3 py-2 border border-bg-border text-text-secondary text-xs rounded-lg hover:text-accent-red hover:border-accent-red/30 transition-colors"
                >
                  Disconnect
                </button>

                <Link
                  href={`/dashboard/${bot.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="px-3 py-2 bg-accent-indigo/20 text-accent-indigo text-xs font-semibold rounded-lg hover:bg-accent-indigo/30 transition-colors"
                >
                  View Details
                </Link>
              </div>

              {/* Confirm dialog */}
              {confirmAction && (
                <div className="bg-accent-red/10 border border-accent-red/30 rounded-lg p-4">
                  <p className="text-sm text-text-primary mb-3">
                    Confirm <strong className="text-accent-red">{confirmAction.toUpperCase()}</strong>?
                    {confirmAction === "liquidate" && " This will close all positions."}
                    {confirmAction === "reset" && " This will reset all stats."}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); executeAction(confirmAction); }}
                      className="px-4 py-1.5 bg-accent-red text-white rounded-lg text-xs font-semibold"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmAction(null); }}
                      className="px-4 py-1.5 border border-bg-border text-text-secondary rounded-lg text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Metrics summary */}
              {metrics && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                  <MetricCard label="Net PnL" value={formatUSD(metrics.net_pnl)} color={pnlColor(metrics.net_pnl)} />
                  <MetricCard label="Volume 24h" value={formatUSD(metrics.total_volume)} />
                  <MetricCard label="Win Rate" value={formatPercent(metrics.win_rate)} color={metrics.win_rate > 50 ? "text-accent-green" : "text-accent-red"} />
                  <MetricCard label="Total Trades" value={metrics.total_trades.toString()} />
                  <MetricCard label="Fees Paid" value={formatUSD(metrics.total_fees_paid)} color="text-accent-amber" />
                  <MetricCard label="Funding" value={formatUSD(metrics.total_funding)} color={pnlColor(metrics.total_funding)} />
                  <MetricCard label="Max Drawdown" value={formatUSD(metrics.max_drawdown)} color="text-accent-red" />
                  <MetricCard label="Win Trades" value={metrics.winning_trades.toString()} color="text-accent-green" />
                  <MetricCard label="Avg Slippage" value={`${parseFloat(metrics.avg_slippage).toFixed(2)} bps`} />
                  <MetricCard label="One-Leg" value={metrics.one_leg_events.toString()} color={metrics.one_leg_events > 0 ? "text-accent-amber" : undefined} />
                </div>
              )}

              {/* Inline Config */}
              <BotInlineConfig botId={bot.id} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Small metric card ─────────── */

function MetricCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-bg-primary border border-bg-border rounded-lg p-2.5">
      <p className="text-[9px] text-text-secondary uppercase tracking-wider">{label}</p>
      <p className={cn("font-mono text-sm font-semibold", color || "text-text-primary")}>{value}</p>
    </div>
  );
}

/* ── Inline config editor ─────────── */

function BotInlineConfig({ botId }: { botId: number }) {
  const [open, setOpen] = useState(false);
  const { mutate, isPending } = useBotConfigUpdate(botId);
  const [local, setLocal] = useState({
    percentile: 0.75,
    timeframe_hours: 6,
    profit_margin_bps: 5,
    max_slippage_ticks: 2,
    exit_mode: "on_profit" as "on_profit" | "on_reverse",
    funding_rate_threshold: 0.5,
    one_leg_protection: true,
  });

  if (!open) {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className="text-[10px] text-accent-indigo hover:text-accent-indigo/80 transition-colors"
      >
        Show Configuration
      </button>
    );
  }

  return (
    <div className="bg-bg-primary border border-bg-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-semibold text-text-primary">Configuration</h4>
        <button
          onClick={(e) => { e.stopPropagation(); setOpen(false); }}
          className="text-[10px] text-text-secondary hover:text-text-primary"
        >
          Hide
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" onClick={(e) => e.stopPropagation()}>
        <div>
          <label className="text-[9px] text-text-secondary uppercase tracking-wider">Percentile</label>
          <select
            value={local.percentile}
            onChange={(e) => setLocal({ ...local, percentile: parseFloat(e.target.value) })}
            className="w-full mt-1 bg-bg-surface border border-bg-border rounded-lg px-2 py-1.5 text-xs text-text-primary"
          >
            {PERCENTILE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label} ({opt.value})</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[9px] text-text-secondary uppercase tracking-wider">Timeframe</label>
          <select
            value={local.timeframe_hours}
            onChange={(e) => setLocal({ ...local, timeframe_hours: parseInt(e.target.value) })}
            className="w-full mt-1 bg-bg-surface border border-bg-border rounded-lg px-2 py-1.5 text-xs text-text-primary"
          >
            {[1, 6, 12, 24, 168].map((h) => (
              <option key={h} value={h}>{h}h</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[9px] text-text-secondary uppercase tracking-wider">Min Profit (bps)</label>
          <input
            type="number"
            value={local.profit_margin_bps}
            onChange={(e) => setLocal({ ...local, profit_margin_bps: parseFloat(e.target.value) })}
            className="w-full mt-1 bg-bg-surface border border-bg-border rounded-lg px-2 py-1.5 text-xs text-text-primary font-mono"
            step={0.5}
            min={0}
          />
        </div>

        <div>
          <label className="text-[9px] text-text-secondary uppercase tracking-wider">Max Slippage</label>
          <input
            type="number"
            value={local.max_slippage_ticks}
            onChange={(e) => setLocal({ ...local, max_slippage_ticks: parseInt(e.target.value) })}
            className="w-full mt-1 bg-bg-surface border border-bg-border rounded-lg px-2 py-1.5 text-xs text-text-primary font-mono"
            min={1}
            max={10}
          />
        </div>

        <div>
          <label className="text-[9px] text-text-secondary uppercase tracking-wider">Exit Mode</label>
          <select
            value={local.exit_mode}
            onChange={(e) => setLocal({ ...local, exit_mode: e.target.value as any })}
            className="w-full mt-1 bg-bg-surface border border-bg-border rounded-lg px-2 py-1.5 text-xs text-text-primary"
          >
            <option value="on_profit">On Profit</option>
            <option value="on_reverse">On Reverse</option>
          </select>
        </div>

        <div>
          <label className="text-[9px] text-text-secondary uppercase tracking-wider">Funding Threshold</label>
          <input
            type="number"
            value={local.funding_rate_threshold}
            onChange={(e) => setLocal({ ...local, funding_rate_threshold: parseFloat(e.target.value) })}
            className="w-full mt-1 bg-bg-surface border border-bg-border rounded-lg px-2 py-1.5 text-xs text-text-primary font-mono"
            step={0.1}
            min={0}
          />
        </div>

        <div className="flex items-center gap-2 pt-4">
          <input
            type="checkbox"
            checked={local.one_leg_protection}
            onChange={(e) => setLocal({ ...local, one_leg_protection: e.target.checked })}
            className="rounded"
          />
          <label className="text-xs text-text-primary">One-Leg Protection</label>
        </div>

        <div className="flex items-end">
          <button
            onClick={(e) => { e.stopPropagation(); mutate(local); }}
            disabled={isPending}
            className="w-full px-3 py-1.5 bg-accent-indigo text-white rounded-lg text-xs font-semibold hover:bg-accent-indigo/80 disabled:opacity-50 transition-colors"
          >
            {isPending ? "Saving..." : "Save Config"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main Panel ─────────── */

export default function BotManagementPanel() {
  const bots = useBotStore((s) => s.bots);
  const [showSetup, setShowSetup] = useState(false);

  const shortBots = bots.filter((b) => b.direction === "long_a_short_b");
  const longBots = bots.filter((b) => b.direction === "short_a_long_b");
  const connectedCount = bots.filter((b) => b.connected).length;
  const runningCount = bots.filter((b) => b.state === "RUNNING").length;

  return (
    <div className="space-y-6">
      {/* Summary bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-accent-green" />
            <span className="text-xs text-text-secondary">{connectedCount} connected</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-accent-cyan animate-pulse" />
            <span className="text-xs text-text-secondary">{runningCount} running</span>
          </div>
        </div>
        <button
          onClick={() => setShowSetup(!showSetup)}
          className="px-4 py-2 bg-accent-indigo text-white text-xs font-semibold rounded-lg hover:bg-accent-indigo/80 transition-colors"
        >
          {showSetup ? "Cancel" : "Deploy New Bot"}
        </button>
      </div>

      {/* Setup Form */}
      {showSetup && (
        <SetupBotForm
          onSuccess={() => setShowSetup(false)}
          onCancel={() => setShowSetup(false)}
        />
      )}

      {/* XYZ Short bots */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="px-2.5 py-1 bg-accent-red/10 border border-accent-red/20 rounded text-xs font-bold text-accent-red">
            XYZ Short
          </span>
          <span className="text-xs text-text-secondary">Long A / Short B</span>
        </div>
        <div className="space-y-2">
          {shortBots.map((bot) => (
            <BotRow key={bot.id} bot={bot} />
          ))}
        </div>
      </div>

      {/* XYZ Long bots */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="px-2.5 py-1 bg-accent-green/10 border border-accent-green/20 rounded text-xs font-bold text-accent-green">
            XYZ Long
          </span>
          <span className="text-xs text-text-secondary">Short A / Long B</span>
        </div>
        <div className="space-y-2">
          {longBots.map((bot) => (
            <BotRow key={bot.id} bot={bot} />
          ))}
        </div>
      </div>
    </div>
  );
}
