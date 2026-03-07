"use client";

import { useState } from "react";
import { useBotAction } from "@/hooks/useBotData";
import { BOT_STATE_BG, BOT_STATE_COLORS } from "@/lib/constants";
import { cn } from "@/lib/formatters";
import type { BotAction, BotState } from "@/lib/types";

interface BotControlsProps {
  botId: number;
  state: BotState;
}

export default function BotControls({ botId, state }: BotControlsProps) {
  const { mutate, isPending } = useBotAction(botId);
  const [confirmAction, setConfirmAction] = useState<BotAction | null>(null);

  const handleAction = (action: BotAction) => {
    if (action === "liquidate" || action === "reset") {
      setConfirmAction(action);
      return;
    }
    mutate(action);
  };

  const confirmAndExecute = () => {
    if (confirmAction) {
      mutate(confirmAction);
      setConfirmAction(null);
    }
  };

  const buttons: Array<{ action: BotAction; label: string; color: string; enabled: boolean }> = [
    { action: "start", label: "START", color: "bg-accent-green hover:bg-accent-green/80", enabled: state !== "RUNNING" && state !== "CONNECTING" },
    { action: "stop", label: "STOP", color: "bg-accent-red hover:bg-accent-red/80", enabled: state === "RUNNING" || state === "PAUSED" },
    { action: "liquidate", label: "LIQUIDATE", color: "bg-orange-500 hover:bg-orange-500/80", enabled: state === "RUNNING" },
    { action: "reset", label: "RESET", color: "bg-text-secondary hover:bg-text-secondary/80", enabled: state === "PAUSED" || state === "STOPPED" || state === "IDLE" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className={cn("px-3 py-1 rounded-full text-xs font-medium border", BOT_STATE_BG[state], BOT_STATE_COLORS[state])}>
          {state}
          {(state === "CONNECTING" || state === "LIQUIDATING") && (
            <span className="ml-1 inline-block animate-spin">&#9696;</span>
          )}
        </span>
      </div>

      <div className="flex gap-2">
        {buttons.map(({ action, label, color, enabled }) => (
          <button
            key={action}
            onClick={() => handleAction(action)}
            disabled={!enabled || isPending}
            className={cn(
              "px-4 py-2 rounded-lg text-xs font-semibold text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed",
              color
            )}
          >
            {isPending ? "..." : label}
          </button>
        ))}
      </div>

      {confirmAction && (
        <div className="bg-accent-red/10 border border-accent-red/30 rounded-lg p-4">
          <p className="text-sm text-text-primary mb-3">
            Confirm <strong className="text-accent-red">{confirmAction.toUpperCase()}</strong>?
            {confirmAction === "liquidate" && " This will stop new entries and close existing positions."}
            {confirmAction === "reset" && " This will reset all stats and accumulated data."}
          </p>
          <div className="flex gap-2">
            <button
              onClick={confirmAndExecute}
              className="px-4 py-1.5 bg-accent-red text-white rounded-lg text-xs font-semibold"
            >
              Confirm
            </button>
            <button
              onClick={() => setConfirmAction(null)}
              className="px-4 py-1.5 border border-bg-border text-text-secondary rounded-lg text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
