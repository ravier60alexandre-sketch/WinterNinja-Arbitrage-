"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/formatters";

interface LogEntry {
  timestamp: string;
  level: string;
  bot_id: number;
  event: string;
  details?: string;
}

interface LiveLogsProps {
  logs: LogEntry[];
}

const LEVEL_COLORS: Record<string, string> = {
  DEBUG: "text-text-secondary",
  INFO: "text-accent-cyan",
  WARNING: "text-accent-amber",
  ERROR: "text-accent-red",
  CRITICAL: "text-accent-red font-bold",
};

export default function LiveLogs({ logs }: LiveLogsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [filterLevel, setFilterLevel] = useState<string>("ALL");
  const [filterBot, setFilterBot] = useState<number | null>(null);

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 50);
  };

  const filteredLogs = logs.filter((log) => {
    if (filterLevel !== "ALL" && log.level !== filterLevel) return false;
    if (filterBot !== null && log.bot_id !== filterBot) return false;
    return true;
  });

  return (
    <div className="bg-bg-surface border border-bg-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-text-primary">Live Logs</h3>
        <div className="flex gap-2">
          <select
            value={filterLevel}
            onChange={(e) => setFilterLevel(e.target.value)}
            className="bg-bg-primary border border-bg-border rounded px-2 py-1 text-[10px] text-text-primary"
          >
            <option value="ALL">All Levels</option>
            <option value="INFO">INFO</option>
            <option value="WARNING">WARNING</option>
            <option value="ERROR">ERROR</option>
          </select>
          <select
            value={filterBot ?? "ALL"}
            onChange={(e) => setFilterBot(e.target.value === "ALL" ? null : parseInt(e.target.value))}
            className="bg-bg-primary border border-bg-border rounded px-2 py-1 text-[10px] text-text-primary"
          >
            <option value="ALL">All Bots</option>
            {[1, 2, 3, 4, 5, 6].map((id) => (
              <option key={id} value={id}>Bot {id}</option>
            ))}
          </select>
        </div>
      </div>

      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-[300px] overflow-y-auto font-mono text-[11px] space-y-0.5"
      >
        {filteredLogs.length === 0 ? (
          <p className="text-text-secondary text-center py-8">No logs</p>
        ) : (
          filteredLogs.map((log, i) => (
            <div key={i} className="flex gap-2 py-0.5 hover:bg-bg-border/20 px-1 rounded">
              <span className="text-text-secondary shrink-0">{new Date(log.timestamp).toLocaleTimeString()}</span>
              <span className={cn("shrink-0 w-16", LEVEL_COLORS[log.level])}>[{log.level}]</span>
              <span className="text-accent-indigo shrink-0">Bot#{log.bot_id}</span>
              <span className="text-text-primary">{log.event}</span>
              {log.details && <span className="text-text-secondary">{log.details}</span>}
            </div>
          ))
        )}
      </div>

      {!autoScroll && (
        <button
          onClick={() => { setAutoScroll(true); }}
          className="mt-2 text-[10px] text-accent-indigo hover:underline"
        >
          Resume auto-scroll
        </button>
      )}
    </div>
  );
}
