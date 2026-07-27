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
  const res = await fetch(`${API_BASE}/api/admin/dashboard`);
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

// ── Auth helpers (cookie-based, credentials: include) ──

export async function checkAuth(): Promise<{ authenticated: boolean }> {
  const res = await fetch(`${API_BASE}/api/admin/check-auth`, { credentials: "include" });
  return res.json();
}

export async function login(password: string): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ password }),
  });
  if (!res.ok) return { success: false };
  return res.json();
}

export async function logout(): Promise<void> {
  await fetch(`${API_BASE}/api/admin/logout`, { method: "POST", credentials: "include" });
}

// ── Pricing API ──

export interface PricingOverview {
  packages: Record<string, { name?: string; price?: number; credits?: number; bonus?: number; popular?: boolean }>;
  subscriptions: Record<string, { name?: string; monthlyIdr?: number; yearlyIdr?: number; monthlyCredits?: number; dailyLimit?: number }>;
  videoCosts: Record<string, number>;
  imageCosts: Record<string, number>;
  providerCosts: Record<string, { costUsd?: number }>;
  global: Record<string, { value?: number } | number>;
  unitCosts: Record<string, number>;
}

export interface PricingRecommendation {
  usdToIdr: number;
  targetMarginPercent: number;
  recommendations: Record<string, {
    current: number;
    apiCostUsd: number;
    apiCostUsdMax: number;
    minUnits: number;
    description: string;
  }>;
}

export async function fetchPricingOverview(): Promise<PricingOverview> {
  const res = await fetch(`${API_BASE}/api/pricing-overview`);
  if (!res.ok) throw new Error(`Pricing overview fetch failed: ${res.status}`);
  return res.json();
}

export async function fetchPricingRecommendation(): Promise<PricingRecommendation> {
  const res = await fetch(`${API_BASE}/api/pricing-recommendation`);
  if (!res.ok) throw new Error(`Pricing recommendation fetch failed: ${res.status}`);
  return res.json();
}

export async function savePricingConfig(category: string, key: string, value: unknown): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/api/pricing`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ category, key, value }),
  });
  if (!res.ok) throw new Error(`Save pricing failed: ${res.status}`);
  return res.json();
}

export async function deletePricingConfig(category: string, key: string): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/api/pricing`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ category, key }),
  });
  if (!res.ok) throw new Error(`Delete pricing failed: ${res.status}`);
  return res.json();
}

// ── Playground API ──

export interface PlaygroundModelsResponse {
  models: string[];
  videoProviders: string[];
  imageProviders: string[];
}

export interface PlaygroundTextResponse {
  success: boolean;
  content?: string;
  error?: string;
}

export interface PlaygroundImageResponse {
  success: boolean;
  imageUrl?: string;
  provider?: string;
  error?: string;
}

export interface PlaygroundVideoResponse {
  success: boolean;
  videoUrl?: string;
  provider?: string;
  error?: string;
}

export async function fetchPlaygroundModels(): Promise<PlaygroundModelsResponse> {
  const res = await fetch(`${API_BASE}/api/admin/playground/models`);
  if (!res.ok) throw new Error(`Fetch playground models failed: ${res.status}`);
  return res.json();
}

export async function runPlaygroundText(prompt: string, model?: string): Promise<PlaygroundTextResponse> {
  const res = await fetch(`${API_BASE}/api/admin/playground/text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ prompt, model }),
  });
  if (!res.ok) throw new Error(`Playground text failed: ${res.status}`);
  return res.json();
}

export async function runPlaygroundImage(prompt: string, provider?: string, aspectRatio?: string): Promise<PlaygroundImageResponse> {
  const res = await fetch(`${API_BASE}/api/admin/playground/image`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ prompt, provider, aspectRatio }),
  });
  if (!res.ok) throw new Error(`Playground image failed: ${res.status}`);
  return res.json();
}

export async function runPlaygroundVideo(prompt: string, provider?: string, niche?: string, duration?: number): Promise<PlaygroundVideoResponse> {
  const res = await fetch(`${API_BASE}/api/admin/playground/video`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ prompt, provider, niche, duration }),
  });
  if (!res.ok) throw new Error(`Playground video failed: ${res.status}`);
  return res.json();
}
