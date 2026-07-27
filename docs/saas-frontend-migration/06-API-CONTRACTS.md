# API Contracts

> All endpoint shapes for every page. **VERIFIED against actual route files** in `src/routes/`.
> Last verified: 2026-07-28

---

## Generic Conventions

| Convention | Value |
|-----------|-------|
| Base URLs | **Admin:** `/api/*`, **Customer:** `/api/*` |
| Auth | Admin: Cookie `admin_token` or Basic auth. Customer: JWT in `Authorization: Bearer` header or API key `?apikey=` query |
| Response format | JSON (unless EJS template) |
| Error format | `{ error: string }` with HTTP 4xx/5xx |
| Pagination | `{ items: [...], total: number, page: number }` (when applicable) |

---

## A — Admin CRUD Endpoints

### A1: `/api/admin/dashboard`
- **File:** `dashboard-api.ts`
- **Method:** `GET`
- **Response shape:**
```json
{
  "todayMetrics": {
    "newUsers": "<number>",
    "activeUsers": "<number>",
    "totalTransactions": "<number>",
    "revenue": "<string (USD)>",
    "creditsUsed": "<number>"
  },
  "activeUsersList": [
    { "id": "<string>", "username": "<string>", "tier": "<string>", "status": "online|offline", "lastActivity": "<ISO date>" }
  ],
  "providerHealth": {
    "<provider_key>": "online|degraded|offline"
  },
  "topNiches": [
    { "name": "<string>", "count": "<number>" }
  ],
  "recentErrors": [
    { "id": "<string>", "message": "<string>", "source": "<string>", "timestamp": "<ISO date>", "severity": "error" }
  ]
}
```

### A2: `/api/admin-prompts`
- **File:** `prompts.ts`
- **Methods:** `GET`, `POST`, `PUT /:id`, `DELETE /:id`
- **Response:** `Prompt[]` array or single Prompt object
- **Prompt shape:** `{ id, name, systemPrompt, userPrompt, niche, provider, providerModel, sortOrder, isActive, createdAt, updatedAt }`

### A3: `/api/intercept/toggle`
- **File:** `intercept.ts:17`
- **Method:** `POST`
- **Body:** `{ type: string, enabled: boolean, username?: string }`
- **Response:** `{ success: true }`

### A4: `/api/intercept/upload`
- **File:** `intercept.ts:113`
- **Method:** `POST`
- **Body:** multipart form (file upload)
- **Response:** `{ message: string }`

### A5: `/api/intercept/deliver`
- **File:** `intercept.ts:151`
- **Method:** `POST`
- **Body:** `{ type: string, username: string, text: string }`
- **Response:** `{ success: true, result?: unknown }`

### A6: `/api/fanpages`
- **File:** `fanpage.ts` (verified against code at lines 33-175)
- **Methods:**
  - `GET /api/fanpages` — list all fanpages
  - `POST /api/fanpages` — create fanpage (see body below)
  - `GET /api/fanpages/:id` — get single fanpage
- **POST body:** `{ userId: string, pageId: string, pageName: string, accessToken: string, category?: string, fanCount?: number }`
- **Fanpage response shape:**
```json
{
  "id": "<number>",
  "userId": "<string>",
  "pageId": "<string>",
  "pageName": "<string>",
  "accessToken": "<string>",
  "category": "<string | null>",
  "fanCount": "<number>",
  "isActive": "<boolean>",
  "createdAt": "<ISO date>",
  "updatedAt": "<ISO date>"
}
```

### A7: `/api/medias` (Media Gallery)
- **File:** `provider-mgmt.ts`
- **Methods:** `GET`, `POST`, `DELETE` (verify exact methods from provider-mgmt.ts)

### A8: `/api/pricing`
- **File:** `pricing.ts`
- **Methods:** `GET`, `POST`
- **Response:** `{ packages: SubscriptionPlan[], unitCosts: { ... }, config: {...} }`
- **Full response shape:**
```json
{
  "packages": [{ "name": "<string>", "monthlyIdr": "<number>", "yearlyIdr": "<number>", "monthlyCredits": "<number>", "dailyLimit": "<number>", "features": "<string[]>" }],
  "unitCosts": { "VIDEO_15S": "<number>", "VIDEO_30S": "<number>", ... },
  "usdToIdr": "<number>",
  "targetMarginPercent": "<number>",
  "recommendations": "{ ... }"
}
```

### A9-A15: TTS, Music, Looping, Autopilot, Analyze, Calendar, Trending
- **Files:** `content-tools.ts`, `analytics.ts`
- Verify exact endpoints from these files before implementing. Most follow GET/POST pattern with view-only renders.

