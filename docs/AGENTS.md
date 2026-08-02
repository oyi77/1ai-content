# AGENTS.md — docs

```yaml
scope: docs
depends_on: [src, prisma, admin-ui, services]
status: complete
last_reviewed_commit: bac10d88791d79fd8cadf2840fa2defc4343587a
```

## Tujuan Folder Ini

Folder dokumentasi teknis `1ai-content`. Enam dokumen utama (`01-*` s/d `06-*`) adalah sumber otoritatif yang ber-anchor ke kode (setiap klaim bisa dilacak ke `src/`). Berdasarkan konvensi folder:

- `docs/` root — otoritatif, dijaga sinkron dengan kode.
- `docs/archive/` — **superseded**; berisi rencana migrasi lama dan laporan historis. Boleh dibaca untuk konteks, TIDAK boleh dijadikan dasar keputusan tanpa verifikasi ke kode.
- `docs/plans/` — rencana kerja yang belum/belum sepenuhnya dieksekusi (status per dokumen di header masing-masing).
- `docs/quarantine/` — **TIDAK dipercaya**. `quarantine/README.md` sendiri menyatakan folder ini berisi data fabrikasi sistematis (inflasi LOC 30–500x, file hantu). Setiap klaim di sini WAJIB diverifikasi ke source code sebelum digunakan.

## Ekspor / Interface Utama

### Indeks Dokumen

| File | Konten | Otoritas |
|---|---|---|
| `README.md` | Indeks dokumen, arsip, quarantine | — |
| `01-ARCHITECTURE.md` | Fastify :3002, Python FastAPI :8767, nginx cf-router :6969, urutan registrasi route (index.ts), Prisma, bot grammY | Otoritatif |
| `02-ROUTES.md` | Peta route per domain (method/path, cara menambah route) | Otoritatif |
| `03-SECURITY.md` | Arsitektur auth, cookie-token HMAC, `isAdminRoute`, pertahanan path traversal, rate limit | Otoritatif |
| `04-FRONTEND.md` | Struktur React SPA, sistem EJS, design system, pola API client | Otoritatif |
| `05-TESTING.md` | Jest unit, Playwright E2E, pola test | Otoritatif |
| `06-EXECUTION.md` | Setup dev, deployment, debugging, rollback, CI/CD | Otoritatif |
| `db-consolidation-plan.md` | Rencana konsolidasi 4 DB → 1 PostgreSQL (17 item, 4 fase) | Rencana |
| `plans/absorpsi-ebook.md` | Rencana absorpsi 61 modul Python `ebook/` ke monorepo (Status: belum disetujui) | Rencana |
| `plans/absorpsi-remotion-ads.md` | Absorpsi Remotion ads (Status: COMPLETED 2026-07-29, 511/511 test) | Rencana |
| `quarantine/README.md` | Deklarasi: folder berisi data fabrikasi sistematis | TIDAK dipercaya |
| `quarantine/STATUS.md` | Status audit quarantine | TIDAK dipercaya |
| `quarantine/REFACTORING_AUDIT.md` | Audit refactor | TIDAK dipercaya |
| `quarantine/PRISMA_TYPE_AUDIT.md` | Audit tipe Prisma | TIDAK dipercaya |
| `quarantine/PRISMA_TYPE_FIX_REPORT.md` | Laporan perbaikan tipe Prisma (✅ fix) | TIDAK dipercaya |
| `quarantine/IMPROVEMENT_PLAN.md` | Rencana perbaikan | TIDAK dipercaya |
| `archive/FASE_1_LAPORAN.md` | Inspeksi kode langsung fase 1 (~139K LOC/712 file) | Superseded |
| `archive/FASE_2_LAPORAN.md` | Inspeksi kode langsung fase 2 | Superseded |
| `archive/FASE_3_LAPORAN.md` | Inspeksi kode langsung fase 3 | Superseded |
| `archive/MULTI_PROVIDER_GATEWAY.md` | Adoption plan gateway multi-provider (aspirasional) | Superseded |
| `archive/PLUGIN_ARCHITECTURE.md` | Adoption plan plugin architecture (aspirasional) | Superseded |
| `archive/SERVICE_LIFECYCLE_MANAGER.md` | Adoption plan service lifecycle (aspirasional) | Superseded |
| `archive/phase-4-qa-report.md` | Temuan QA Phase 4 (2026-07-27) | Superseded |
| `archive/saas-frontend-migration/README.md` | Rencana migrasi EJS→React lama (superseded) | Superseded |
| `archive/saas-frontend-migration/01-ARCHITECTURE.md` | Arsitektur rencana migrasi | Superseded |
| `archive/saas-frontend-migration/02-PHASE1-ADMIN.md` | Fase 1 admin | Superseded |
| `archive/saas-frontend-migration/03-PHASE2-CUSTOMER.md` | Fase 2 customer | Superseded |
| `archive/saas-frontend-migration/04-PHASE3-PUBLIC.md` | Fase 3 public | Superseded |
| `archive/saas-frontend-migration/05-PHASE4-CLEANUP.md` | Fase 4 cleanup | Superseded |
| `archive/saas-frontend-migration/06-API-CONTRACTS.md` | Kontrak API rencana | Superseded |
| `archive/saas-frontend-migration/07-COMPONENTS.md` | Komponen rencana | Superseded |
| `archive/saas-frontend-migration/08-TESTING.md` | Strategi testing rencana | Superseded |
| `archive/saas-frontend-migration/09-EXECUTION.md` | Eksekusi rencana | Superseded |
| `archive/saas-frontend-migration/10-TRACKING.md` | Tracking rencana | Superseded |

## Dependensi Internal

- Semua klaim di dokumen otoritatif (01–06) merefer `src/`, `prisma/schema.prisma`, dan SATU SPA (`admin-ui/` — 3 namespace: Landing, Admin, Customer).
- `03-SECURITY.md` dan `02-ROUTES.md` harus diperbarui tiap ada perubahan route/auth di `src/` — stale di sini = risiko misconfiguration.

## Issue Spesifik

### LOW-1 — Indeks docs/README.md stale (baris 29)

`docs/README.md:29` menulis `plans/ — Future implementation plans (empty)`, padahal `plans/` berisi 2 file aktif (`absorpsi-ebook.md`, `absorpsi-remotion-ads.md`). Baris 3 juga menyebut platform "Fastify + React + EJS content factory" yang tidak mencerminkan arsitektur terkini (Python FastAPI + 3 SPA terpisah; lihat `01-ARCHITECTURE.md`).

```diff
- └── plans/                 — Future implementation plans (empty)
+ └── plans/                 — Rencana kerja absorpsi (ebook, remotion)
```

## Rekomendasi Perbaikan Scoped

1. Update `docs/README.md:29` dan baris 3 agar sesuai state aktual (2 file di `plans/`, deskripsi stack lengkap).
2. Tambahkan peringatan eksplisit di `docs/README.md` bagian quarantine bahwa isinya terindikasi fabrikasi sistematis (saat ini hanya "under review" — `README.md:49-51`).
3. Saat menambah dokumen baru: simpan di root hanya jika otoritatif; plan → `plans/`; dokumen usang → `archive/`; data yang belum terverifikasi → jangan masuk ke folder mana pun sebelum dicek ke kode.
