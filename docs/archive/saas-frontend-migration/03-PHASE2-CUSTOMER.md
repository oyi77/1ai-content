# Phase 2: Customer Web App Migration

> **Goal:** Migrate `/app` vanilla EJS SPA → React
> **Estimated effort:** 10-14 agent-hours
> **Parallelizable:** Up to 3 agents (Auth + Simple pages can start first)
> **Risk:** 🔴 HIGH — payment flow, multi-step wizard, JWT auth

---

## Current Architecture

```
/app (EJS rendered at server, then client-side "SPA")
├── Server-rendered: <head>, navbar, sidebar, containers
├── 13 EJS partials injected as hidden <div>s
├── Vanilla JS nav() function: show/hide views
├── apiFetch() wrapper: adds localStorage JWT token
└── Inline CSS (~300 lines) + Inline JS (~500 lines)
```

**How it works:**
1. Server renders `app.ejs` with all 13 partials as hidden `<div>` containers
2. Client JS fetches user data, then shows active "view" via `nav('dashboard')`
3. Each view fetches its own data via `apiFetch()` and renders via `innerHTML`
4. JWT token stored in `localStorage`

---

## Migration Strategy: Option A (Co-located in admin-ui)

**Keep in same Vite project as admin SPA.** Add a new router tree.

### File Structure Additions

```
admin-ui/src/
├── pages/customer/
│   ├── Login.tsx
│   ├── Dashboard.tsx
│   ├── CreateVideo.tsx
│   ├── AIImage.tsx
│   ├── MyVideos.tsx
│   ├── Billing.tsx
│   ├── Subscription.tsx
│   ├── Referral.tsx
│   ├── SendBalance.tsx
│   ├── Profile.tsx
│   └── Settings.tsx
├── components/
│   ├── CustomerLayout.tsx
│   ├── WizardStepper.tsx
│   ├── VideoCard.tsx
│   └── PackageCard.tsx
├── hooks/
│   ├── useCustomerAuth.ts
│   └── useVideoStatus.ts
├── context/
│   └── CustomerAuthContext.tsx
└── styles/
    └── customer-skin.css
```

### Fastify Integration

In `src/index.ts` or `src/routes/web.ts`:
```ts
// Serve React customer app
server.register(fastifyStatic, {
  root: path.join(__dirname, '../../admin-ui/dist'),
  prefix: '/app/',
  decorateReply: false,
});

// SPA fallback for /app/*
server.get('/app/*', async (_req, reply) => {
  return reply.sendFile('index.html', path.join(__dirname, '../../admin-ui/dist'));
});
```

---

## Task Breakdown

### T34 — Customer Auth System
```
📋 Task: Customer Auth (Context + Login)
Route: /app/login → React Login.tsx
Pattern: Custom (auth context)
API: POST /auth/telegram, GET /api/user
Files to create:
  - admin-ui/src/context/CustomerAuthContext.tsx
  - admin-ui/src/hooks/useCustomerAuth.ts
  - admin-ui/src/pages/customer/Login.tsx
  - admin-ui/src/components/CustomerLayout.tsx
  - admin-ui/src/styles/customer-skin.css
Files to modify:
  - admin-ui/src/App.tsx (add customer routes)
  - src/routes/web.ts (add /app/* SPA handler)
Estimated effort: 3h
Acceptance criteria:
  - JWT auth via localStorage works
  - Login screen displays if no token
  - API calls include Bearer token
  - Logout clears token
```

### T35 — Customer Dashboard
```
📋 Task: Customer Dashboard
Route: /app/dashboard → React Dashboard.tsx
Pattern: D (Dashboard Widget)
API: GET /api/user, GET /api/user/videos
Dependencies: T34 (auth context)
Estimated effort: 1.5h
Notes:
  - Stats cards: credits, total videos, referral code, tier
  - Quick actions: create video, top up, my videos, referral
  - Recent videos grid (last 10)
```

### T36 — Customer Profile & Settings
```
📋 Task: Profile & Settings
Route: /app/profile, /app/settings
Pattern: C (Form Submit)
API: GET /api/user, PUT /api/user
Dependencies: T34
Estimated effort: 1.5h
Acceptance criteria:
  - View/edit name
  - Language selector
  - Notification toggle
  - Save updates via PUT /api/user
```

### T37 — My Videos
```
📋 Task: My Videos
Route: /app/videos → React MyVideos.tsx
Pattern: Custom (video grid + pagination)
API: GET /api/user/videos, GET /api/video/:jobId
Dependencies: T34
Estimated effort: 2h
Notes:
  - Infinite scroll / pagination (cursor-based)
  - Video cards with thumbnail, title, status badge
  - Click to view details
  - Status polling for "processing" videos
```