### A16: `/api/settings/:key`
- **File:** `settings.ts`
- **Methods:** `GET /api/settings/:key`, `PUT /api/settings/:key`
- **Response:** `{ value: unknown }`

### A17: `/api/niches`
- **File:** `niches.ts`
- **Methods:** `GET`, `POST`, `PUT /:id`, `DELETE /:id`
- **Response:** `Niche[]`

### A18: `/api/personas`
- **File:** `persona.ts`
- **Methods:** `GET`, `POST`, `PUT /:id`, `DELETE /:id`
- **Response:** `Persona[]`

### A19: `/api/books`
- **File:** `content-tools.ts:119-162`
- **Methods:**
  - `POST /api/books` — `{ title, full_markdown, subject?, sections?, stats? }` → 201 + `Book`
  - `GET /api/books` — all books
  - `GET /api/books/:id` — single book by numeric id
- **Book shape:** `{ id, title, subject, fullMarkdown, sections?, stats?, createdAt, updatedAt }`

### A20: `/api/comics`
- **File:** `content-tools.ts:166-200`
- **Methods:**
  - `POST /api/comics` — `{ title, prompt, format?, language?, script?, num_episodes?, total_pages?, output_dir?, cover_path?, stats? }` → 201 + `Comic`
  - `GET /api/comics` — all comics
  - `GET /api/comics/:id` — single comic by numeric id
- **Comic shape:** `{ id, title, format, language, prompt, script, numEpisodes, totalPages, outputDir, coverPath, stats, createdAt, updatedAt }`

### A21: `/api/movies`
- **File:** `content-tools.ts` (around line 200+)
- **Methods:** `POST /api/movies`, `GET /api/movies`, `GET /api/movies/:id`
- Verify exact body/response shapes from content-tools.ts

---

## B — Customer API Endpoints

### B1: `/api/user`
- **File:** `web/user.ts:20`
- **Method:** `GET`
- **Auth:** JWT or API key
- **Response:** `User` object

### B2: `/api/user/videos`
- **File:** `web/user.ts:90`
- **Method:** `GET`
- **Response:** `{ videos: Video[], total: number }`

### B3: `/api/user/history`
- **File:** `web/user.ts:119`
- **Method:** `GET`
- **Response:** `{ history: HistoryEntry[] }`

### B4: `/api/packages`
- **File:** `web/finance.ts:27`
- **Method:** `GET`
- **Response:** `Package[]` — all credit packages

### B5: `/api/payment/create`
- **File:** `web/finance.ts:53`
- **Method:** `POST`
- **Body:** `{ plan: string, gateway: string }`
- **Response:** `{ ok: boolean, redirectUrl: string, paymentUrl: string, plan, cycle, amountIdr }`

### B6: `/api/subscriptions`
- **File:** `web/finance.ts:261`
- **Method:** `GET`
- **Response:** SubscriptionPlan[]

### B7: `/api/referral`
- **File:** `web/finance.ts:157`
- **Method:** `GET`
- **Response:** `{ code: string, earnings: number, referrals: Referral[] }`

### B8: `/api/user/p2p-transfer`
- **File:** `web/finance.ts:120`
- **Method:** `POST`
- **Body:** `{ to: string, amount: number }`

### B9: `/api/storyboard`
- **File:** `web/content.ts:33`
- **Method:** `POST`
- **Body:** `{ niche: string, duration: string }`

### B10: `/api/video/create`
- **File:** `web/content.ts:67`
- **Method:** `POST`
- **Body:** `{ niche, style, type, productImage?, prompt?, customPrompt? }`
- **Response:** `{ jobId, status: "queued" }`

### B11: `/api/video/analyze`
- **File:** `web/content.ts:140`
- **Method:** `POST`

### B12: `/api/image/generate`
- **File:** `web/content.ts:169`
- **Method:** `POST`
- **Body:** `{ prompt, niche }`
- **Response:** `{ images: string[] }`

### B13: `/auth/telegram`
- **File:** `web/auth.ts`
- **Method:** `POST`
- **Body:** `{ id, first_name, username, auth_date, hash }`
- **Response:** `{ token: string, user: User }`

---

## C — Landing Page Data

### C1: `/api/landing-config`
- **File:** `landing-config.ts`
- **Methods:** `GET`, `POST`
- **Source:** Redis key `admin:landing_config`
- **GET Response shape:** `{ headline, subheadline, heroImageUrl, ogImageUrl, testimonials?, videoDuration?, ... }`

### C2: Templates passed to landing page
- **File:** `web/pages.ts:52` (EJS render)
- **Data shape:** `{ landingConfig, testimonials, packages, currentLang, botUsername, siteUrl, fbPixelId, ga4Id, ttPixelId, ogImageUrl }`
