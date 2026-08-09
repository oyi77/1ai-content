<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-02 | Updated: 2026-08-02 -->

---
scope: tests/youtube
depends_on:
  - src/config/youtube.config
  - src/services/youtube/quality-gate.service
  - src/services/youtube/quarantine.service
  - src/services/youtube/script-writer.service
  - src/services/youtube/seo-optimizer.service
  - src/types/youtube.types
status: complete
---

# youtube

## Tujuan Folder Ini

Unit tests untuk modul YouTube content pipeline: konfigurasi, quality gate, quarantine, script writer, SEO optimizer, dan type definitions.

## Ekspor

Tidak ada ekspor publik — folder berisi file test saja.

## Interface Utama

| File | Yang Diuji |
|------|-----------|
| `config.test.ts` | Getter `@/config/youtube.config`: `getTier1Duration=15`, `getTier2Duration=30`, `getTier3Duration=60`, `getRecoveryThreshold≈0.80`, `getMinSampleRate=44100`, `getMinVideoWidth=1920`, `getMaxTitleLength=100`; konstanta `NICHE_VERTICALS` (`folklore_history`, `music`, `true_crime`) |
| `quality-gate.test.ts` | `validateSeo` / `runQualityGate` dari `@/services/youtube/quality-gate.service` |
| `quarantine.test.ts` | `checkQuarantineEligibility` dari `@/services/youtube/quarantine.service` (mock `prisma.ytChannel` / `ytPublishedVideo` / `ytVideoMetrics` / `ytQuarantineLog`) |
| `script-writer.test.ts` | `generateScript` dari `@/services/youtube/script-writer.service` |
| `seo-optimizer.test.ts` | `generateSeoPackage` dari `@/services/youtube/seo-optimizer.service` |
| `types.test.ts` | Memuat `@/types/youtube.types` (hanya verifikasi modul bisa di-load) |

## Dependensi Internal

- `src/config/youtube.config` — seluruh konfigurasi YouTube
- `src/services/youtube/*` — quality-gate, quarantine, script-writer, seo-optimizer
- `src/types/youtube.types` — tipe bersama
- `src/config/database` (mock) — untuk quarantine service

## Issue Spesifik

- `types.test.ts` hanya assert modul bisa di-require, tanpa memverifikasi isi tipe (assertion lemah).
- Test bergantung pada nilai konstanta konfigurasi (mis. `getTier1Duration=15`) — jika konstanta berubah, test harus ikut berubah.

## Rekomendasi Perbaikan Scoped

- Perkuat `types.test.ts` dengan type-level assertion (mis. `expectTypeOf` dari `ts-expect`/vitest-style) atau hapus jika tidak menambah nilai.
- Tambahkan test untuk modul `src/services/youtube/` lain yang belum tercakup (jika ada).

> Last updated: 2026-08-02 — dibuat ulang dengan forensik terhadap isi folder; 6 file diverifikasi penuh.
