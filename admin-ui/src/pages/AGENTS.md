<!-- Parent: ../AGENTS.md -->
<!-- Scope: src/pages | Stack: TypeScript / React | Status: partial | depends_on: [src, src/api] -->
<!-- Generated: 2026-08-02 | Updated: 2026-08-02 -->

# pages

## Purpose
Halaman-halaman SPA, satu file per route. Pola umum: setiap halaman memanggil helper dari `../api/client.ts`, dan route-nya terdaftar di `../App.tsx`.

**Status: partial** — jumlah baris dan route diverifikasi, tetapi hanya ~5 halaman (Login, Settings, ConfigPage, AiConfigPage, dll.) yang diaudit detail. Deskripsi halaman lain berdasarkan nama file + route, belum dibaca isinya.

## Key Files (34 halaman, total 11.998 baris — `Login.tsx` 104 baris DIHAPUS 2026-08-03)

| File | Baris | Route |
|------|------:|-------|
| `ProvidersPage.tsx` | 1042 | `/providers` |
| `ConfigPage.tsx` | 726 | `/config` |
| `MediasPage.tsx` | 621 | `/medias` |
| `Pricing.tsx` | 619 | `/pricing` |
| `InterceptionsPage.tsx` | 609 | `/interceptions` |
| `AiConfigPage.tsx` | 587 | `/ai-config` |
| `ResearchPage.tsx` | 556 | `/research` |
| `BookshelfPage.tsx` | 516 | `/bookshelf` |
| `ComicPage.tsx` | 506 | `/comic` |
| `MoviePage.tsx` | 492 | `/movie` |
| `Analyze.tsx` | 433 | `/analyze` |
| `DynamicPricingPage.tsx` | 427 | `/dynamic-pricing` |
| `PersonasPage.tsx` | 383 | `/personas` |
| `PromptsPage.tsx` | 329 | `/prompts` |
| `SystemPage.tsx` | 301 | `/system` |
| `Autopilot.tsx` | 298 | `/autopilot` |
| `Music.tsx` | 275 | `/music` |
| `CalendarPage.tsx` | 272 | `/analytics/calendar` |
| `Playground.tsx` | 271 | `/playground` |
| `RepurposePage.tsx` | 264 | `/analytics/repurpose` |
| `CarouselPage.tsx` | 263 | `/analytics/carousel` |
| `ABTestsPage.tsx` | 262 | `/analytics/ab-tests` |
| `TrendingPage.tsx` | 248 | `/analytics/trending` |
| `Analytics.tsx` | 204 | `/analytics` |
| `Captions.tsx` | 198 | `/captions` |
| `RemetaPage.tsx` | 194 | `/analytics/remeta` |
| `Tts.tsx` | 172 | `/tts` |
| `Looping.tsx` | 169 | `/looping` |
| `Dashboard.tsx` | 166 | `/dashboard` |
| `Users.tsx` | 140 | `/users` |
| `Settings.tsx` | 122 | `/settings` |
| `Payments.tsx` | 116 | `/payments` |
| `Tools.tsx` | 109 | `/tools` |
| `Content.tsx` | 105 | `/content` |

## Subdirectories

| Directory | Tujuan |
|-----------|--------|
| `tools/` | Halaman tools di bawah `/tools/*` (7 file, 969 baris) — lihat `tools/AGENTS.md` |

## For AI Agents

### Working In This Directory
- Halaman besar (ProvidersPage 1.042, ConfigPage 726, MediasPage 621, Pricing 619, InterceptionsPage 609) adalah kandidat refactor — hindari memperbesar tanpa rencana.
- Tambah halaman baru di sini + daftarkan di `../App.tsx`.
- Semua data via `../api/client.ts`; jangan duplikasi logika fetch di halaman.

### Issue Terverifikasi di Direktori Ini
- **[RESOLVED 2026-08-03]** `Login.tsx` DIHAPUS — dead code (tidak terdaftar di `App.tsx`, zero imports; `/admin/login` dilayani server-side via `src/views/admin/login.ejs`). Issue HIGH "default password" + MEDIUM "tidak terdaftar" ikut terhapus.
- **[LOW]** `ConfigPage.tsx:86-146` — menampilkan daftar nama env key (BOT_TOKEN, ADMIN_PASSWORD, DATABASE_URL, OMNIROUTE_API_KEY, MIDTRANS_SERVER_KEY, AWS_SECRET_ACCESS_KEY, dll.); hanya nama, tanpa nilai, dan `ConfigPage.tsx:613-614` menampilkan nilai sensitive sebagai masked — pastikan tetap begitu saat mengubah halaman ini.
- **[LOW]** `Settings.tsx:112` — link `/admin/login` menuju URL tanpa route SPA.

<!-- MANUAL: -->
