"use client";

import { useState } from "react";
import Link from "next/link";
import { BOT_STATE_BG, BOT_STATE_COLORS } from "@/lib/constants";
import { cn } from "@/lib/formatters";
import { useBotStore, type BotSlot } from "@/store/botStore";

interface BotCardProps {
  bot: BotSlot;
}

export default function BotCard({ bot }: BotCardProps) {
  const [showConnect, setShowConnect] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [wallet, setWallet] = useState("");
  const [subAccount, setSubAccount] = useState("");
  const [showKey, setShowKey] = useState(false);

  const connectBot = useBotStore((s) => s.connectBot);
  const disconnectBot = useBotStore((s) => s.disconnectBot);
  const updateBotState = useBotStore((s) => s.updateBotState);

  const handleConnect = () => {
    if (!apiKey.trim() || !wallet.trim()) return;
    connectBot(bot.id, apiKey.trim(), wallet.trim(), subAccount.trim());
    setShowConnect(false);
    setApiKey("");
    setWallet("");
    setSubAccount("");
  };

  const handleStart = async () => {
    updateBotState(bot.id, "CONNECTING");
    try {
      const { botAction } = await import("@/lib/api");
      await botAction(bot.id, "start");
      updateBotState(bot.id, "RUNNING");
    } catch {
      updateBotState(bot.id, "RUNNING");
    }
  };

  const handleStop = async () => {
    try {
      const { botAction } = await import("@/lib/api");
      await botAction(bot.id, "stop");
    } catch {
      // continue
    }
    updateBotState(bot.id, "STOPPED");
  };

  const dirColor = bot.direction === "long_a_short_b"
    ? "text-accent-red"
    : "text-accent-green";

  const dirBg = bot.direction === "long_a_short_b"
    ? "bg-accent-red/10 border-accent-red/20"
    : "bg-accent-green/10 border-accent-green/20";

  return (
    <div className="bg-bg-surface border border-bg-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-bg-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold border", dirBg, dirColor)}>
            {bot.directionLabel}
          </span>
          <span className="text-xs font-medium text-text-secondary">vs</span>
          <span className="text-sm font-bold text-text-primary">{bot.deployer}</span>
        </div>
        <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-medium border", BOT_STATE_BG[bot.state], BOT_STATE_COLORS[bot.state])}>
          {bot.state}
          {bot.state === "CONNECTING" && <span className="ml-1 inline-block animate-spin">&#9696;</span>}
        </span>
      </div>

      {/* Body */}
      <div className="p-4 space-y-3">
        {!bot.connected && !showConnect && (
          <div className="text-center py-4">
            <p className="text-xs text-text-secondary mb-3">Connect your API key to enable this bot</p>
            <button
              onClick={() => setShowConnect(true)}
              className="px-5 py-2 bg-accent-indigo text-white text-xs font-semibold rounded-lg hover:bg-accent-indigo/80 transition-colors"
            >
              Connect API Key
            </button>
          </div>
        )}

        {!bot.connected && showConnect && (
          <div className="space-y-2.5">
            <div>
              <label className="block text-[10px] text-text-secondary mb-1">API Key</label>
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Your Hyperliquid API key"
                  className="w-full bg-bg-primary border border-bg-border rounded-lg px-2.5 py-2 text-xs text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:border-accent-indigo/50 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-text-secondary hover:text-text-primary"
                >
                  {showKey ? "Hide" : "Show"}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-[10px] text-text-secondary mb-1">Wallet Address</label>
              <input
                type="text"
                value={wallet}
                onChange={(e) => setWallet(e.target.value)}
                placeholder="0x..."
                className="w-full bg-bg-primary border border-bg-border rounded-lg px-2.5 py-2 text-xs text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:border-accent-indigo/50 font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] text-text-secondary mb-1">
                Sub-Account <span className="text-text-secondary/40">(optional)</span>
              </label>
              <input
                type="text"
                value={subAccount}
                onChange={(e) => setSubAccount(e.target.value)}
                placeholder="0x... or leave empty"
                className="w-full bg-bg-primary border border-bg-border rounded-lg px-2.5 py-2 text-xs text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:border-accent-indigo/50 font-mono"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleConnect}
                disabled={!apiKey.trim() || !wallet.trim()}
                className="flex-1 px-3 py-2 bg-accent-green text-white text-xs font-semibold rounded-lg disabled:opacity-30 disabled:cursor-not-allowed hover:bg-accent-green/80 transition-colors"
              >
                Connect
              </button>
              <button
                onClick={() => setShowConnect(false)}
                className="px-3 py-2 border border-bg-border text-text-secondary text-xs rounded-lg hover:text-text-primary transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {bot.connected && (
          <>
            {/* Connection info */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-text-secondary">Wallet</span>
                <span className="text-[10px] font-mono text-text-primary">
                  {bot.walletAddress ? `${bot.walletAddress.slice(0, 6)}...${bot.walletAddress.slice(-4)}` : "—"}
                </span>
              </div>
              {bot.subAccountAddress && (
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-text-secondary">Sub-Account</span>
                  <span className="text-[10px] font-mono text-text-primary">
                    {bot.subAccountAddress.slice(0, 6)}...{bot.subAccountAddress.slice(-4)}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-text-secondary">API Key</span>
                <span className="text-[10px] font-mono text-accent-green">Connected</span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 pt-1">
              {(bot.state === "IDLE" || bot.state === "STOPPED") && (
                <button
                  onClick={handleStart}
                  className="flex-1 px-3 py-2 bg-accent-green text-white text-xs font-semibold rounded-lg hover:bg-accent-green/80 transition-colors"
                >
                  START BOT
                </button>
              )}
              {bot.state === "RUNNING" && (
                <button
                  onClick={handleStop}
                  className="flex-1 px-3 py-2 bg-accent-red text-white text-xs font-semibold rounded-lg hover:bg-accent-red/80 transition-colors"
                >
                  STOP BOT
                </button>
              )}
              {bot.state === "CONNECTING" && (
                <div className="flex-1 px-3 py-2 bg-accent-cyan/20 text-accent-cyan text-xs font-semibold rounded-lg text-center">
                  Connecting...
                </div>
              )}
              <button
                onClick={() => disconnectBot(bot.id)}
                className="px-3 py-2 border border-bg-border text-text-secondary text-xs rounded-lg hover:text-accent-red hover:border-accent-red/30 transition-colors"
                title="Disconnect API key"
              >
                Disconnect
              </button>
            </div>

            {/* Link to detail */}
            <Link
              href={`/dashboard/${bot.id}`}
              className="block text-center text-[10px] text-accent-indigo hover:text-accent-indigo/80 transition-colors pt-1"
            >
              View Details &rarr;
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
