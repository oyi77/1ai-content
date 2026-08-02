---
scope: services/data
depends_on: services/ebook (pipeline ebook — lihat [AGENTS.md](../ebook/AGENTS.md))
status: complete
---

# services/data

## Tujuan Folder Ini

Folder penyimpanan *data artifact* yang dihasilkan/dipakai oleh pipeline lain. Saat ini isinya sangat kecil: subfolder `ebook/` berisi `projects.db` (database SQLite) dan direktori `projects/` (kosong). Bukan package Python — tidak ada kode aplikasi di sini.

## Ekspor / Interface Utama

Tidak ada API Python yang diekspor. Folder ini murni data storage:

- `ebook/projects.db` — database SQLite artifact (kemungkinan output runtime dari pipeline ebook)
- `ebook/projects/` — direktori proyek (kosong saat ini)

## Dependensi Internal

- Dibuat/dipelihara oleh pipeline ebook (`services/ebook/`), khususnya layer db & pipeline-nya — lihat [services/ebook/AGENTS.md](../ebook/AGENTS.md).

## Issue Spesifik

- **Low**: tidak ada metadata/dokumentasi siapa yang menulis `projects.db` dan kapan — sulit dibedakan dari artifact runtime vs file yang sengaja di-commit. Perlu konfirmasi apakah file ini seharusnya di-commit ke git atau masuk `.gitignore`.

## Rekomendasi Perbaikan Scoped

- Konfirmasi pemilik write ke `ebook/projects.db` (kemungkinan `services/ebook/db/` atau `services/ebook/pipeline/`) dan catat di sini.
- Jika murni artifact runtime, tambahkan ke `.gitignore`; jika sengaja di-commit, dokumentasikan format/schemanya.

> Last updated: 2026-08-02
