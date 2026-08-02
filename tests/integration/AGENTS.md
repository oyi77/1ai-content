<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-02 | Updated: 2026-08-02 -->

---
scope: tests/integration
depends_on:
  - src/services/payment-settings.service
  - src/services/payment.service
  - src/config/pricing
  - src/config/database
  - src/services/video.service
  - src/config/queue
status: complete
---

# integration

## Tujuan Folder Ini

Test integrasi antar-komponen: service payment + pricing sync dan pipeline video. Memakai mock Prisma (spy pada `prisma.pricingConfig.findMany`, mock `prisma.video`) untuk memverifikasi alur antar-service tanpa database nyata.

## Ekspor

Tidak ada ekspor publik — folder berisi file test saja.

## Interface Utama

| File | Yang Diuji |
|------|-----------|
| `sync-verification.test.ts` | `PaymentSettingsService` + `PaymentService` + `getPackagesAsync` / `getSubscriptionPlansAsync` (dari `src/config/pricing`); verifikasi `createTransaction` dipanggil dengan `amountIdr: 1000` dan `creditsAmount: 150` |
| `video-pipeline.test.ts` | `VideoService.createJob` / `updateStatus` / `getByJobId` dengan mock `prisma.video`; job id `"test-integration-job"`; path refund |

## Dependensi Internal

- `src/services/payment-settings.service`, `src/services/payment.service` — alur payment
- `src/config/pricing` — `getPackagesAsync`, `getSubscriptionPlansAsync`
- `src/services/video.service` — alur video
- `src/config/database` (mock), `src/config/queue` (mock) — dari `tests/setup-mocks.ts`

## Issue Spesifik

- Test bergantung pada struktur `pricingConfig.findMany` dan shape `PaymentService.createTransaction` — perubahan signature service akan mematahkan test.
- Cakupan integration test sangat tipis (2 file) relatif terhadap luas service di `src/services/`.

## Rekomendasi Perbaikan Scoped

- Tambahkan integration test untuk alur subscribe → generate → refund yang melibatkan beberapa service sekaligus.
- Gunakan fixture dari `tests/fixtures/index.ts` untuk data payment/video agar konsisten.

> Last updated: 2026-08-02 — dibuat ulang dengan forensik terhadap isi folder; 2 file diverifikasi penuh.
