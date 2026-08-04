# Podcast Engine (services/podcast)

Purpose: assemble a spoken podcast episode from scripted segments — per-segment
TTS + ffmpeg concat + optional background-music bed.

## Engine API
- `PodcastEngine.generate(title, segments, music_style=None, language="id",
  output_dir=None) -> dict`
  - `segments`: list of dicts with keys `speaker`/`voice`/`rate`/`text` (from
    `PodcastSegment` model).
  - Returns `{success, audio_path, title, segments: N, language, output_dir}`.

## HTTP endpoint
- `POST /audio/podcast` (tags `["podcast"]`), body `PodcastRequest`.

## Test
- `cd services && python3 -m pytest tests/test_podcast_api.py -q`

## Reuse anchors
- `services/tts/engine.py` — `TTSEngine.synthesize(text, voice, language,
  output_path, rate, pitch)` → `{success, audio_path, ...}`.
- `services/music/generator.py` — `MusicGenerator.generate_bgm(theme)` →
  `{success, audio_path, ...}`.
- TTS/Music singletons fetched lazily via `services.di.get_tts()` /
  `get_music()` inside `generate()` (no module-level DI imports).