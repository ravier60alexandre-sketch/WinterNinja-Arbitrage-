"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/formatters";
import { API_URL } from "@/lib/constants";
import LiveTradeFeed from "./LiveTradeFeed";

const EXCHANGE_COLORS: Record<string, { border: string; bg: string; text: string; tag: string }> = {
  FLX: { border: "border-orange-400", bg: "bg-orange-400/10", text: "text-orange-400", tag: "bg-orange-400" },
  KM: { border: "border-emerald-400", bg: "bg-emerald-400/10", text: "text-emerald-400", tag: "bg-emerald-400" },
  CASH: { border: "border-blue-400", bg: "bg-blue-400/10", text: "text-blue-400", tag: "bg-blue-400" },
};

const pnlClass = (v: number) => (v > 0 ? "text-accent-green" : v < 0 ? "text-accent-red" : "text-gray-400");
const fmtUsd = (v: number) => (v >= 0 ? "+" : "") + "$" + Math.abs(v).toFixed(4);
const fmtK = (v: number) => (v >= 1000 ? "$" + (v / 1000).toFixed(2) + "K" : "$" + v.toFixed(2));
const fmtPct = (v: number | null | undefined) => (v === null || v === undefined ? "—%" : v.toFixed(0) + "%");

export default function BotsView() {
  const [data, setData] = useState<{ bots: any[]; global_stats: any }>({ bots: [], global_stats: {} });
  const [tab, setTab] = useState<"short" | "long">("short");
  const [connected, setConnected] = useState(false);
  const [editingWallet, setEditingWallet] = useState<{ botId: number; field: string } | null>(null);
  const [walletInput, setWalletInput] = useState("");
  const [logs, setLogs] = useState<any[]>([]);
  const [showLogs, setShowLogs] = useState(true);

  const fetchData = useCallback(() => {
    fetch(`${API_URL}/api/bots`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => {});
  }, []);

  const fetchLogs = useCallback(() => {
    fetch(`${API_URL}/api/logs?limit=50`)
      .then((r) => r.json())
      .then((d) => setLogs(d.logs || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchData();
    fetchLogs();
    const interval = setInterval(() => { fetchData(); fetchLogs(); }, 3000);
    return () => clearInterval(interval);
  }, [fetchData, fetchLogs]);

  useEffect(() => {
    const es = new EventSource("/api/spread-analyzer/live");
    es.onmessage = (event) => {
      try {
        const d = JSON.parse(event.data);
        setConnected(d.connected || false);
      } catch {}
    };
    es.onerror = () => setConnected(false);
    return () => es.close();
  }, []);

  const handleAction = useCallback((botId: number, action: string) => {
    fetch(`${API_URL}/api/bots`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bot_id: botId, action }),
    }).then(() => fetchData()).catch(console.error);
  }, [fetchData]);

  const handleConfigUpdate = useCallback((botId: number, config: any) => {
    fetch(`${API_URL}/api/bots`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bot_id: botId, config }),
    }).then(() => fetchData()).catch(console.error);
  }, [fetchData]);

  const handleWalletSet = useCallback((botId: number, field: string, value: string) => {
    fetch(`${API_URL}/api/bots`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bot_id: botId, [field]: value }),
    }).then(() => { fetchData(); setEditingWallet(null); setWalletInput(""); }).catch(console.error);
  }, [fetchData]);

  const shortBots = data.bots.filter((b) => b.direction === "short").sort((a, b) => a.id - b.id);
  const longBots = data.bots.filter((b) => b.direction === "long").sort((a, b) => a.id - b.id);
  const displayedBots = tab === "short" ? shortBots : longBots;
  const gs = data.global_stats || {};

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-text-primary uppercase tracking-wide">6-Bot Deployer Router</h2>
        <div className="flex bg-bg-primary rounded-lg p-0.5">
          <button
            onClick={() => setTab("short")}
            className={cn("px-4 py-1.5 text-xs font-semibold rounded-md transition-all",
              tab === "short" ? "bg-accent-amber text-white shadow-sm" : "text-gray-500 hover:text-gray-300"
            )}
          >
            XYZ Short
          </button>
          <button
            onClick={() => setTab("long")}
            className={cn("px-4 py-1.5 text-xs font-semibold rounded-md transition-all",
              tab === "long" ? "bg-accent-amber text-white shadow-sm" : "text-gray-500 hover:text-gray-300"
            )}
          >
            XYZ Long
          </button>
        </div>
      </div>

      {/* Global stats */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        <StatBox label="COMBINED OPEN" value={gs.combined_open || displayedBots.reduce((s: number, b: any) => s + (b.metrics?.open || 0), 0)} />
        <StatBox label="NET PNL" value={fmtUsd(displayedBots.reduce((s: number, b: any) => s + (b.metrics?.pnl_net || 0), 0))}
          className={pnlClass(displayedBots.reduce((s: number, b: any) => s + (b.metrics?.pnl_net || 0), 0))} />
        <StatBox label="TOTAL FEES" value={fmtUsd(displayedBots.reduce((s: number, b: any) => s + (b.metrics?.fees || 0), 0))} />
        <StatBox label="TOTAL FUNDING" value={fmtUsd(displayedBots.reduce((s: number, b: any) => s + (b.metrics?.funding || 0), 0))} />
        <StatBox label="TOTAL VOLUME" value={fmtK(displayedBots.reduce((s: number, b: any) => s + (b.metrics?.volume || 0), 0))} />
        <StatBox label="TOTAL TRADES" value={displayedBots.reduce((s: number, b: any) => s + (b.metrics?.closed || 0), 0)} />
      </div>

      {/* Bot Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {displayedBots.map((bot) => (
          <BotColumn
            key={bot.id}
            bot={bot}
            onAction={handleAction}
            onConfigUpdate={handleConfigUpdate}
            onWalletSet={handleWalletSet}
            editingWallet={editingWallet}
            setEditingWallet={setEditingWallet}
            walletInput={walletInput}
            setWalletInput={setWalletInput}
          />
        ))}
        {displayedBots.length === 0 && (
          <div className="col-span-3 text-center text-gray-500 py-12">
            No bots configured for {tab === "short" ? "XYZ Short" : "XYZ Long"} direction.
            <br />
            <span className="text-[10px] text-gray-600">Make sure the bot-engine backend is running on port 8000</span>
          </div>
        )}
      </div>

      {/* Live Trade Feed */}
      <LiveTradeFeed />

      {/* Bot Engine Logs */}
      <div className="bg-bg-surface border border-bg-border rounded-xl overflow-hidden">
        <button
          onClick={() => setShowLogs(!showLogs)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-bg-border/30 transition-colors"
        >
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-accent-green animate-pulse" />
            <span className="text-xs font-bold text-text-primary uppercase">Bot Engine Logs</span>
            <span className="text-[10px] text-text-secondary">({logs.length} entries)</span>
          </div>
          <span className="text-text-secondary text-xs">{showLogs ? "Hide" : "Show"}</span>
        </button>
        {showLogs && (
          <div className="border-t border-bg-border bg-bg-primary max-h-[300px] overflow-y-auto font-mono text-[11px]">
            {logs.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-500">
                No logs yet. Start a bot to see activity here.
              </div>
            ) : (
              logs.slice().reverse().map((log, i) => (
                <div
                  key={i}
                  className={cn(
                    "px-4 py-1 border-b border-bg-border/30 flex gap-3",
                    log.level === "ERROR" && "bg-accent-red/10",
                    log.level === "WARNING" && "bg-accent-amber/10"
                  )}
                >
                  <span className="text-gray-500 shrink-0">{log.ts?.split("T")[1]?.slice(0, 8) || ""}</span>
                  <span className={cn("shrink-0 w-12",
                    log.level === "ERROR" ? "text-accent-red" :
                    log.level === "WARNING" ? "text-accent-amber" :
                    log.level === "INFO" ? "text-accent-green" : "text-gray-400"
                  )}>{log.level}</span>
                  <span className="text-gray-300">{log.msg}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatBox({ label, value, className = "" }: { label: string; value: any; className?: string }) {
  return (
    <div className="bg-bg-surface rounded-lg border border-bg-border px-3 py-2">
      <div className="text-[9px] text-text-secondary uppercase tracking-wider">{label}</div>
      <div className={cn("text-lg font-mono font-bold mt-0.5", className || "text-text-primary")}>{value}</div>
    </div>
  );
}

function BotColumn({
  bot, onAction, onConfigUpdate, onWalletSet, editingWallet, setEditingWallet, walletInput, setWalletInput,
}: {
  bot: any;
  onAction: (botId: number, action: string) => void;
  onConfigUpdate: (botId: number, config: any) => void;
  onWalletSet: (botId: number, field: string, value: string) => void;
  editingWallet: { botId: number; field: string } | null;
  setEditingWallet: (v: { botId: number; field: string } | null) => void;
  walletInput: string;
  setWalletInput: (v: string) => void;
}) {
  const ec = EXCHANGE_COLORS[bot.exchange] || EXCHANGE_COLORS.FLX;
  const [localConfig, setLocalConfig] = useState(bot.config);
  const [dirty, setDirty] = useState(false);
  const serverConfigRef = useRef<string | null>(null);

  useEffect(() => {
    const serverJson = JSON.stringify(bot.config);
    if (serverJson !== serverConfigRef.current) {
      serverConfigRef.current = serverJson;
      if (!dirty) setLocalConfig(bot.config);
    }
  }, [bot.config, dirty]);

  const updateLocal = (key: string, val: any) => { setDirty(true); setLocalConfig((prev: any) => ({ ...prev, [key]: val })); };
  const applyConfig = () => { onConfigUpdate(bot.id, localConfig); setDirty(false); };
  const truncAddr = (a: string) => a ? `${a.slice(0, 6)}...${a.slice(-4)}` : "";

  return (
    <div className="space-y-4">
      {/* Bot Header */}
      <div className={cn("bg-bg-surface rounded-xl border-2 p-4", ec.border)}>
        <div className="flex items-center gap-2 mb-3">
          <span className={cn(ec.tag, "text-white text-[10px] font-bold px-2 py-0.5 rounded")}>{bot.exchange}</span>
          <span className="text-sm font-bold text-text-primary">#{bot.id} {bot.name}</span>
        </div>

        <div className="flex items-center gap-2 mb-3">
          <span className={cn("flex items-center gap-1.5 text-xs font-semibold",
            bot.state === "running" ? "text-accent-green" : "text-accent-red"
          )}>
            <span className={cn("w-2 h-2 rounded-full",
              bot.state === "running" ? "bg-accent-green animate-pulse" : "bg-accent-red"
            )} />
            {bot.state?.toUpperCase()}
          </span>
          <div className="flex gap-1.5 ml-auto">
            <button onClick={() => onAction(bot.id, "start")}
              className="px-3 py-1 text-[10px] font-semibold bg-accent-green text-white rounded-md hover:bg-green-600 transition-colors">
              Start
            </button>
            <button onClick={() => onAction(bot.id, "liquidate")}
              className="px-3 py-1 text-[10px] font-semibold bg-accent-amber text-white rounded-md hover:bg-amber-600 transition-colors">
              LIQUIDATION
            </button>
            <button onClick={() => onAction(bot.id, "reset")}
              className="px-3 py-1 text-[10px] font-semibold bg-accent-red text-white rounded-md hover:bg-red-600 transition-colors">
              Reset
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4 text-[10px] text-text-secondary mb-2">
          <span>COLL:</span>
          <span>USDC <span className="font-mono text-accent-green">{bot.collateral?.usdc?.toFixed(2) || "0.00"}</span></span>
          <span>USDH <span className="font-mono text-accent-green">{bot.collateral?.usdh?.toFixed(2) || "0.00"}</span></span>
          <span>Total <span className="font-mono text-accent-green">{bot.collateral?.total?.toFixed(2) || "0.00"}</span></span>
          <span className="ml-auto">Ping <span className="font-mono text-text-primary">{bot.ping_ms || 0}ms</span></span>
        </div>

        <div className="text-[10px] text-text-secondary mb-3">
          Fees <span className="font-mono text-accent-green">{bot.fees_bps || 0.45}bps</span>
        </div>

        {/* Wallet */}
        <WalletField label="Wallet" value={bot.wallet} botId={bot.id} field="wallet"
          editingWallet={editingWallet} setEditingWallet={setEditingWallet}
          walletInput={walletInput} setWalletInput={setWalletInput}
          onSet={onWalletSet} truncAddr={truncAddr} />
        <WalletField label="Sub-acct" value={bot.sub_account} botId={bot.id} field="sub_account"
          editingWallet={editingWallet} setEditingWallet={setEditingWallet}
          walletInput={walletInput} setWalletInput={setWalletInput}
          onSet={onWalletSet} truncAddr={truncAddr} />
      </div>

      {/* Dashboard */}
      <div className="bg-bg-surface rounded-xl border border-bg-border p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className={cn("w-1 h-4 rounded", ec.tag)} />
          <span className="text-xs font-bold text-text-primary uppercase">Dashboard #{bot.id} {bot.name}</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <MetricBox label="PNL NET" value={fmtUsd(bot.metrics?.pnl_net || 0)} color={pnlClass(bot.metrics?.pnl_net || 0)} />
          <MetricBox label="FEES" value={fmtUsd(bot.metrics?.fees || 0)} />
          <MetricBox label="VOLUME" value={fmtK(bot.metrics?.volume || 0)} />
          <MetricBox label="OPEN" value={bot.metrics?.open || 0} />
          <MetricBox label="CLOSED" value={bot.metrics?.closed || 0} />
          <MetricBox label="WIN %" value={fmtPct(bot.metrics?.win_pct)} />
          <MetricBox label="WINS" value={bot.metrics?.wins || 0} />
          <MetricBox label="LOSSES" value={bot.metrics?.losses || 0} />
          <MetricBox label="SLIP AVG" value={`${(bot.metrics?.slip_avg_bps || 0).toFixed(2)} bps`} />
          <MetricBox label="ERRORS" value={bot.metrics?.errors || 0} valueColor="text-accent-red" />
          <MetricBox label="ORPHANS" value={fmtUsd(bot.metrics?.orphans || 0)} valueColor="text-accent-green" />
          <MetricBox label="FUNDING" value={fmtUsd(bot.metrics?.funding || 0)} valueColor="text-accent-green" />
        </div>
      </div>

      {/* Config */}
      <div className="bg-bg-surface rounded-xl border border-bg-border p-4">
        <div className="flex items-center gap-2 mb-4">
          <div className={cn("w-1 h-4 rounded", ec.tag)} />
          <span className="text-xs font-bold text-text-primary uppercase">Config #{bot.id} {bot.name}</span>
        </div>

        <div className="mb-4">
          <div className="text-[10px] text-text-secondary uppercase tracking-wider font-semibold mb-2">Position Sizing</div>
          <div className="flex gap-3">
            <ConfigInput label="Max Pos ($)" value={localConfig?.max_pos} onChange={(v) => updateLocal("max_pos", parseFloat(v))} />
            <ConfigInput label="Max Global" value={localConfig?.max_global} onChange={(v) => updateLocal("max_global", parseFloat(v))} />
            <ConfigInput label="Max Concurrent" value={localConfig?.max_concurrent_positions ?? 10} onChange={(v) => updateLocal("max_concurrent_positions", parseInt(v))} />
          </div>
        </div>

        <div className="mb-4">
          <div className="text-[10px] text-text-secondary uppercase tracking-wider font-semibold mb-2">Risk</div>
          <div className="flex gap-3">
            <ConfigInput label="Max Lev" value={localConfig?.max_lev} onChange={(v) => updateLocal("max_lev", parseFloat(v))} />
            <ConfigInput label="SL (bps)" value={localConfig?.sl_bps} onChange={(v) => updateLocal("sl_bps", parseFloat(v))} />
            <ConfigInput label="MaxLoss(bps)" value={localConfig?.max_loss_bps} onChange={(v) => updateLocal("max_loss_bps", parseFloat(v))} />
          </div>
        </div>

        <div className="mb-4">
          <div className="text-[10px] text-text-secondary uppercase tracking-wider font-semibold mb-2">Entry Mode (Percentile)</div>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            {[
              { label: "P50", value: 0.5 },
              { label: "P60", value: 0.6 },
              { label: "P70", value: 0.7 },
              { label: "P75", value: 0.75 },
              { label: "P80", value: 0.8 },
              { label: "P85", value: 0.85 },
              { label: "P90", value: 0.9 },
            ].map((p) => (
              <button
                key={p.value}
                onClick={() => updateLocal("percentile", p.value)}
                className={cn("px-2.5 py-1 text-[10px] font-semibold rounded-md transition-all",
                  localConfig?.percentile === p.value
                    ? "bg-accent-amber text-white"
                    : "bg-bg-primary text-gray-500 hover:bg-bg-border"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] text-text-secondary">P:</span>
            <input
              type="range" min="50" max="95" step="1"
              value={(localConfig?.percentile || 0.75) * 100}
              onChange={(e) => updateLocal("percentile", parseInt(e.target.value) / 100)}
              className="flex-1 h-1.5 rounded-full appearance-none bg-bg-border accent-accent-amber"
            />
            <span className="text-[10px] font-mono text-text-primary min-w-[36px] text-right">
              {((localConfig?.percentile || 0.75) * 100).toFixed(0)}
            </span>
          </div>
          <div className="flex gap-3">
            <ConfigInput label="Buf" value={localConfig?.buf} onChange={(v) => updateLocal("buf", parseFloat(v))} />
            <ConfigInput label="Slip" value={localConfig?.slip} onChange={(v) => updateLocal("slip", parseFloat(v))} />
            <div className="flex-1">
              <label className="text-[10px] text-text-secondary block mb-0.5">Timer</label>
              <select
                value={localConfig?.timer || "6h"}
                onChange={(e) => updateLocal("timer", e.target.value)}
                className="w-full px-2 py-1.5 text-xs bg-bg-primary border border-bg-border rounded-md text-text-primary font-mono"
              >
                {["1h", "6h", "12h", "24h"].map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="mb-4">
          <div className="text-[10px] text-text-secondary uppercase tracking-wider font-semibold mb-2">Close (BE-Based)</div>
          <div className="flex items-center gap-3">
            <ConfigInput label="Buffer" value={localConfig?.close_buffer_bps} onChange={(v) => updateLocal("close_buffer_bps", parseFloat(v))} suffix="bps" />
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={localConfig?.zmr || false}
                onChange={(e) => updateLocal("zmr", e.target.checked)}
                className="w-3.5 h-3.5 rounded border-bg-border accent-accent-amber" />
              <span className="text-[10px] text-text-primary font-semibold">ZMR</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={localConfig?.close_fee_rt_buffer || false}
                onChange={(e) => updateLocal("close_fee_rt_buffer", e.target.checked)}
                className="w-3.5 h-3.5 rounded border-bg-border accent-accent-amber" />
              <span className="text-[10px] text-text-primary">Close = feeRT + buffer</span>
            </label>
          </div>
        </div>

        <button
          onClick={applyConfig}
          className={cn("w-full py-2.5 text-xs font-bold text-white rounded-lg transition-colors",
            dirty ? "bg-accent-amber hover:bg-amber-600 animate-pulse" : "bg-accent-indigo hover:bg-indigo-600"
          )}
        >
          {dirty ? "Apply Changes" : `Apply ${bot.name}`}
        </button>
      </div>
    </div>
  );
}

function WalletField({
  label, value, botId, field, editingWallet, setEditingWallet, walletInput, setWalletInput, onSet, truncAddr,
}: any) {
  const isEditing = editingWallet?.botId === botId && editingWallet?.field === field;
  return (
    <div className="flex items-center gap-2 mb-1.5 text-[10px]">
      <span className="text-text-secondary w-14">{label}:</span>
      {isEditing ? (
        <div className="flex-1 flex gap-1">
          <input type="text" value={walletInput} onChange={(e) => setWalletInput(e.target.value)}
            placeholder="0x..." autoFocus
            className="flex-1 px-2 py-1 text-[10px] bg-bg-primary border border-bg-border rounded font-mono text-text-primary" />
          <button onClick={() => onSet(botId, field, walletInput)}
            className="px-2 py-1 bg-accent-green text-white rounded text-[9px] font-semibold">Save</button>
          <button onClick={() => { setEditingWallet(null); setWalletInput(""); }}
            className="px-2 py-1 bg-gray-700 text-gray-300 rounded text-[9px] font-semibold">Cancel</button>
        </div>
      ) : (
        <>
          <span className="flex-1 font-mono text-gray-400 bg-bg-primary px-2 py-1 rounded">
            {value ? truncAddr(value) : <span className="text-gray-600 italic">not set</span>}
          </span>
          <button onClick={() => { setEditingWallet({ botId, field }); setWalletInput(value || ""); }}
            className="px-2 py-0.5 bg-accent-amber text-white rounded text-[9px] font-semibold hover:bg-amber-600 transition-colors">Set</button>
        </>
      )}
    </div>
  );
}

function MetricBox({ label, value, color, valueColor }: { label: string; value: any; color?: string; valueColor?: string }) {
  return (
    <div className="bg-bg-primary border border-bg-border rounded-lg p-2.5 text-center">
      <div className={cn("text-sm font-mono font-bold", color || valueColor || "text-text-primary")}>{value}</div>
      <div className="text-[9px] text-text-secondary uppercase tracking-wider">{label}</div>
    </div>
  );
}

function ConfigInput({ label, value, onChange, suffix }: { label: string; value: any; onChange: (v: string) => void; suffix?: string }) {
  return (
    <div className="flex-1">
      <label className="text-[10px] text-text-secondary block mb-0.5">{label}</label>
      <div className="flex items-center gap-1">
        <input type="number" value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-2 py-1.5 text-xs bg-bg-primary border border-bg-border rounded-md text-text-primary font-mono focus:outline-none focus:border-accent-amber" />
        {suffix && <span className="text-[10px] text-text-secondary">{suffix}</span>}
      </div>
    </div>
  );
}
