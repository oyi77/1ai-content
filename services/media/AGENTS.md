---
scope: services/media
depends_on: services/movie_gen (penulis output — lihat `services/movie_gen/engine.py` line 31)
status: inferensi-struktur
---

# services/media

## Tujuan Folder Ini

Direktori penyimpanan output media. Struktur saat ini: `movies/movie_<run_id>/{audio,images}`. Pola nama `movie_<run_id>` dan subfolder `audio/` + `images/` cocok dengan output dir generator film — lihat `services/movie_gen/engine.py` (`DEFAULT_OUTPUT_DIR = os.path.join(dirname, "..", "media", "movies")`).

## Ekspor / Interface Utama

Tidak ada interface Python yang diekspor. Murni output/storage:

- `movies/` — root output film
- `movies/movie_1785430154/{audio,images}`, `movies/movie_1785430268/{audio,images}` — dua run generator yang tersisa sebagai struktur kosong (tidak ada file di dalamnya saat audit)

## Dependensi Internal

- Ditulis oleh `services/movie_gen` (jalur `generate_video=True` → render scene ke `movie_<run_id>/images` dan `audio`, lalu assemble). Lihat [services/movie_gen/AGENTS.md](../movie_gen/AGENTS.md).

## Issue Spesifik

- **Low**: isi folder kosong padahal ada struktur run — kemungkinan file output dihapus/moved oleh proses lain (mis. cleanup job) atau run gagal sebelum menulis file. Status `inferensi-struktur` karena kesimpulan ini dari struktur direktori + kode movie_gen, bukan dari data run.

## Rekomendasi Perbaikan Scoped

- Konfirmasi siapa yang menghapus/memindahkan output run (cek cleanup job di `scripts/` atau `services/`).
- Pertimbangkan `.gitkeep` + komentar agar struktur tidak dianggap sengaja-kosong oleh tooling otomatis.

> Last updated: 2026-08-02
