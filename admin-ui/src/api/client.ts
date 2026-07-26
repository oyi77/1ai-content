const API_BASE = ""; // same origin

export interface AnalyticsData {
  todayMetrics: {
    newUsers: number;
    activeUsers: number;
    totalTransactions: number;
    revenue: string;
    creditsUsed: number;
  };
  activeUsersList: Array<{
    id: string;
    username: string;
    tier: string;
    status: string;
    lastActivity: string;
  }>;
  providerHealth: Record<string, "online" | "degraded" | "offline">;
  topNiches: Array<{ name: string; count: number }>;
  recentErrors: Array<{
    id: string;
    message: string;
    source: string;
    timestamp: string;
    severity: "error" | "warning";
  }>;
}

export async function fetchAnalytics(): Promise<AnalyticsData> {
  const res = await fetch(`${API_BASE}/api/analytics`);
  if (!res.ok) throw new Error(`Analytics fetch failed: ${res.status}`);
  return res.json();
}

export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`);
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`);
  return res.json();
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${url} failed: ${res.status}`);
  return res.json();
}