### T38 — Billing & Top Up
```
📋 Task: Billing & Top Up
Route: /app/billing → React Billing.tsx
API: GET /api/packages, POST /api/payment/create, GET /api/my/transactions
Dependencies: T34
Estimated effort: 3h
Notes:
  - Package cards (Starter/Basic/Pro pricing)
  - Gateway selector (Tripay/Duitku/Midtrans)
  - Transaction history table
  - 🔴 Payment flow must be verified E2E
```

### T39 — Subscription Management
```
📋 Task: Subscription Management
Route: /app/subscription → React Subscription.tsx
API: GET /api/subscriptions
Dependencies: T34
Estimated effort: 1h
Notes:
  - Current plan display
  - Subscription expiry
  - Upgrade/downgrade options
```

### T40 — Referral System
```
📋 Task: Referral System
Route: /app/referral → React Referral.tsx
API: GET /api/referral
Dependencies: T34
Estimated effort: 1h
Notes:
  - Show referral code
  - Copy to clipboard
  - Referral stats (count, earnings)
```

### T41 — Send Balance (P2P)
```
📋 Task: Send Balance
Route: /app/send → React SendBalance.tsx
API: POST /api/user/p2p-transfer
Dependencies: T34
Estimated effort: 1h
Notes:
  - Form: Telegram ID + amount
  - Confirmation dialog
  - Result display
```

### T42 — AI Image Generator
```
📋 Task: AI Image Generator
Route: /app/image → React AIImage.tsx
API: POST /api/image/generate
Dependencies: T34
Estimated effort: 2h
Notes:
  - Prompt input
  - Style/model selector
  - Image result display
  - Download option
```

### T43 — Create Video Wizard (COMPLEX)
```
📋 Task: Create Video Wizard
Route: /app/create → React CreateVideo.tsx
Pattern: Custom (6-step wizard)
API: POST /api/video/create, GET /api/storyboard
Dependencies: T34
Estimated effort: 5h  ← LARGEST SINGLE TASK
Notes:
  Steps:
  1. Niche select (grid of niche cards with emoji)
  2. Style select (visual style options)
  3. Duration (slider: 15-60s)
  4. Details (custom prompt, music, voice)
  5. Preview (storyboard preview)
  6. Generate (submit + status tracking)
  
  State: useReducer for wizard state
  API: POST /api/video/create with all wizard data
  Polling: GET /api/video/:jobId for status updates after submit
```

---

## Auth Flow (Customer)

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  User opens  │     │  Check token  │     │  Redirect to  │
│  /app/*      │────→│  in localStorage│────→│  /app/login   │
└─────────────┘     └──────────────┘     └──────────────┘
                           │
                          has token?
                           │
                           ∨
                    ┌──────────────┐
                    │  Validate via  │
                    │  GET /api/user  │
                    └──────────────┘
                           │
                      valid token?
                           │
                    ┌──────┴──────┐
                    │             │
                    ∨             ∨
              ┌──────────┐  ┌──────────┐
              │  Render   │  │ Clear +   │
              │  Content  │  │ Redirect  │
              └──────────┘  └──────────┘
```

**API calls must inject token:**
```ts
const token = localStorage.getItem('token');
fetch('/api/user', {
  headers: { 'Authorization': 'Bearer ' + token }
});
```

---

## Component Library for Customer App

| Component | Props | Used By |
|-----------|-------|---------|
| `<CustomerLayout />` | `{children}` | All customer pages |
| `<WizardStepper />` | `{steps, currentStep}` | Create Video |
| `<NicheCard />` | `{emoji, name, selected, onClick}` | Create Video step 1 |
| `<VideoCard />` | `{title, thumbnail, status, onClick}` | My Videos, Dashboard |
| `<PackageCard />` | `{name, price, credits, recommended}` | Billing |
| `<StatusBadge />` | `{status}` | My Videos |

---

## Phase 2 Success Criteria

- [ ] Customer routes accessible at `/app/dashboard`, `/app/create`, etc.
- [ ] JWT auth flow works end-to-end (login → token → API calls)
- [ ] All customer API endpoints respond correctly
- [ ] Payment flow creates transaction, callback updates credits
- [ ] Create video wizard completes all 6 steps
- [ ] Responsive design (mobile-friendly — many users come from Telegram)
- [ ] No console errors
- [ ] Old `/app` EJS redirects to `/app/dashboard`
