"use client";

import { useEffect, useState, useCallback } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useMetricsStore } from "@/store/metricsStore";
import { fetchAdminOverview, fetchDeployerStats, fetchBots } from "@/lib/api";
import type { AdminOverview } from "@/lib/types";
import GlobalOverview from "@/components/admin/GlobalOverview";
import DeployerTable from "@/components/admin/DeployerTable";
import AggregatedCharts from "@/components/admin/AggregatedCharts";
import LiveLogs from "@/components/admin/LiveLogs";
import ConnectionStatus from "@/components/shared/ConnectionStatus";

interface LogEntry {
  timestamp: string;
  level: string;
  bot_id: number;
  event: string;
  details?: string;
}

export default function AdminPage() {
  const [botPnlData, setBotPnlData] = useState<Array<{ name: string; pnl: number }>>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  useWebSocket();

  const loadData = useCallback(async () => {
    try {
      const [overview, botsResp] = await Promise.all([
        fetchAdminOverview(),
        fetchBots(),
      ]);
      const pnlData = overview.bots.map((b) => ({
        name: b.name,
        pnl: 0,
      }));
      setBotPnlData(pnlData);
    } catch {
      // API not available yet
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [loadData]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-text-primary">
          Admin Dashboard
        </h1>
        <ConnectionStatus />
      </div>

      <GlobalOverview />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="rounded-xl border border-bg-border bg-bg-surface p-4">
          <h2 className="mb-4 text-lg font-medium">Deployer Comparison</h2>
          <DeployerTable />
        </div>
        <div className="rounded-xl border border-bg-border bg-bg-surface p-4">
          <h2 className="mb-4 text-lg font-medium">Aggregated Charts</h2>
          <AggregatedCharts botPnlData={botPnlData} />
        </div>
      </div>

      <div className="rounded-xl border border-bg-border bg-bg-surface p-4">
        <h2 className="mb-4 text-lg font-medium">Live Logs</h2>
        <LiveLogs logs={logs} />
      </div>
    </div>
  );
}
