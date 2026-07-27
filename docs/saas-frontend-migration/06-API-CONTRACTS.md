# API Contracts

> All endpoint shapes for every page. Agents MUST reference this when building React pages.
> Current: Endpoints verified from backend route files.

---

## Generic Conventions

| Convention | Standard |
|-----------|----------|
| Auth | Cookie `admin_token` for admin, JWT `Bearer` for customer |
| Errors | `{ error: string }` with `4xx` / `5xx` status codes |
| Rate limit | `{ error: "Rate limit: ..." }` with `429` |
| Success (POST/PUT/DELETE) | `{ ok: true }` or `{ success: true }` (inconsistent — handle both) |
| IDs | UUID format (string) |
| Dates | ISO 8601 strings |

---

## A. Admin API Endpoints

### A1. Dashboard

```
GET /api/admin/dashboard
→ {
    totalUsers: number
    totalVideos: number
    totalTransactions: number
    activeUsers: number
    usersGrowth?: { value: number; percentage: number }
    videosGrowth?: { value: number; percentage: number }
    revenueGrowth?: { value: number; percentage: number }
    // current: returns AnalyticsData shape from dashboard-api.ts
  }
```

### A2. Fanpages

```
GET /api/fanpages
→ Fanpage[] where Fanpage {
    id: string
    pageName: string
    pageId: string
    fanCount: number
    isActive: boolean
    accessToken: string | null
    createdAt: string
    updatedAt: string
  }

POST /api/fanpages
→ { id: string, pageName: string, pageId: string }  // created record
Body: { pageName: string, pageId: string, accessToken?: string }

PUT /api/fanpages/:id
→ { ok: true }
Body: { pageName?: string, pageId?: string, accessToken?: string, isActive?: boolean }
Note: fanpage.ts uses PUT not PATCH

DELETE /api/fanpages/:id
→ { ok: true }
```

### A3. Prompts

```
GET /api/admin-prompts
→ AdminPrompt[] where AdminPrompt {
    id: number
    prompt: string
    category: string
    params: any
    isActive: boolean
    createdAt: string
  }

POST /api/admin-prompts
→ { ok: true }
Body: { prompt: string, category: string, params?: any, isActive?: boolean }

PUT /api/admin-prompts/:id  (id is number, not UUID)
→ { ok: true }
Body: { prompt?: string, category?: string, params?: any, isActive?: boolean }

DELETE /api/admin-prompts/:id
→ { ok: true }
```

### A4. Pricing

```
GET /api/pricing/:category
→ PricingConfig[] where PricingConfig {
    id: number
    category: string    // "package" | "subscription" | "video_credit" | "image_credit" | "provider_cost" | "global" | "unit_cost"
    key: string
    value: string
    createdAt: string
  }
Params: category (string path param)

POST /api/pricing
→ { success: true }
Body: { category: string, key: string, value: string }

DELETE /api/pricing
→ { success: true }
Body: { category: string, key: string }

GET /api/pricing-overview
→ {
    packages: PricingConfig[]
    subscriptions: PricingConfig[]
    videoCosts: PricingConfig[]
    imageCosts: PricingConfig[]
    providerCosts: PricingConfig[]
    global: PricingConfig[]
    unitCosts: PricingConfig[]
  }

GET /api/pricing-recommendation
→ {
    avgVideoSceneCostUsd: number
    maxVideoSceneCostUsd: number
    avgVideoCostIdr: number
    videoCreditUnitCost: number
    unitCost: number
    margin: number
    recommendedPricePerVideo: number
    currentPricePerVideo: number
    videoCostBreakdown: Array<{ provider: string; costUsd: number; costIdr: number }>
  }
```

### A5. Fanpage Interception

```
GET /api/interceptions
→ Interception[] where Interception {
    id: number
    pageId: string
    fanpageName?: string
    interceptType: string
    status: string
    interceptUrl?: string
    uploadUrl?: string
    createdAt: string
  }

> Note: Data is fetched from Prisma, shape may vary. Check interception service for exact type.

GET /api/intercept/toggle
POST /api/intercept/upload
POST /api/intercept/deliver
→ { success: boolean } or { ok: true }
```

### A6. AI Config

```
GET /api/admin/ai-tasks/settings
→ AITaskSettings  (full settings object)

POST /api/admin/ai-tasks/settings
→ { ok: true }
Body: any partial settings object

GET /api/admin/ai-config
→ AIConfig (full config from AIConfigService.getFullConfig())

POST /api/admin/ai-config/tasks
→ { ok: true }

POST /api/admin/ai-config/prompts
→ { ok: true }

POST /api/admin/ai-config/chat
→ { ok: true }

POST /api/admin/ai-config/reset
→ { ok: true }
```

### A7. Custom Providers

