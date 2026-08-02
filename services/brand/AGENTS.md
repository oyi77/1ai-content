---
scope: brand
depends_on: []
status: complete
---

# AGENTS.md — services/brand

## Tujuan
Manajemen identitas brand: menyimpan pengaturan warna/watermark per brand, menerapkan watermark via ffmpeg, dan menambahkan intro frame ke video.

## Ekspor-Interface
- `BrandSettings` (`settings.py:17`):
  - Konstanta: `DEFAULT_PRIMARY="#FF6B35"` (13), `DEFAULT_SECONDARY="#004E89"` (14)
  - `__init__` (20) — penyimpanan `_brands` in-memory (21)
  - `set_brand` (23), `get_brand` (42)
  - `apply_watermark` (48) — subprocess ffmpeg, `check=True` tanpa try/except
  - `apply_brand_intro` (79), `_render_intro_frame` (159) — font hardcoded `/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf` (192-197)
  - `get_ffmpeg_filter` (206)
- `__init__.py:1` mengekspor `BrandSettings`.

## Dependensi Internal
- Tidak ada dependensi ke service lain; memerlukan biner `ffmpeg` di PATH.

## Issue Spesifik
- [MEDIUM] `settings.py:21` `_brands` in-memory — semua brand hilang saat proses restart; tidak ada persistensi.
- [MEDIUM] `settings.py:48` `apply_watermark` menjalankan subprocess dengan `check=True` tanpa try/except — kegagalan ffmpeg (file tidak ada, path font salah) melempar `CalledProcessError` mentah ke pemanggil tanpa pesan kontekstual.
- [LOW] `settings.py:206` `get_ffmpeg_filter`: variabel `primary` dihitung (222) tetapi tidak dipakai di filter yang dikembalikan.

## Rekomendasi
- Persist `_brands` ke DB/JSON (atau dokumentasikan sebagai sesi-only).
- Bungkus `apply_watermark` dengan try/except → log + pesan error yang jelas.
- Hapus variabel `primary` yang tak terpakai, atau pakai di filter.
- **Belum diterapkan** — audit dokumentasi saja, tanpa perubahan kode.
