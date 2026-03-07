"use client";

import { useMetricsStore } from "@/store/metricsStore";
import { cn } from "@/lib/formatters";

export default function ConnectionStatus() {
  const status = useMetricsStore((s) => s.connectionStatus);
  const reconnectCount = useMetricsStore((s) => s.reconnectCount);

  const statusConfig = {
    connected: { label: "Connected", color: "bg-accent-green", pulse: true },
    disconnected: { label: "Disconnected", color: "bg-accent-red", pulse: false },
    reconnecting: { label: `Reconnecting (${reconnectCount})`, color: "bg-accent-amber", pulse: true },
  };

  const config = statusConfig[status];

  return (
    <div className="flex items-center gap-2 text-xs text-text-secondary">
      <span className={cn("w-2 h-2 rounded-full", config.color, config.pulse && "animate-pulse")} />
      <span>{config.label}</span>
    </div>
  );
}
