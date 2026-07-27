# Phase 3: Public Pages Migration

> **Goal:** Landing page, FAQ, TOS, Privacy → React
> **Estimated effort:** 3-5 agent-hours
> **Parallelizable:** All pages at once (4 agents)
> **Risk:** 🟢 LOW

---

## Task Breakdown

### T44 — Landing Page
```
📋 Task: Landing Page
Route: / → React Landing.tsx
Pattern: Custom (marketing page)
Current: landing.ejs (3,402 lines — monolithic)
Estimated effort: 3h
Complexity: 🟡 MEDIUM

Dependencies:
- Dynamic content from Redis: GET /api/landing-config
- Multi-language: id/en
- Dynamic pricing from DB: GET /api/pricing-overview
- Analytics pixels: FB, GA4, TikTok
- CSS: ~800 lines inline

Acceptance criteria:
- Hero section with animated elements
- Features section (AI content creation, video tools, etc.)
- Pricing section (dynamic from API)
- FAQ accordion
- Testimonials carousel
- Multi-language toggle (id/en)
- Analytics pixels fire correctly
- Responsive/mobile-friendly
- Same SEO meta tags as current EJS version
```

### T45 — FAQ Page
```
📋 Task: FAQ Page
Route: /faq → React Faq.tsx
Pattern: Simple static page
Current: faq.ejs (~100 lines)
Estimated effort: 0.5h
Notes: Static accordion list of questions/answers
```

### T46 — Terms of Service
```
📋 Task: Terms of Service
Route: /terms → React Tos.tsx
Pattern: Simple static page
Current: tos.ejs (~200 lines)
Estimated effort: 0.5h
Notes: Render as formatted markdown or HTML
```

### T47 — Privacy Policy
```
📋 Task: Privacy Policy
Route: /privacy → React Privacy.tsx
Pattern: Simple static page
Current: privacy.ejs (~150 lines)
Estimated effort: 0.5h
Notes: Render as formatted markdown or HTML
```

---

## Landing Page Key Sections (from landing.ejs)

| Section | Implementation | Data Source |
|---------|---------------|-------------|
| Navbar | Static React component | Static |
| Hero | Static + animated CSS | Static |
| Features | Static grid | Static |
| How It Works | Static steps | Static |
| Pricing | Dynamic cards | `GET /api/pricing-overview` |
| Testimonials | Static array (from Redis?) | `GET /api/landing-config` or static |
| FAQ | Static accordion | Static |
| Footer | Static | Static |
| Language toggle | React state (id/en) | Localized strings in code/JSON |

---

## Fastify Integration

```ts
// src/routes/web.ts — Replace EJS routes

// Landing page → serve React landing HTML
server.get('/', async (_req, reply) => {
  return reply.sendFile('index.html', path.join(__dirname, '../../admin-ui/dist'));
});

// FAQ / TOS / Privacy — these can either be:
// Option A: React SPA routes (recommended)
server.get('/faq', async (_req, reply) => {
  return reply.sendFile('index.html', path.join(__dirname, '../../admin-ui/dist'));
});
// Option B: Static HTML from file
// server.get('/faq', async (_req, reply) => {
//   return reply.sendFile('faq.html', path.join(__dirname, '../../public'));
// });
```

---

## SEO Considerations

Landing page is the most SEO-critical page. Must preserve:

- [ ] `<title>` tag with keywords
- [ ] `<meta name="description">` tag
- [ ] Open Graph tags (`og:title`, `og:description`, `og:image`)
- [ ] Twitter card tags
- [ ] Structured data (JSON-LD) for business
- [ ] Sitemap generation (if applicable)
- [ ] Noindex on FAQ/TOS/Privacy if desired

These can all be handled via `<Helmet>` (react-helmet-async) in React.
