---
scope: ab_testing
depends_on:
  - path: services/db/models.py
    type: services
status: complete
---

# AGENTS.md — services/ab_testing

## Tujuan
Layanan A/B testing konten: membuat test, meng-generate varian via LLM (OmniRoute), memperbarui metrik engagement, dan menghitung statistik pemenang. State disimpan di tabel `ABTest` (Postgres via Prisma/SQLAlchemy), bukan in-memory.

## Ekspor-Interface
- `ABTestingService` (`service.py:22`):
  - `create_test` (25), `get_tests` (54), `get_test` (64), `start_test` (73), `update_metrics` (85), `end_test` (124), `delete_test` (148), `get_stats` (156)
  - Internal: `_generate_variants` (178) — sync `httpx.post` ke `{OMNIRoute_URL}/chat/completions` (197); `_engagement_score` (210); `_to_dict` (218)
- `__init__.py:2` mengekspor `ABTestingService`.
- Env: `OMNIRoute_URL` (perhatikan kapitalisasi `OMNIRoute`, default `http://127.0.0.1:20128/v1`) — baca di `service.py:19`.

## Dependensi Internal
- `services/db/models.py:188` model `ABTest` (variant_a/b_views, likes, shares, comments; `status` default `"draft"`; `winner` String(8)); `ContentType` enum di `models.py:15` (caption/carousel/mixed/short/video). [LUAR SCOPE — diverifikasi saat audit]

## Issue Spesifik
- [MEDIUM] `service.py:85-119` `update_metrics` TOCTOU: baca lalu tulis kembali seluruh baris tanpa transaksi/lock — dua panggilan konkuren bisa saling menimpa kenaikan metrik.
- [MEDIUM] `service.py:178` `_generate_variants` melakukan `httpx.post` sinkron di dalam fungsi async — memblokir event loop selama request LLM.
- [LOW] `service.py` (label varian fallback) `else "b"` dipakai saat penamaan otomatis gagal — dua varian bisa berlabel sama.

## Rekomendasi
- `update_metrics`: ganti baca-tulis dengan UPDATE atomik (`variant_x_likes = variant_x_likes + delta`) atau transaksi row lock.
- `_generate_variants`: jalankan di `asyncio.to_thread` atau pakai `httpx.AsyncClient`.
- Label fallback: pastikan varian kedua selalu dapat label berbeda dari varian pertama.
- **Belum diterapkan** — audit dokumentasi saja, tanpa perubahan kode.
