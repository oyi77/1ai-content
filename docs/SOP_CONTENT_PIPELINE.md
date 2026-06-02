# SOP: Content Pipeline (Download → Edit → Publish)

## Overview
Full automation: Download TikTok videos → Edit with ffmpeg → Publish to all platforms.

## Scripts
| Script | Location | Purpose |
|--------|----------|---------|
| `tiktok_downloader.py` | `scripts/` | Download via tikwm.com API |
| `video_processor.py` | `scripts/` | ffmpeg text overlay editor |
| `publish_orchestrator.py` | `scripts/` | Distribute to all platforms |
| `content_pipeline.py` | `scripts/` | Full pipeline launcher |
| `price_utils.py` | `scripts/` | Price parsing + product matching |
| `ig_fb_poster.py` | `scripts/` | IG posting via FB Graph API |

## TikTok Download
- **tikwm.com API**: `GET https://www.tikwm.com/api/?url=<tiktok_url>` → JSON with `data.play`, `data.title`
- No auth needed for tikwm
- yt-dlp only for listing video IDs: `--flat-playlist --dump-json`
- TikTok cookies in Netscape format, remove `#HttpOnly_` prefix

## Video Processing
- Layout (9:16): Hook (top) | Video | Product+Price (bottom-left) | CTA (center, pulsing) | Hashtags (bottom)
- Font: DejaVu Sans Bold (auto-detected)
- Templates: `viral_ecommerce`, `minimal_promo`, `clickbait_only`, `brand_build`
- Platform variants: TikTok 9:16, IG Reel 9:16, X 16:9, FB Reel 9:16

## Price Parsing
- CSV: "42,0RB" → 42000, "323,0RB" → 323000, "15,8RB" → 15800
- Use `parse_price()` from `price_utils.py`
- Display: `format_price(42000)` → "Rp42.000"

## Smart Product Matching
1. Extract keywords from video title (daster, oneset, anak, gajah, etc.)
2. Score products by keyword overlap
3. Bonus for matching source CSV niche
4. Return highest-scoring product

## Key Decisions (2026-06-03)
- OpenCut not ready for automation → use ffmpeg + moviepy
- tikwm.com API is reliable fallback for TikTok video download
- curl_cffi impersonation needed for yt-dlp TikTok
