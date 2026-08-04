---
scope: services/screenrec
depends_on: ffmpeg (x11grab), services/tts (lazy, for narration)
status: complete
---

# services/screenrec

## Purpose

Record the X display (or a region) into an MP4 via `ffmpeg -f x11grab`, with
optional TTS narration muxed on top.

## Engine API (services/screenrec/engine.py)

- `ScreenRecEngine(ffmpeg="ffmpeg", output_base=None)`
- `build_ffmpeg_cmd(duration, fps=15, region=None, output_path=None, display=None) -> list[str]` — PURE builder, no I/O. region `"WxH+X+Y"` → video_size WxH, offset +X,Y; None → env `SCREENREC_SIZE` or `1280x720`, offset +0,0. display → env `DISPLAY` or `:100`.
- `capture(duration=10, region=None, fps=15, narration=None, voice=None, allow_headless=False, output_dir=None) -> dict` — returns `{success, video_path, duration, fps, narration, region}`; headless guard unless `allow_headless=True`; subprocess failure → RuntimeError. narration → lazy `get_tts().synthesize(text=narration, voice=voice)` then ffmpeg mux `-shortest`.

## HTTP Endpoint

- `POST /video/screen-rec` (router `screenrec_router`, tags `screenrec`, body `ScreenRecRequest`)

## Test Command

```
cd services && python3 -m pytest tests/test_screenrec_api.py -q
```

## Reuse Anchors

- Lazy `from services.di import get_tts` inside `capture` (avoids import cycle) — same lazy pattern as other engines.
- ffmpeg conventions (libx264, yuv420p, aac mux) mirror services/faceless/composer.py.
