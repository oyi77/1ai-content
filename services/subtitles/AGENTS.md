# Subtitles Engine (services/subtitles)

Burns timed subtitle segments onto a video with ffmpeg drawtext.

- Engine: `SubtitlesEngine(ffmpeg="ffmpeg", output_base=None)` (services/subtitles/engine.py)
- Methods:
  - `build_ffmpeg_cmd(video_path, segments, style="default", font_size=24, output_path=None) -> list[str]` — PURE builder, no subprocess. Segments: `[{start, end, text, style?}]`; per-segment style overrides request style; unknown style → default preset.
  - `burn(video_path, segments, style="default", font_size=24, output_dir=None) -> dict` — runs ffmpeg; nonzero exit raises RuntimeError(stderr[-500:]). Returns `{success, output_path, segments, style, ffmpeg_cmd}`.
- Styles: `STYLE_PRESETS` — default (white boxed, bottom-center), outline (borderw=3), highlight (yellow box/black text), caption (y=h*0.6, fontsize ×1.2).
- HTTP: `POST /video/subtitles` (services/routers/subtitles.py, body CaptionsMultiRequest).
- Test: `cd services && python3 -m pytest tests/test_subtitles_api.py -q`
- Reuse anchors: ffmpeg invocation pattern in services/faceless/composer.py; sync router pattern in services/routers/faceless.py.
