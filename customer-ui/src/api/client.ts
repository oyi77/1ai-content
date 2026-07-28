const API_BASE = "";

function getToken(): string | null {
  return localStorage.getItem("token");
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  const t = getToken();
  if (t) h["Authorization"] = `Bearer ${t}`;
  return h;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: headers(),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || err.message || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  del: <T>(path: string) => request<T>("DELETE", path),

  // User
  getUser: () => request<{ user: any }>("GET", "/api/user"),
  updateProfile: (data: any) => request("PUT", "/api/user/profile", data),
  updateSettings: (data: any) => request("PUT", "/api/user/settings", data),

  // Videos
  getVideos: () => request<{ videos: any[] }>("GET", "/api/videos"),
  createVideo: (data: any) => request("POST", "/api/video/create", data),
  getStoryboard: (id: number) => request(`GET`, `/api/storyboard?id=${id}`),

  // Payments
  getBilling: () => request<{ transactions: any[]; credits: number }>("GET", "/api/pay/history"),
  createQrisPayment: (amount: number) => request("POST", "/api/pay/qris", { amount }),
  createCryptoPayment: (amount: number) => request("POST", "/api/pay/crypto", { amount }),

  // Subscriptions
  getSubscriptions: () => request<{ plans: any[]; current: any }>("GET", "/api/subscriptions"),
  subscribe: (planId: string) => request("POST", "/api/subscriptions", { planId }),

  // Referral
  getReferral: () => request<{ code: string; earnings: number; count: number }>("GET", "/api/referral"),

  // Transfer
  sendBalance: (telegramId: string, amount: number) =>
    request("POST", "/api/transfer", { telegramId, amount }),

  // AI Image
  generateImage: (prompt: string, style?: string) =>
    request("POST", "/api/image/generate", { prompt, style }),
};