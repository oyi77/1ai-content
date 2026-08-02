---
scope: services/remotion
depends_on: services/remotion-ads (proyek Node target)
status: complete
---

## Tujuan Folder Ini
Bridge Python→Node untuk rendering iklan produk via Remotion. Mengirim JSON payload ke script Node (`src/render.ts` di proyek remotion-ads) dan menafsirkan hasil render.

## Ekspor / Interface Utama
- `render_product_ad` (l.23) — satu-satunya fungsi utama (128 baris total).
  - `REMOTION_DIR` env (l.17), default `services/remotion-ads`; `RENDER_SCRIPT` (l.18).
  - `OUTPUT_DIR` = `<project-root>/data/remotion` (l.21).
  - Payload `outputPath` default `product-ad-{category}-{os.urandom(4).hex()}.mp4` (l.68).
  - Eksekusi: `node --import tsx src/render.ts <json>`, cwd=REMOTION_DIR, env `NODE_OPTIONS=--max-old-space-size=4096` (l.85-88), timeout 300s (l.93).
  - Parse JSON dari baris terakhir stdout (l.108-121).

## Dependensi Internal
- Menjalankan proyek Node di `services/remotion-ads`.
- Dipakai oleh: `services/routers/video.py:814` (rute `/video/ad` → `render_product_ad`), `services/tests/test_remotion.py`.

## Issue Spesifik
Tidak ada temuan material di folder ini (bridge tipis, timeout & error parsing sudah ditangani).

## Rekomendasi Perbaikan Scoped
- Pertimbangkan menaikkan timeout 300s untuk komposisi panjang atau mengeksposnya sebagai env.
- Jangan menempatkan output di `data/remotion` bila bisa diserve langsung; pastikan cleanup berkala untuk file yang sudah dikonsumsi.
