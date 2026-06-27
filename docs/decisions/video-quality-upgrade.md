# Research: Video Quality Upgrade Pipeline
## Date: 2026-06-26

## Current State
- Video gen: 9-tier provider fallback (Gemini → BytePlus → XAI → Replicate → etc.)
- Quality: Good for short-form (15-60s), adequate for TikTok/Reels
- Resolution: 1080x1920 standard, HD/ultra options available
- Style: Ken Burns motion, A/B split visuals, auto-captions

## Gap Analysis
Competitors (InVideo AI with Veo 3.1, HeyGen with photorealistic avatars) produce higher quality output.

## Upgrade Options
| Option | Impact | Cost | Timeline |
|--------|--------|------|----------|
| A: Integrate Kling AI | Photorealistic characters | $0.05-0.15/sec | 1 week |
| B: Integrate Veo 3.1 | Highest quality video gen | $0.10-0.20/sec | 2 weeks |
| C: Enhance post-processing | Better transitions, effects | Free (FFmpeg) | 3 days |
| D: Add music video templates | More engaging content | Free | 2 days |
| E: Integrate Seedance 2.0 | ByteDance's native model | $0.03-0.08/sec | 1 week |

## Decision
**Phase 1 (Immediate):** Option C + D — enhance post-processing and add templates
**Phase 2 (Week 2):** Option E — integrate Seedance 2.0 (ByteDance quality, lower cost)
**Phase 3 (Week 4):** Option A — Kling AI for talking-head content

### Post-Processing Enhancements
1. Smooth Ken Burns transitions (crossfade + zoom)
2. Dynamic text overlays (animated captions)
3. Color grading presets (cinematic, warm, cool, vibrant)
4. Beat-synced cuts (align cuts to music beats)
5. Intro/outro animations (logo reveal, fade)
6. Aspect ratio smart-crop (auto-detect subject)

### New Video Templates
1. Product Showcase (slow zoom + text overlay)
2. Tutorial (split-screen + step markers)
3. Storytelling (Ken Burns + voiceover)
4. Meme/Reaction (picture-in-picture)
5. Before/After (side-by-side reveal)
6. Listicle (numbered cards with transitions)
