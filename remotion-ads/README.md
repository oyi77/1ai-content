# Remotion Product Ads Generator

Generates professional 9:16 product ad videos for Indonesian Shopee affiliate products using Remotion.

## Quick Start

```bash
# From 1ai-content root:
npm run render:ad '{"imageUrl":"path/to/image.jpg","title":"Product Title","category":"beauty"}'

# Or from remotion-ads directory:
node --import tsx src/render.ts '{"imageUrl":"...","title":"...","category":"beauty"}'

# Open Remotion Studio for preview:
npm run render:ad:studio
```

## Video Specs

- **Resolution:** 1080×1920 (9:16, TikTok/Reels format)
- **FPS:** 30
- **Duration:** 15 seconds (450 frames)
- **Codec:** H.264 MP4

## Scenes

| Scene | Frames | Duration | Content |
|-------|--------|----------|---------|
| Hook | 0–90 | 3s | Bold text hook + product image fade-in |
| Showcase | 90–300 | 7s | Full product image + animated text overlay |
| CTA | 300–450 | 5s | "Link di Bio!" + brand badge + Shopee badge |

## Categories

| Category | Key | Gradient | Hook Example |
|----------|-----|----------|--------------|
| Kecantikan | `beauty` | Pink→Rose | "Kulit glowing dalam 7 hari! ✨" |
| Fashion | `fashion` | Purple→Violet | "Outfit of the day! 🔥" |
| Hobi | `hobi` | Orange→Dark Orange | "Wajib punya buat para gamers! 🎮" |
| Kesehatan | `kesehatan` | Emerald→Green | "Hidup sehat dimulai dari sini! 💪" |
| Home & Living | `homeliving` | Amber→Dark Amber | "Rumah aesthetic on budget! 🏠" |

## Input Schema

```typescript
interface RenderInput {
  imageUrl: string;       // Product image URL or local path
  title: string;          // Product name/description
  category: string;       // beauty | fashion | hobi | kesehatan | homeliving
  affiliateLink?: string; // Shopee affiliate link
  brandName?: string;     // Brand/page name
  adCopy?: string;        // Custom ad copy (auto-generated if omitted)
  hookText?: string;      // Custom hook text (auto-generated if omitted)
  ctaText?: string;       // CTA text (default: "Link di Bio! 🔗")
  outputPath?: string;    // Custom output file path
}
```

## Output

```json
{
  "file_path": "/path/to/product-ad-beauty-1234567890.mp4",
  "file_size": 2184641,
  "duration": 15,
  "width": 1080,
  "height": 1920
}
```

## API Endpoint

```bash
curl -X POST http://localhost:8767/content/render-ad \
  -H "Content-Type: application/json" \
  -d '{
    "image_url": "https://example.com/product.jpg",
    "title": "Serum Wajah Niacinamide 10%",
    "category": "beauty",
    "brand_name": "Skincare Hub",
    "affiliate_link": "https://shope.ee/xxx"
  }'
```

## Integration

The download engine (`services/download/engine.py`) has a `convert_slideshow_to_video_remotion()` function that:
1. Downloads slideshow images from TikTok
2. Uses the first image as the product image
3. Renders a professional ad video with Remotion
4. Falls back to ffmpeg slideshow if Remotion fails

## Files

```
remotion-ads/
├── package.json          # Dependencies (remotion, @remotion/cli, etc.)
├── tsconfig.json         # TypeScript config with JSX support
├── README.md             # This file
├── public/               # Static assets (images copied here during render)
├── output/               # Rendered videos
└── src/
    ├── index.tsx          # Remotion entry point (registerRoot)
    ├── Root.tsx           # Composition registry
    ├── ProductAd.tsx      # Main composition (3 scenes, 9:16)
    ├── adCopy.ts          # Ad copy generator (5 categories)
    └── render.ts          # CLI render script + Node.js API
```
