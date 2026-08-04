"""REST API router for the Meme engine.

Exposes ``POST /meme/generate`` delegating to
:class:`services.meme.engine.MemeEngine`.
"""
from fastapi import APIRouter, HTTPException

from services.api_models import MemeRequest
from services.di import get_meme

meme_router = APIRouter(prefix="", tags=["meme"])


@meme_router.post("/meme/generate")
def generate_meme(req: MemeRequest):
    """Render a meme PNG from a layout template."""
    try:
        return get_meme().generate(
            template_id=req.template_id,
            top_text=req.top_text,
            bottom_text=req.bottom_text,
            image_url=req.image_url,
            output_dir=req.output_dir,
        )
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - engine may raise anything
        raise HTTPException(status_code=500, detail=f"Meme generation error: {exc}") from exc
