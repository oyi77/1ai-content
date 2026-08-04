"""REST API router for the screen-record engine.

Exposes ``POST /video/screen-rec`` delegating to
:class:`services.screenrec.engine.ScreenRecEngine`.
"""
from fastapi import APIRouter, HTTPException

from services.api_models import ScreenRecRequest
from services.di import get_screenrec

screenrec_router = APIRouter(prefix="", tags=["screenrec"])


@screenrec_router.post("/video/screen-rec")
def record_screen(req: ScreenRecRequest):
    """Record the X display (or region) with optional narration."""
    try:
        return get_screenrec().capture(
            duration=req.duration,
            region=req.region,
            fps=req.fps,
            narration=req.narration,
            voice=req.voice,
            allow_headless=req.allow_headless,
            output_dir=req.output_dir,
        )
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - engine may raise anything
        raise HTTPException(status_code=500, detail=f"ScreenRec error: {exc}") from exc
