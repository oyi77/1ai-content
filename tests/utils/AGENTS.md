<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-02 | Updated: 2026-08-02 -->

---
scope: tests/utils
depends_on:
  - src/utils/container
status: complete
---

# utils

## Tujuan Folder Ini

Helper test + test untuk helper. Saat ini berisi container-mocks: lapisan di atas `@/utils/container` untuk mendaftarkan/membersihkan mock service dalam test.

## Ekspor

Dari `container-mocks.ts`:

- `resetContainerMocks()` — bersihkan semua mock service
- `mockService(key, impl)` — daftarkan mock service (wrapper `container.registerMock`)
- `getService(key)` — ambil service dari container (wrapper `container.get`)

## Interface Utama

| File | Isi |
|------|-----|
| `container-mocks.ts` | Helper di atas (wrapper `container.registerMock` / `clearMock` / `reset` / `get`) |
| `container-mocks.test.ts` | Demo pola penggunaan helper container-mocks |

## Dependensi Internal

- `src/utils/container` — container DI yang di-wrap

## Issue Spesifik

- Hanya 2 file; helper lain (mis. `adminAuthHeader`, pembuat context HTTP) belum dipindahkan ke sini padahal dipakai berulang di `tests/admin/` dan `tests/e2e/`.

## Rekomendasi Perbaikan Scoped

- Pindahkan helper yang dipakai lintas folder test (mis. `adminAuthHeader`) ke `tests/utils/` agar satu sumber.
- Tambahkan dokumentasi singkat tentang kapan memakai `resetContainerMocks` vs `jest.isolateModules`.

> Last updated: 2026-08-02 — dibuat ulang dengan forensik terhadap isi folder; 2 file diverifikasi penuh.
