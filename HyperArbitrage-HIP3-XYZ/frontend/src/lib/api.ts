import type {
  AdminOverview,
  AggregatedMetrics,
  Bot,
  BotAction,
  BotConfig,
  BotMetrics,
  DeployerStats,
  Trade,
} from "./types";
import { API_URL } from "./constants";

async function fetchAPI<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_URL}/api/v1${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }

  return res.json();
}

export async function fetchBots(): Promise<{ bots: Bot[]; total: number }> {
  return fetchAPI("/bots/");
}

export async function fetchBot(id: number): Promise<Bot> {
  return fetchAPI(`/bots/${id}`);
}

export async function botAction(id: number, action: BotAction): Promise<void> {
  await fetchAPI(`/bots/${id}/action`, {
    method: "POST",
    body: JSON.stringify({ action }),
  });
}

export async function updateBotConfig(id: number, config: Partial<BotConfig>): Promise<BotConfig> {
  return fetchAPI(`/bots/${id}/config`, {
    method: "PATCH",
    body: JSON.stringify(config),
  });
}

export async function fetchTrades(
  botId: number,
  page = 1,
  pageSize = 50
): Promise<{ trades: Trade[]; total: number; page: number; page_size: number }> {
  return fetchAPI(`/trades/${botId}?page=${page}&page_size=${pageSize}`);
}

export async function fetchOpenTrades(botId: number): Promise<Trade[]> {
  return fetchAPI(`/trades/${botId}/open`);
}

export async function fetchBotMetrics(botId: number): Promise<BotMetrics | null> {
  return fetchAPI(`/metrics/${botId}`);
}

export async function fetchAggregatedMetrics(): Promise<AggregatedMetrics> {
  return fetchAPI("/metrics/");
}

export async function fetchDeployerStats(): Promise<DeployerStats[]> {
  return fetchAPI("/deployers/");
}

export async function fetchAdminOverview(): Promise<AdminOverview> {
  return fetchAPI("/admin/overview");
}

export async function stopAllBots(): Promise<void> {
  await fetchAPI("/admin/stop-all", { method: "POST" });
}

export function getExportCSVUrl(botId: number): string {
  return `${API_URL}/api/v1/trades/${botId}/export/csv`;
}

export function getExportPDFUrl(botId: number): string {
  return `${API_URL}/api/v1/trades/${botId}/export/pdf`;
}
