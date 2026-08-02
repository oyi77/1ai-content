---
scope: services/engagement
depends_on: cloak adapter eksternal (`services/cloak_adapter`, dipakai via `self.cloak`)
status: complete
---

# services/engagement

## Tujuan Folder Ini

Auto-reply engine untuk komentar media sosial (platform cloak). Semua logika ada di `__init__.py` (paket tipis tanpa modul terpisah): template balasan berbahasa Indonesia untuk beberapa sentimen, check limit harian, dan posting balasan.

## Ekspor / Interface Utama

- `AutoReplyEngine` (didefinisikan langsung di `__init__.py`):
  - `REPLY_TEMPLATES` — kumpulan template per sentimen: `positive`, `question`, `negative`, `generic`, `follow_up`
  - `reply_to_comment(...)` (baris ~69) — jalur utama: validasi limit → pilih template → posting balasan
  - `_check_limit(profile_id)` (baris ~95, definisi ~204) — baca `_daily_limits`
  - `_post_reply(...)` (baris ~223) — kirim balasan via `self.cloak.post(profile_id, media_path="", caption=reply, platform=platform)`

## Dependensi Internal

- `self.cloak` — adapter posting platform (`services/cloak_adapter`); **tidak ada AGENTS.md** di `services/cloak_adapter/` saat ini. Dipakai hanya saat non-None (jalur produksi).
- Eksternal: platform media sosial via cloak.

## Issue Spesifik

- **High**: docstring baris 8 menulis `from services.engagement.auto_reply import AutoReplyEngine`, tapi modul `auto_reply.py` TIDAK ADA — semua kelas ada di `__init__.py`. Contoh usage di docstring menyesatkan pemakai baru.
- **High**: limit harian 50 (via `_daily_limits`) hanya di-increment di jalur simulasi `_post_reply` (saat `self.cloak` falsy). Jika `self.cloak` ter-set (produksi), counter tidak pernah naik → `_check_limit` selalu lolos → rate limit tidak berfungsi di produksi. Trace: `reply_to_comment` → `_check_limit` → `_post_reply` → increment hanya saat cloak kosong.

## Rekomendasi Perbaikan Scoped

- Perbaiki docstring: ganti contoh import menjadi `from services.engagement import AutoReplyEngine`.
- Pindahkan increment counter ke jalur nyata: naikkan `_daily_limits[profile_id]` setelah `self.cloak.post(...)` sukses (bukan hanya di cabang simulasi).

> Last updated: 2026-08-02
