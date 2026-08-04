"""REST API router for the Subtitles engine.

Exposes ``POST /video/subtitles`` delegating to
:class:`services.subtitles.engine.SubtitlesEngine`.
"""
from fastapi import APIRouter, HTTPException

from services.api_models import CaptionsMultiRequest
from services.di import get_subtitles

subtitles_router = APIRouter(prefix="", tags=["subtitles"])


@subtitles_router.post("/video/subtitles")
def burn_subtitles(req: CaptionsMultiRequest):
    """Burn subtitle segments onto a video."""
    try:
        return get_subtitles().burn(
            video_path=req.video_path,
            segments=[s.model_dump() for s in req.segments],
            style=req.style,
            font_size=req.font_size,
            output_dir=req.output_dir,
        )
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - engine may raise anything
        raise HTTPException(status_code=500, detail=f"Subtitles error: {exc}") from exc
