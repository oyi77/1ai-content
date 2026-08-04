"""REST API router for the Clipper engine (highlight clip extraction).

Exposes ``POST /clipper/clip`` which delegates to
:meth:`services.clipper.engine.ClipperEngine.clip_video`.
"""
from fastapi import APIRouter, HTTPException

from services.api_models import ClipperClipRequest
from services.di import get_clipper

clipper_router = APIRouter(prefix="", tags=["clipper"])


@clipper_router.post("/clipper/clip")
def clip_video(req: ClipperClipRequest):
    """Clip a source video into highlight segments.

    Returns the engine result dict (index, clip_path, thumbnail_path,
    start, end, duration, ...) or raises 500 on engine failure.
    """
    try:
        return get_clipper().clip_video(
            source=req.source,
            num_clips=req.num_clips,
            clip_duration=req.clip_duration,
            platform=req.platform,
            language=req.language,
            reframe_vertical=req.reframe_vertical,
            add_subtitles=req.add_subtitles,
            add_thumbnails=req.add_thumbnails,
        )
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - engine may raise anything
        raise HTTPException(status_code=500, detail=f"Clipper error: {exc}") from exc
