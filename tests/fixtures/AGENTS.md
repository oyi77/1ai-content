<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-02 | Updated: 2026-08-02 -->

---
scope: tests/fixtures
depends_on:
  - @prisma/client (schema prisma/schema.prisma)
  - @prisma/client/runtime/library.js (Decimal)
status: complete
---

# fixtures

## Tujuan Folder Ini

Data fixture + helper pembuat context untuk test Jest. Sumber data mock terpusat agar test tidak menduplikasi objek Prisma.

## Ekspor

Dari `index.ts`:

- Fixture objek: `mockUser`, `mockPremiumUser`, `mockVideo`, `mockProcessingVideo`, `mockFailedVideo`, `mockTransaction`, `mockPendingTransaction`, `mockSubscription`, `mockCommission`, `mockSocialAccount`, `mockAvatar`, `mockSavedPrompt`, `mockProviderHealth`, `mockUnhealthyProvider`, `mockPromptCache`, `mockPricingConfig`, `mockAnalytics`
- Tipe: `MockBotContext` (interface)
- Helper: `createMockContext(overrides)`, `createMockCallbackContext(data, overrides)`

## Interface Utama

| File | Isi |
|------|-----|
| `index.ts` | Seluruh fixture + helper di atas |

## Dependensi Internal

- `@prisma/client` — tipe data mengikuti schema Prisma (`prisma/schema.prisma`)
- `@prisma/client/runtime/library.js` — `Decimal` untuk field moneter

## Issue Spesifik

- Fixture mengikuti schema Prisma; jika schema berubah (rename field, tipe baru), fixture bisa kedaluwarsa tanpa error test langsung (runtime baru terlihat saat digunakan).
- Tidak ada `AGENTS.md` sebelum file ini — fixture sering dianggap "sepele" sehingga perubahannya tidak terdokumentasi.

## Rekomendasi Perbaikan Scoped

- Jalankan type-check pada test setelah perubahan schema Prisma untuk menangkap fixture stale.
- Pertimbangkan menambah satu fixture per entity yang baru ditambahkan ke schema.

> Last updated: 2026-08-02 — dibuat ulang dengan forensik terhadap isi folder; index.ts diverifikasi penuh.
