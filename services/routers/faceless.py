"""REST API router for the Faceless video engine.

Exposes ``POST /faceless/generate``, ``POST /faceless/product`` and
``POST /faceless/batch`` delegating to
:class:`services.faceless.engine.FacelessEngine`.
"""
from fastapi import APIRouter, HTTPException

from services.api_models import (
    FacelessBatchRequest,
    FacelessGenerateRequest,
    FacelessProductRequest,
)
from services.di import get_faceless

faceless_router = APIRouter(prefix="", tags=["faceless"])


@faceless_router.post("/faceless/generate")
def generate_video(req: FacelessGenerateRequest):
    """Generate a faceless video from a topic."""
    try:
        return get_faceless().generate_video(
            topic=req.topic,
            style=req.style,
            platform=req.platform,
            language=req.language,
            num_scenes=req.num_scenes,
            use_ab_split=req.use_ab_split,
            add_captions=req.add_captions,
            bgm_path=req.bgm_path,
        )
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - engine may raise anything
        raise HTTPException(status_code=500, detail=f"Faceless generation error: {exc}") from exc


@faceless_router.post("/faceless/product")
def generate_product_video(req: FacelessProductRequest):
    """Generate a faceless product promo video."""
    try:
        return get_faceless().generate_product_video(
            product_name=req.product_name,
            product_desc=req.product_desc,
            price=req.price,
            style=req.style,
            platform=req.platform,
            language=req.language,
        )
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - engine may raise anything
        raise HTTPException(status_code=500, detail=f"Faceless product error: {exc}") from exc


@faceless_router.post("/faceless/batch")
def batch_generate(req: FacelessBatchRequest):
    """Batch-generate faceless videos from a clone plan."""
    try:
        return get_faceless().batch_generate(
            clone_plan=req.clone_plan,
            platform=req.platform,
            language=req.language,
            max_videos=req.max_videos,
        )
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - engine may raise anything
        raise HTTPException(status_code=500, detail=f"Faceless batch error: {exc}") from exc
