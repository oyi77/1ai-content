"""REST API router for per-user brand settings and watermarking.

Exposes ``POST /brand/set``, ``GET /brand/{user_id}`` and
``POST /brand/watermark`` delegating to
:class:`services.brand.settings.BrandSettings`.
"""
from fastapi import APIRouter, HTTPException

from services.api_models import BrandSetRequest, BrandWatermarkRequest
from services.di import get_brand

brand_router = APIRouter(prefix="", tags=["brand"])


@brand_router.post("/brand/set")
def set_brand(req: BrandSetRequest):
    """Create or update brand settings for a user."""
    try:
        return get_brand().set_brand(req.user_id, req.model_dump(exclude={"user_id"}))
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - engine may raise anything
        raise HTTPException(status_code=500, detail=f"Brand error: {exc}") from exc


@brand_router.get("/brand/{user_id}")
def get_brand_settings(user_id: str):
    """Return brand settings for a user, or 404 when none exist."""
    result = get_brand().get_brand(user_id)
    if not result.get("success"):
        raise HTTPException(status_code=404, detail=result.get("error", "No brand settings"))
    return {"success": True, "user_id": user_id, "settings": result["settings"]}


@brand_router.post("/brand/watermark")
def apply_watermark(req: BrandWatermarkRequest):
    """Apply a user's watermark to a video, returning the output path."""
    try:
        output_path = get_brand().apply_watermark(req.video_path, req.user_id, req.output_path)
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - engine may raise anything
        raise HTTPException(status_code=500, detail=f"Brand watermark error: {exc}") from exc
    return {"success": True, "output_path": output_path}
