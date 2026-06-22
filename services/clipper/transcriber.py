"""Word-level transcription using faster-whisper."""

from __future__ import annotations

import logging
import subprocess
import tempfile
from pathlib import Path

logger = logging.getLogger(__name__)


class Transcriber:
    """Lazy-loaded word-level speech-to-text via faster-whisper."""

    def __init__(
        self,
        model_size: str = "base",
        device: str = "cpu",
        compute_type: str = "int8",
    ) -> None:
        self._model_size = model_size
        self._device = device
        self._compute_type = compute_type
        self._model = None

    # ------------------------------------------------------------------
    # internal helpers
    # ------------------------------------------------------------------

    def _ensure_model(self):
        if self._model is None:
            from faster_whisper import WhisperModel

            logger.info(
                "Loading faster-whisper model=%s device=%s compute=%s",
                self._model_size,
                self._device,
                self._compute_type,
            )
            self._model = WhisperModel(
                self._model_size,
                device=self._device,
                compute_type=self._compute_type,
            )

    # ------------------------------------------------------------------
    # public API
    # ------------------------------------------------------------------

    def transcribe(
        self, audio_path: str, language: str | None = None
    ) -> dict:
        """Transcribe an audio file with word-level timestamps.

        Returns::

            {
                "success": bool,
                "language": str,
                "segments": [
                    {
                        "start": float,
                        "end": float,
                        "text": str,
                        "words": [{"start": float, "end": float, "word": str}],
                    }
                ],
                "full_text": str,
                "duration": float,
            }
        """
        audio_path = str(audio_path)
        if not Path(audio_path).is_file():
            return {
                "success": False,
                "language": language or "",
                "segments": [],
                "full_text": "",
                "duration": 0.0,
                "error": f"Audio file not found: {audio_path}",
            }

        try:
            self._ensure_model()

            kwargs: dict = {"word_timestamps": True}
            if language:
                kwargs["language"] = language

            raw_segments, info = self._model.transcribe(audio_path, **kwargs)

            segments: list[dict] = []
            full_parts: list[str] = []

            for seg in raw_segments:
                words = []
                for w in seg.words:
                    words.append(
                        {
                            "start": round(w.start, 3),
                            "end": round(w.end, 3),
                            "word": w.word,
                        }
                    )
                segments.append(
                    {
                        "start": round(seg.start, 3),
                        "end": round(seg.end, 3),
                        "text": seg.text.strip(),
                        "words": words,
                    }
                )
                full_parts.append(seg.text.strip())

            return {
                "success": True,
                "language": info.language,
                "segments": segments,
                "full_text": " ".join(full_parts),
                "duration": round(info.duration, 3),
            }

        except Exception as exc:
            logger.exception("Transcription failed for %s", audio_path)
            return {
                "success": False,
                "language": language or "",
                "segments": [],
                "full_text": "",
                "duration": 0.0,
                "error": str(exc),
            }

    def transcribe_from_video(
        self, video_path: str, language: str | None = None
    ) -> dict:
        """Extract audio from *video_path* via ffmpeg, then transcribe.

        Same return shape as :meth:`transcribe`.
        """
        video_path = str(video_path)
        if not Path(video_path).is_file():
            return {
                "success": False,
                "language": language or "",
                "segments": [],
                "full_text": "",
                "duration": 0.0,
                "error": f"Video file not found: {video_path}",
            }

        try:
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                wav_path = tmp.name

            cmd = [
                "ffmpeg",
                "-y",
                "-i", video_path,
                "-vn",
                "-acodec", "pcm_s16le",
                "-ar", "16000",
                "-ac", "1",
                wav_path,
            ]
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=120,
            )
            if result.returncode != 0:
                return {
                    "success": False,
                    "language": language or "",
                    "segments": [],
                    "full_text": "",
                    "duration": 0.0,
                    "error": f"ffmpeg failed: {result.stderr[:500]}",
                }

            return self.transcribe(wav_path, language=language)

        except Exception as exc:
            logger.exception("Video transcription failed for %s", video_path)
            return {
                "success": False,
                "language": language or "",
                "segments": [],
                "full_text": "",
                "duration": 0.0,
                "error": str(exc),
            }
