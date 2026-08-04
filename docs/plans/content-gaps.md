# Content-Type Gap Closure — 1ai-content

Date: 2026-08-04 · Method: full-surface audit (22 routers wired via `registry.add_router(...)` in `services/api.py`, 30 service dirs under `services/`) + prior clipper/faceless/brand REST additions (530 passed). Every build item is grounded in existing repo patterns: `APIRouter` in `services/routers/<name>.py`, models in `services/api_models.py`, DI getters in `services/di.py`, wiring via `registry.add_router(...)` + `registry.wire(app)` in `services/api.py`, tests via `services/tests/conftest.py` `client` fixture.

## Status of requested work
- ✅ **Prior task complete**: REST endpoints for clipper (`POST /clipper/clip`), faceless (`POST /faceless/generate|product|batch`), brand (`POST /brand/set`, `GET /brand/{user_id}`, `POST /brand/watermark`) — wired, tested. Full suite **530 passed**; new API tests 16 passed.
- ✅ **This plan COMPLETE (2026-08-04)**: all 8 in-repo gaps (#1–#8) built as engines + routers + models + DI getters + stub tests and wired into `services/api.py` (30 `registry.add_router(...)` total). Endpoint surface: `POST /audio/podcast`, `POST /text/newsletter`, `POST /text/article`, `POST /infographic/generate`, `POST /meme/generate`, `POST /video/subtitles`, `POST /video/screen-rec`, `POST /video/interactive`. Full suite **582 passed, 1 skipped** (530 baseline + 52 new). Smoke: all 8 routes return 422 on missing required fields; valid payloads pass through to engines (interactive builds manifest; screenrec headless-guard returns `{success: false}` in non-X env). Legacy surfaces untouched (`/captions/*`, `/tts/*`, `/music/*`, `/suno/*`, `/text/caption*`, `/carousel/*`, `/loop/*`).
## Gap inventory (from surface audit)
| # | Content type | Current state | Feasibility |
|---|--------------|---------------|-------------|
| 1 | Podcast / long-form multi-speaker audio | No | **In-repo** — ffmpeg + tts engine + music exist |
| 2 | Newsletter / email content | No | **In-repo** — ebook/export + research engine exist |
| 3 | Blog / article publishing | No | **In-repo** — ebook generation largely reusable |
| 4 | Infographics / data-viz | No | **In-repo** — image gen + carousel templates reusable |
| 5 | Meme generator | No | **In-repo** — image gen + caption styles exist |
| 6 | Multi-track cinematic subtitles | Partial (single caption style) | **In-repo** — ffmpeg drawtext multi-style |
| 7 | Screen recording / tutorial-capture | No | **In-repo** — ffmpeg x11grab/avatiser; capture is new |
| 8 | Interactive / branching video | No | **In-repo (soft)** — remotion compositions + choices metadata |
| 9 | Cross-language lip-sync dubbing | No | In-repo BGM/voice-mix feasible; lip-sync needs external model (Wav2Lip) — **defer** |
| 10 | Real-person / UGC / studio content | No | Needs camera/human pipeline — **out of scope** |
| 11 | Live streaming / live commerce | No | Needs ingest (RTMP) + player infra — **out of scope** |
| 12 | Webinars / conferencing | No | Needs SFU/WebRTC — **out of scope** |
| 13 | Games / gameplay content | No | Needs engine/playback capture — **out of scope** |
| 14 | 3D / metaverse / AR / VR | No | Needs 3D renderer — **out of scope** |
| 15 | Real-time captioning | No | Needs streaming ASR backend — **defer** (deps) |
| 16 | Push / SMS / in-app messaging | No | Crosses product boundary (not content) — **out of scope** |
| 17 | Forum / threads content | No | Content type but no consumer; panel_gen duplicable — **low value, defer** |

**Scope decision:** In-repo gaps (#1–#8) are the build plan. Out-of-scope items (#10–#16) need external infra or cross cross product lines — documented as deliberate non-goals, not silently dropped.

---

## Phase 1 — Audio & Text (foundation, reuses existing engines)
Reuses: `services/tts/engine.py`, `services/music/generator.py`, `services/ebook/`, `services/research/engine.py`, `services/ebook/export/`.

### 1a. Long-form multi-speaker podcast (`/audio/podcast`)
- **Goal**: generate a multi-segment authored audio (host+guest TTS) with intro/outro music bed.
- Files:
  - `services/podcast/engine.py` — new: `PodcastEngine` (segment plan → per-segment `TtsEngine.synthesize` with distinct voice/rate → `ffmpeg` concat + music bed via `services/music`).
  - `services/podcast/__init__.py`, `services/podcast/AGENTS.md`.
  - `services/api_models.py` — `PodcastRequest` (title, script_segments[{speaker, text}], voice_map, music_style?, duration_limit_sec).
  - `services/di.py` — `get_podcast()` / `"podcast"`.
  - `services/routers/podcast.py` — `POST /audio/podcast` (consumes `audio` service family; register `registry.add_router(...)` in `api.py`).
  - `services/tests/test_podcast_api.py` — TestClient happy-path 200 + shape; engine unit test with stubbed TTS + ffmpeg.
- Acceptance: `POST /audio/podcast` returns `{script, audio_url or job_id}`; segments render in order; intra-safe (stub TTS in tests, never real network).

### 1b. Newsletter (`/text/newsletter`)
- **Goal**: research→outline→HTML newsletter (themed) reusing ebook research + a light export.
- Files:
  - `services/newsletter/engine.py` — new: `NewsletterEngine` (topic → `ResearchEngine` → section plan → HTML via an export template).
  - `services/newsletter/__init__.py`, `AGENTS.md`.
  - `api_models.NewsletterRequest` (topic, audience, sections_count, tone).
  - `services/routers/newsletter.py` — `POST /text/newsletter`, register in `api.py`.
  - `services/tests/test_newsletter_api.py`.
- Acceptance: topic → valid HTML with intro/sections/CTA; no dead deps (stub research in test).

### 1c. Blog / article (`/text/article`)
- **Goal**: topic → structured Markdown + SEO meta, reusing `research` + `ebook` generation brain.
- Files:
  - `services/article/engine.py` — `ArticleEngine` (title, slug, md body, meta{title,description,keywords}, word_count).
  - `services/article/__init__.py`, `AGENTS.md`.
  - `api_models.ArticleRequest`.
  - `services/routers/article.py` — `POST /text/article`, register.
  - `services/tests/test_article_api.py`.
- Acceptance: deterministic word_count; md headings 1/2; meta present.

---

## Phase 2 — Visual composites (reuses image gen + carousel templates)
Reuses: `services/carousel/{templates,renderer,assembler,caption_styles,caption_presets}.py`, `services/remetadata/engine.py`, image providers.

### 2a. Infographics / data-viz (`/infographic`)
- **Goal**: numeric/fact input → captioned data slide (bar/stat cards) rendered via carousel-style canvas.
- Files:
  - `services/infographic/engine.py` — `InfographicEngine` (data_points → slide canvas via existing renderer primitives).
  - `services/infographic/__init__.py`, `AGENTS.md`.
  - `api_models.InfographicRequest` (title, data_points[{label, value, color?}], chart_kind enum).
  - `services/routers/infographic.py` — `POST /infographic/generate`, register.
  - `services/tests/test_infographic_api.py`.
- Acceptance: returns image path/content; stat cards render distinct values; unknown chart_kind → 422.

### 2b. Meme generator (`/meme`)
- **Goal**: text + template/choice → meme image (balance panel top/bottom).
- Files:
  - `services/meme/engine.py` — `MemeEngine` (template registry ∪ free-text, text wrap, image draw).
  - `services/meme/__init__.py`, `AGENTS.md`.
  - `api_models.MemeRequest` (template_id|image_url, top_text, bottom_text).
  - `services/routers/meme.py` — `POST /meme/generate`, register.
  - `services/tests/test_meme_api.py`.
- Acceptance: known template id → 200 image; unknown template → 422; text wrap overflow handled (no crash).

### 2c. Multi-track cinematic subtitles (`/video/subtitles`)
- **Goal**: style-set (multiple caption styles by segment/timeline) burned into a source clip via ffmpeg drawtext; upgrade of single-style captions.
- Files:
  - `services/subtitles/engine.py` — new `SubtitlesEngine.burn_multi(...)` (segments[{start,end,text,style}] → ffmpeg drawtext per style).
  - `services/subtitles/__init__.py`, `services/subtitles/AGENTS.md`.
  - `api_models.CaptionsMultiRequest` (video_url, segments, styles mapping reusing `services/carousel/caption_styles.py`).
  - `services/routers/subtitles.py` — router `APIRouter(prefix="/video")`, `POST /video/subtitles`. NOTE: legacy `/captions/*` (styles/presets/generate) lives in `compat.py` and `/text/caption*` in `text.py` — do NOT touch either; this is a new sub-path under `/video`, no collision.
  - `services/tests/test_subtitles_api.py`.
- Acceptance: ffmpeg command build verified (dry-run flag in test), segment timestamps ordered, unknown style → fallback default not 500.

### 2d. Screen recording / tutorial-capture (`/video/screen-rec`)
- **Goal**: capture a local X display/window region + optional narration overlay into mp4.
- Files:
  - `services/screenrec/engine.py` — `ScreenRecEngine` (region[WxH+x+y], duration, ffmpeg x11grab → mp4; optional `tts` narration mix).
  - `services/screenrec/__init__.py`, `AGENTS.md`.
  - `api_models.ScreenRecRequest`.
  - `services/routers/screenrec.py` — `POST /video/screen-rec`, register.
  - `services/tests/test_screenrec_api.py` (dry-run ffmpeg cmd; HEADLESS safety guard — refuse on no DISPLAY unless `allow_headless=true`).
- Acceptance: builds valid x11grab ffmpeg arg set; rejects headless by default; narration optional.

---

## Phase 3 — Interactive / branching video (soft; remotion)
Reuses: `services/remotion/__init__.py` (composition API), `services/remotion-ads/src/`, `services/repurpose/engine.py`.

### 3a. Branching video metadata (`/video/interactive`)
- **Goal**: produce a linear base video + `choices.json` (timestamps → next-segment branches) as a package; playback/engine that consumes it is a follow-up (out of content-gen scope).
- Files:
  - `services/interactive/engine.py` — `InteractiveEngine` (branch_graph → composed segments via repurpose/remotion reuse + manifest writer).
  - `services/interactive/__init__.py`, `AGENTS.md`.
  - `api_models.InteractiveRequest` (nodes[{id, media, choices[{label, target_id}]}], start_id).
  - `services/routers/interactive.py` — `POST /video/interactive`, register.
  - `services/tests/test_interactive_api.py`.
- Acceptance: valid node graph → manifest with reachable-start invariant (no dangling targets → 422).

---

## Phase 4 — Verification & rollout
- Reuses nothing new; closes the loop.
- **Files**: `services/tests/test_*_api.py` for each new router (already scoped per item).
- Steps:
  1. `cd services && python3 -m pytest tests/ -q -p no:cacheprovider --no-header -p no:warnings` → **full suite green** (baseline 530 + new).
  2. `python3 services/run_api.py` + curl smoke each new endpoint with real payload (document receipt).
  3. `npm run build` + `npx tsc -b --noEmit` scope check on any TS surface touched (none in Phase 1–3 core — Python-only, but confirm no worker imports break).
  4. Update `services/AGENTS.md` router/service tables + `smoke_test.py` endpoint list.
  5. Commit + push; brain-save summary.

## Non-goals (deliberate, documented not dropped)
- Live streaming / live commerce (#11), webinars (#12), games (#13), 3D/AR/VR (#14) — need ingest/SFU/engine infra outside a content-generation repo.
- Real-person / UGC / studio (#10) — human capture pipeline.
- Push/SMS/in-app messaging (#16) — product-notification, not content generation.
- Cross-language lip-sync dubbing (#9), real-time captioning (#15) — depend on external models/serving (Wav2Lip, streaming ASR); captured as follow-up spikes, not committed build items.
- Forum/threads (#17) — duplicable but no consumer; park unless a consumer appears.

## Rollback
- All additions are additive routers + DI getters + models. Rollback = delete the new service dirs/routers + `add_router(...)` lines + `get_*`/model additions; no schema/migration changes; existing 530 tests are the revert gate (must stay green).