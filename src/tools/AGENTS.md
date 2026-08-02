---
scope: src/tools
depends_on: none (repo pihak ketiga)
status: complete
---

<!-- Parent: ../AGENTS.md -->

# tools

## Tujuan
Repositori tool pihak ketiga yang di-vendor (git clone langsung, bukan submodule) untuk integrasi video/audio/download. Kode di sini BUKAN milik 1ai-content — jangan diedit sebagai bagian dari repo ini.

## Ekspor

| Direktori | Remote | Bahasa | AGENTS.md lokal |
|-----------|--------|--------|-----------------|
| `krillinai/` | `https://github.com/krillinai/KrillinAI.git` | Go | ❌ [SKIPPED — vendored] |
| `tiktok-downloader/` | `https://github.com/JoeanAmier/TikTokDownloader.git` | Python | ❌ [SKIPPED — vendored] |
| `vidbee/` | `https://github.com/nexmoe/VidBee.git` | TypeScript | ✅ punya AGENTS.md sendiri (dari upstream) |

## Issue Spesifik
1. **PERHATIAN — `vidbee/AGENTS.md` berisi instruksi dari repo upstream VidBee** (pakai pnpm, `pnpm run check`, Ultracite/Biome, i18n en.json) — itu untuk kode VidBee, BUKAN untuk 1ai-content. Jangan terapkan aturannya ke repo ini (1ai-content memakai npm dan format AGENTS.md-nya sendiri).
2. `krillinai/` & `tiktok-downloader/` tidak didokumentasikan di sini (skipped, vendored).
3. Ketiga direktori adalah hasil `git clone` langsung — tidak ada pinning versi/commit yang terdokumentasi.

## Rekomendasi Perbaikan Scoped
1. Konversi ke git submodule atau dokumentasikan commit yang di-vendor (untuk reproduksibilitas).
2. Jika `vidbee` diintegrasikan, ikuti instruksi AGENTS.md-nya HANYA di dalam direktori itu.