```
GET /api/admin/custom-providers
→ CustomProvider[] where CustomProvider {
    id: string (UUID)
    name: string
    provider: string
    apiKey: string (masked)
    baseUrl: string
    models: string[]
    isActive: boolean
    createdAt: string
  }

POST /api/admin/custom-providers
→ CustomProvider (created record)
Body: { name: string, provider: string, apiKey: string, baseUrl: string, models?: string[] }

PUT /api/admin/custom-providers/:id
→ CustomProvider (updated record)

DELETE /api/admin/custom-providers/:id
→ { ok: true }

POST /api/admin/custom-providers/:id/fetch-models
→ { ok: true, count: number, models: string[] }

POST /api/admin/custom-providers/:id/test
→ { success: boolean } or test result

POST /api/admin/custom-providers/:id/check-balance
→ { success: true, balance: number } | { success: false, error: string }
```

### A8. Models Catalog

```
GET /api/admin/models-catalog
→ {
    models: ModelEntry[]
    total: number
    visionCount: number
  }
  where ModelEntry {
    id: string
    name: string
    provider: string
    providerName: string
    family: string
    vision: boolean
    reasoning: boolean
    toolCall: boolean
    openWeights: boolean
    inputModalities: string[]
    outputModalities: string[]
    contextWindow: number | null
    outputLimit: number | null
    releaseDate: string | null
  }
  Note: Cached in Redis for 1 hour. Returns 400+ models.
```

### A9. AI Chat (Admin Playground)

```
POST /api/admin/ai-chat
→ { reply: string, model: string }
Body: { message: string, model?: string }
Headers: Cookie: admin_token=...
Note: Rate-limited to 10 messages/minute/IP
```

### A10. Books / Comics / Movies

```
GET /api/books
→ Book[] where Book { id: string, title: string, ... }

POST /api/books
→ Book (created record)
Body: { title: string, content?: string, ... }

GET /api/books/:id
→ Book (single record)

--- Comics & Movies follow same pattern ---

GET /api/comics
POST /api/comics
GET /api/comics/:id

GET /api/movies
POST /api/movies
GET /api/movies/:id
```

### A11. Admin Config (System Settings)

```
GET /api/admin/env           → { keys: Array<{ name: string, value: string (masked) }> }
GET /api/admin/env/:name     → { name: string, value: string (masked) }
PUT /api/admin/env/:name     → { ok: true }
Body: { value: string }

GET /api/admin/env/expose    → { keys: Array<{ name: string, value: string }> }  (unmasked)

GET /api/admin/config/:category/:key  → { value: unknown }
PUT /api/admin/config/:category/:key  → { ok: true }
Body: { value: unknown }
```
**Categories:** `provider`, `ai_param`, `timeout`, `retry`, `queue`, `retention`, `rate_limit`, `hpas`

---

## B. Customer API Endpoints

### B1. Auth

```
POST /auth/telegram
→ { token: string, user: User }
Body: { id: number, first_name: string, username?: string, photo_url?: string, auth_date: number, hash: string }
```

### B2. User

```
GET /api/user
→ User { id: number, telegramId: number, name: string, credits: number, role: string, subscriptionTier: string, referralCode: string }

PUT /api/user
→ { ok: true, credits?: number }
Body: { name?: string, language?: string, notifications?: boolean }
```

### B3. Video

```
POST /api/video/create
→ { jobId: string, status: string }
Body: { niche: string, style: string, duration: number, script: string, ... }

GET /api/user/videos
→ Video[] where Video { id: string, title: string, status: string, jobId: string, createdAt: string, thumbnail?: string }
Query: cursor?, limit? (default 20)

GET /api/video/:jobId
→ Video (full detail)
```

### B4. Billing

```
GET /api/packages
→ Package[] where Package { id: string, name: string, price: number, credits: number, isActive: boolean }

POST /api/payment/create
→ { paymentUrl: string, transactionId: string }
Body: { packageId: string, gateway: "tripay" | "duitku" | "midtrans" }

GET /api/my/transactions
→ Transaction[] where Transaction { id: string, amount: number, status: string, gateway: string, createdAt: string }

GET /api/subscriptions
→ Subscription[] where Subscription { id: string, plan: string, status: string, expiresAt: string }
```

### B5. Referral

```
GET /api/referral
→ { code: string, count: number, earnings: number }

POST /api/user/p2p-transfer
→ { ok: true, newBalance: number }
Body: { telegramId: number, amount: number }
```

---

## C. No-API Pages (Static / Client-Side Only)

These pages have no backend API — implement as client-side static UI:

| Page | Implementation |
|------|---------------|
| Captions | Local state only |
| CloakBrowser | Local state only |
| Engagement | Local state only |
| Trending | Local state only (or scrape) |
| Calendar | Local state only |
| A/B Tests | Local state or add API |
| Video Tools | Tool grid (static) |
| Repurpose | Static UI |
| Research | Static content |
| Medias | Local file grid |
| Looping | Form UI (static) |
| Remeta | Form UI (static) |
| TTS | Static form UI |
| Music | Static form + audio playback |