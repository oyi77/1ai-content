#!/usr/bin/env python3
"""Podcast Engine — spoken-episode assembly from scripted segments.

For each segment (a dict with ``speaker``/``voice``/``rate``/``text``) it
synthesizes TTS audio via :class:`services.tts.TTSEngine`, concatenates all
segment clips with ffmpeg's concat demuxer, and optionally mixes a background
music bed (``music_style``) underneath via ``amix``.

All heavy deps (TTS / Music singletons from ``services.di``) are imported
*lazily* inside the method so importing this module never reaches the network
or the DI layer.

Every public method returns a plain JSON-serializable ``dict`` beginning with
``success: bool``. Subprocess / engine failures raise ``RuntimeError`` so the
router can wrap them into an HTTP 500; domain-level failures (e.g. no
segments) return ``{"success": False, ...}``.
"""
import subprocess
import tempfile
from pathlib import Path

from typing import Optional


class PodcastEngine:
    """Assemble a podcast episode: per-segment TTS + ffmpeg concat + BGM."""

    def generate(
        self,
        title: str,
        segments: list,
        music_style: Optional[str] = None,
        language: str = "id",
        output_dir: Optional[str] = None,
    ) -> dict:
        """Synthesize each segment and stitch them into a single audio file.

        Args:
            title: Episode title (returned verbatim).
            segments: List of dicts with keys ``speaker``, ``voice``, ``rate``,
                ``text`` (``text`` is required).
            music_style: Optional BGM theme passed to MusicGenerator.generate_bgm.
            language: Language code passed to each TTS synthesize call.
            output_dir: Where to write the episode + intermediates. Defaults to
                a fresh ``tempfile.mkdtemp(prefix="podcast_")``.

        Returns:
            ``{"success": True, "audio_path", "title", "segments": N,
            "language", "output_dir"}``
        """
        if not segments:
            return {"success": False, "error": "No segments provided"}

        work_dir = Path(output_dir) if output_dir else Path(
            tempfile.mkdtemp(prefix="podcast_")
        )
        work_dir.mkdir(parents=True, exist_ok=True)

        # 1. Synthesize every segment via TTS.
        segment_paths = []
        for idx, seg in enumerate(segments):
            from services.di import get_tts  # lazy, keep module import side-effect free

            voice = seg.get("voice") or None
            rate = seg.get("rate") or None
            result = get_tts().synthesize(
                text=seg["text"],
                voice=voice,
                language=language,
                rate=rate,
            )
            if not result.get("success"):
                err = result.get("error") or "unknown TTS error"
                raise RuntimeError(f"Podcast segment {idx} ({seg.get('speaker', '?')}) TTS failed: {err}")
            segment_paths.append(result["audio_path"])

        # 2. Write the concat demuxer list file.
        list_file = work_dir / "concat_list.txt"
        list_file.write_text(
            "".join(f"file '{path}'\n" for path in segment_paths),
            encoding="utf-8",
        )

        # 3. Concatenate with codec copy; fall back to aac re-encode on mismatch.
        episode_path = work_dir / "episode.mp3"
        try:
            proc = subprocess.run(
                [
                    "ffmpeg", "-y", "-f", "concat", "-safe", "0",
                    "-i", str(list_file), "-c", "copy", str(episode_path),
                ],
                capture_output=True, text=True, timeout=120,
            )
            if proc.returncode != 0:
                fallback = work_dir / "episode.m4a"
                proc = subprocess.run(
                    [
                        "ffmpeg", "-y", "-f", "concat", "-safe", "0",
                        "-i", str(list_file), "-c:a", "aac", str(fallback),
                    ],
                    capture_output=True, text=True, timeout=120,
                )
                if proc.returncode != 0:
                    raise RuntimeError(
                        f"Podcast concat failed: {proc.stderr.strip() or proc.returncode}"
                    )
                episode_path = fallback
        except FileNotFoundError as exc:
            raise RuntimeError("Podcast concat failed: ffmpeg not found") from exc

        audio_path = str(episode_path)

        # 4. Optionally mix a background music bed.
        if music_style:
            from services.di import get_music  # lazy

            bgm = get_music().generate_bgm(theme=music_style)
            if not bgm.get("success"):
                raise RuntimeError(
                    f"Podcast BGM generation failed: {bgm.get('error') or 'unknown music error'}"
                )
            mixed_path = work_dir / "episode_with_bgm.m4a"
            try:
                proc = subprocess.run(
                    [
                        "ffmpeg", "-y",
                        "-i", str(episode_path),
                        "-i", bgm["audio_path"],
                        "-filter_complex", "amix=inputs=2:duration=first:dropout_transition=2",
                        "-c:a", "aac", str(mixed_path),
                    ],
                    capture_output=True, text=True, timeout=120,
                )
            except FileNotFoundError as exc:
                raise RuntimeError("Podcast BGM mix failed: ffmpeg not found") from exc
            if proc.returncode != 0:
                raise RuntimeError(
                    f"Podcast BGM mix failed: {proc.stderr.strip() or proc.returncode}"
                )
            audio_path = str(mixed_path)

        return {
            "success": True,
            "audio_path": audio_path,
            "title": title,
            "segments": len(segments),
            "language": language,
            "output_dir": str(work_dir),
        }