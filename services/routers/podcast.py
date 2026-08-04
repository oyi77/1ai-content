"""REST API router for the Podcast engine.

Exposes ``POST /audio/podcast`` delegating to
:class:`services.podcast.engine.PodcastEngine`.
"""
from fastapi import APIRouter, HTTPException

from services.api_models import PodcastRequest
from services.di import get_podcast

podcast_router = APIRouter(prefix="", tags=["podcast"])


@podcast_router.post("/audio/podcast")
def generate_podcast(req: PodcastRequest):
    """Generate a podcast episode: TTS per segment + ffmpeg concat (+ BGM)."""
    try:
        return get_podcast().generate(
            title=req.title,
            segments=[s.model_dump() for s in req.segments],
            music_style=req.music_style,
            language=req.language,
            output_dir=req.output_dir,
        )
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - engine may raise anything
        raise HTTPException(status_code=500, detail=f"Podcast generation error: {exc}") from exc