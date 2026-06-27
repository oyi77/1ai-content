# HERMES Content — Captions, Hashtags, Diversity

## Caption Generation

POST /api/hermes/content/caption

Body: { "category": "fashion", "affiliate_link": "https://..." }

Returns: { "caption": "...", "hashtags": "...", "category": "..." }

## Category-Specific CTAs

Each category has 20+ unique CTAs:

| Category | CTA Style | Example |
|---|---|---|
| Fashion | Trendy, visual | "🔥 Outfit ini lagi viral!" |
| Fashion Muslim | Modest, elegant | "🕌 Tampil syari tetap stylish" |
| Kesehatan | Trustworthy, scientific | "💊 Sudah BPOM dan bersertifikat" |
| Home Living | Practical, aesthetic | "🏠 Rumah makin aesthetic!" |
| Trading | Professional, data-driven | "📈 Mulai trading sekarang" |

## Hashtag Rules

3 general + 5 category + 2 trending = 10 total

Never reuse same combination. Auto-rotate.

## Content Diversity Engine

generateDiverseVariants() — creates unique caption variants with deduplication.

Target: caption_similarity < 70%

## Forbidden

- ❌ Change product niche
- ❌ Fabricate product claims
- ❌ Generic captions (need category-specific)
- ❌ Reuse same hashtags
