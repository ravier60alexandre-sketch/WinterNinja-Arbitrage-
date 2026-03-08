"use client";

import { useState, useEffect } from "react";
import { useBotConfigUpdate } from "@/hooks/useBotData";
import type { BotConfig as BotConfigType } from "@/lib/types";
import { PERCENTILE_OPTIONS, TIMEFRAMES } from "@/lib/constants";

interface BotConfigProps {
  botId: number;
  config: BotConfigType | null;
}

const DEFAULT_CONFIG: BotConfigType = {
  percentile: 0.75,
  timeframe_hours: 6,
  profit_margin_bps: 5,
  max_slippage_ticks: 2,
  max_position_size: null,
  funding_rate_threshold: 0.5,
  one_leg_protection: true,
  exit_mode: "on_profit",
  min_edge_bps: 3,
};

export default function BotConfig({ botId, config }: BotConfigProps) {
  const { mutate, isPending, error } = useBotConfigUpdate(botId);
  const effectiveConfig = config || DEFAULT_CONFIG;
  const [local, setLocal] = useState<Partial<BotConfigType>>(effectiveConfig);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (config) setLocal(config);
  }, [config]);

  const handleSave = () => {
    setSaveError(null);
    mutate(local, {
      onError: (err: any) => {
        setSaveError(err.message || "Failed to save. Backend may be offline.");
      },
    });
  };

  return (
    <div className="bg-bg-surface border border-bg-border rounded-xl p-4">
      <h3 className="text-sm font-semibold text-text-primary mb-4">Configuration</h3>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div>
          <label className="text-[10px] text-text-secondary uppercase tracking-wider">Percentile</label>
          <select
            value={local.percentile ?? 0.75}
            onChange={(e) => setLocal({ ...local, percentile: parseFloat(e.target.value) })}
            className="w-full mt-1 bg-bg-primary border border-bg-border rounded-lg px-3 py-2 text-xs text-text-primary"
          >
            {PERCENTILE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label} ({opt.value})</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[10px] text-text-secondary uppercase tracking-wider">Timeframe</label>
          <select
            value={local.timeframe_hours ?? 6}
            onChange={(e) => setLocal({ ...local, timeframe_hours: parseInt(e.target.value) })}
            className="w-full mt-1 bg-bg-primary border border-bg-border rounded-lg px-3 py-2 text-xs text-text-primary"
          >
            {[1, 6, 12, 24, 168].map((h) => (
              <option key={h} value={h}>{h}h</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[10px] text-text-secondary uppercase tracking-wider">Min Profit (bps)</label>
          <input
            type="number"
            value={local.profit_margin_bps ?? 5}
            onChange={(e) => setLocal({ ...local, profit_margin_bps: parseFloat(e.target.value) })}
            className="w-full mt-1 bg-bg-primary border border-bg-border rounded-lg px-3 py-2 text-xs text-text-primary font-mono"
            step={0.5}
            min={0}
          />
        </div>

        <div>
          <label className="text-[10px] text-text-secondary uppercase tracking-wider">Max Slippage (ticks)</label>
          <input
            type="number"
            value={local.max_slippage_ticks ?? 2}
            onChange={(e) => setLocal({ ...local, max_slippage_ticks: parseInt(e.target.value) })}
            className="w-full mt-1 bg-bg-primary border border-bg-border rounded-lg px-3 py-2 text-xs text-text-primary font-mono"
            min={1}
            max={10}
          />
        </div>

        <div>
          <label className="text-[10px] text-text-secondary uppercase tracking-wider">Exit Mode</label>
          <select
            value={local.exit_mode ?? "on_profit"}
            onChange={(e) => setLocal({ ...local, exit_mode: e.target.value as any })}
            className="w-full mt-1 bg-bg-primary border border-bg-border rounded-lg px-3 py-2 text-xs text-text-primary"
          >
            <option value="on_profit">On Profit</option>
            <option value="on_reverse">On Reverse</option>
          </select>
        </div>

        <div>
          <label className="text-[10px] text-text-secondary uppercase tracking-wider">Funding Threshold</label>
          <input
            type="number"
            value={local.funding_rate_threshold ?? 0.5}
            onChange={(e) => setLocal({ ...local, funding_rate_threshold: parseFloat(e.target.value) })}
            className="w-full mt-1 bg-bg-primary border border-bg-border rounded-lg px-3 py-2 text-xs text-text-primary font-mono"
            step={0.1}
            min={0}
          />
        </div>

        <div className="flex items-center gap-2 pt-5">
          <input
            type="checkbox"
            checked={local.one_leg_protection ?? true}
            onChange={(e) => setLocal({ ...local, one_leg_protection: e.target.checked })}
            className="rounded"
          />
          <label className="text-xs text-text-primary">One-Leg Protection</label>
        </div>
      </div>

      {saveError && (
        <p className="mt-2 text-xs text-accent-red">{saveError}</p>
      )}
      {!config && (
        <p className="mt-2 text-xs text-accent-amber">Default config shown. Connect to backend to save changes.</p>
      )}
      <button
        onClick={handleSave}
        disabled={isPending}
        className="mt-4 px-4 py-2 bg-accent-indigo text-white rounded-lg text-xs font-semibold hover:bg-accent-indigo/80 disabled:opacity-50 transition-colors"
      >
        {isPending ? "Saving..." : "Save Config"}
      </button>
    </div>
  );
}
