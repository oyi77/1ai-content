---
scope: services/remotion-ads
depends_on: (mandiri; dipanggil services/remotion)
status: complete
---

## Tujuan Folder Ini
Proyek Node.js/TypeScript (package `remotion-product-ads`, remotion ^4.0.484) untuk merender iklan produk video dengan Remotion — komposisi `ProductAd` (450 frame, 30fps, 1080x1920) dan `ProductAd-Hook` (90 frame).

## Ekspor / Interface Utama
- `src/index.tsx` (7) — `registerRoot`.
- `src/Root.tsx` (50) — Composition `ProductAd` (l.28-36) dan `ProductAd-Hook` (l.39-47).
- `src/render.ts`:
  - Tipe `RenderInput`/`RenderResult` (l.27-46), `prepareImage` l.59.
  - `renderProductAd` (l.102) — outputDir `../output` (l.104), bundle (l.128), `selectComposition "ProductAd"` (l.138), `renderMedia` H.264 (l.159), `generateDeterministicAdCopy` l.114, CLI l.190.
  - **Fallback nama file** l.122-125 (kategori mentah, tanpa sanitasi).
- `src/adCopy.ts` — `CATEGORY_CONFIG` (beauty/fashion/hobi/kesehatan/homeliving) l.23-210; `generateAdCopy` l.220; `getCategoryGradient` l.245; `normalizeCategory` l.253; `extractIngredient` l.281; `generateDeterministicAdCopy` l.301.
- `src/ProductAd.tsx` — `SCENE` l.45-52; `resolveImageSrc` l.63; `HookScene` l.183; `ShowcaseScene` l.295; `CTAScene` l.486; `adjustBrightness` l.682.
- `node_modules/` → [SKIPPED — vendored/generated].

## Dependensi Internal
- Dipanggil oleh bridge `services/remotion/render_product_ad` (menjalankan `node --import tsx src/render.ts` dari folder ini).
- `.gitignore`: `out/`, `bundles/`, `.cache/`, `*.mp4` di-ignore — **`output/` TIDAK**.

## Issue Spesifik
- **Medium**: fallback filename kategori unsanitized (render.ts l.122-125) — bila `outputPath` tidak diberikan oleh pemanggil, nama file pakai kategori mentah (spasi/karakter aneh bisa merusak path). Dampak rendah karena bridge `services/remotion` selalu mengirim `outputPath`.
- **Low**: direktori `output/` (outputDir default render.ts l.104) tidak ada di `.gitignore` — render lokal bisa tidak sengaja ter-commit.

## Rekomendasi Perbaikan Scoped
- Sanitasi kategori pada fallback filename (slugify) di render.ts l.122-125.
- Tambahkan `output/` ke `.gitignore`.
