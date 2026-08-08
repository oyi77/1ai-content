const API_BASE = "";

function getToken(): string | null {
  return localStorage.getItem("token");
}

function headers(body?: unknown): Record<string, string> {
  const h: Record<string, string> = {};
  // Fastify rejects empty bodies with Content-Type: application/json
  // (FST_ERR_CTP_EMPTY_JSON_BODY 400) — only set it when a body is sent.
  if (body !== undefined) h["Content-Type"] = "application/json";
  const t = getToken();
  if (t) h["Authorization"] = `Bearer ${t}`;
  return h;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: headers(body),
    body: body !== undefined ? JSON.stringify(body) : undefined,
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

  // ── User ──────────────────────────────────────────────
  // Backend: GET /api/user → flat user object
  getUser: () => request<any>("GET", "/api/user"),

  // Backend: PATCH /api/user/settings  (field firstName, not name)
  updateProfile: (data: { name?: string }) =>
    request("PATCH", "/api/user/settings", { firstName: data.name }),

  // Backend: PATCH /api/user/settings  (field notificationsEnabled, not notifications)
  updateSettings: (data: {
    language?: string;
    notifications?: boolean;
    selectedNiche?: string;
    userMode?: string;
  }) =>
    request("PATCH", "/api/user/settings", {
      language: data.language,
      notificationsEnabled: data.notifications,
      selectedNiche: data.selectedNiche,
      userMode: data.userMode,
    }),

  // Backend: POST /api/user/bonus/welcome → { granted, creditBalance }
  claimWelcomeBonus: () =>
    request<{ granted: boolean; creditBalance: number }>("POST", "/api/user/bonus/welcome"),

  // ── Videos ────────────────────────────────────────────
  getVideos: () => request<{ videos: any[] }>("GET", "/api/user/videos"),
  createVideo: (data: any) => request("POST", "/api/video/create", data),

  // Backend: POST /api/storyboard (body { niche, duration, customPrompt })
  getStoryboard: (params: { niche: string; duration?: number; customPrompt?: string }) =>
    request("POST", "/api/storyboard", params),

  // ── Payments ──────────────────────────────────────────
  // Backend: GET /api/my/transactions → flat array
  getBilling: async () => {
    const [transactions, user] = await Promise.all([
      request<any[]>("GET", "/api/my/transactions"),
      request<any>("GET", "/api/user"),
    ]);
    return { transactions, credits: user?.credits ?? 0 };
  },

  // Unified backend: POST /api/payment/create { packageId, gateway }
  createQrisPayment: (amount: number) =>
    request("POST", "/api/payment/create", {
      packageId: `topup_${amount}`,
      gateway: "tripay",
    }),

  createCryptoPayment: (amount: number) =>
    request("POST", "/api/payment/create", {
      packageId: `topup_${amount}`,
      gateway: "nowpayments",
    }),

  // ── Subscriptions ─────────────────────────────────────
  // Backend: GET /api/subscriptions → Record<string, plan> (dict, key=plan id)
  getSubscriptions: async () => {
    const dict = await request<Record<string, any>>("GET", "/api/subscriptions");
    const plans = Object.entries(dict).map(([id, plan]) => ({ id, ...plan }));
    return { plans, current: null };
  },

  // Backend: POST /api/subscription/buy { plan, cycle, gateway }
  subscribe: (planId: string) =>
    request("POST", "/api/subscription/buy", {
      plan: planId,
      cycle: "monthly",
      gateway: "tripay",
    }),

  // ── Referral ──────────────────────────────────────────
  // Backend returns { referralCode, referralLink, referralCount, commissionEarned, ... }
  getReferral: async () => {
    const data = await request<any>("GET", "/api/referral");
    return { code: data.referralCode, link: data.referralLink, earnings: data.commissionEarned, count: data.referralCount };
  },

  // ── Transfer ──────────────────────────────────────────
  // Backend: POST /api/user/p2p-transfer { recipientUsername, amount (string) }
  sendBalance: (recipientUsername: string, amount: number) =>
    request("POST", "/api/user/p2p-transfer", {
      recipientUsername,
      amount: String(amount),
    }),

  // ── AI Image ──────────────────────────────────────────
  generateImage: (prompt: string, style?: string) =>
    request("POST", "/api/image/generate", { prompt, style }),
};