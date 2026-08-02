<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-02 | Updated: 2026-08-02 -->

---
scope: tests/admin
depends_on:
  - src/routes/admin
  - src/services/provider-settings.service
  - src/config/database
  - src/config/redis
  - src/config/queue
  - src/workers/retention.worker
status: complete
---

# admin

## Tujuan Folder Ini

Unit/API tests untuk route admin (Fastify). Pola utama: `jest.isolateModules()` + `require("../../src/routes/admin")` untuk mengisolasi instance route, lalu hit via `supertest` dengan header Basic auth (`adminAuthHeader`). Tidak butuh server live.

## Ekspor

Tidak ada ekspor publik — folder berisi file test saja.

## Interface Utama

| File | Yang Diuji |
|------|-----------|
| `dashboard.test.ts` | `GET /api/admin/settings/providers` → `ProviderSettingsService.getDynamicSettings` / `getSortedVideoProviders`; `GET /api/admin/transactions/transfers` → `prisma.transaction.findMany` (via prisma mock terisolasi) |

## Dependensi Internal

- `src/routes/admin` — modul route yang di-require ulang per test
- `src/services/provider-settings.service` — service provider settings
- `src/config/database` (mock), `src/config/redis` (mock), `src/config/queue` (mock) — dari `tests/setup-mocks.ts`
- `src/workers/retention.worker` — relevan untuk ekosistem admin/service

## Issue Spesifik

- Hanya 1 file test di folder ini; cakupan route admin lain (user management, broadcast, dll.) belum punya test di sini.
- Tests bergantung pada mock Prisma dari `setup-mocks.ts` — jika shape mock berubah, `dashboard.test.ts` bisa rusak tanpa perubahan pada kode sumber.

## Rekomendasi Perbaikan Scoped

- Tambahkan test untuk route admin lain yang belum tercakup (mengikuti pola `isolateModules` + supertest yang sudah ada).
- Pisahkan helper `adminAuthHeader` ke `tests/utils/` agar bisa dipakai ulang.

> Last updated: 2026-08-02 — dibuat ulang dengan forensik terhadap isi folder; 1 file (dashboard.test.ts) diverifikasi penuh.
