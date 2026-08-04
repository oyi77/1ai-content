"""REST API router for the Infographic engine.

Exposes ``POST /infographic/generate`` delegating to
:class:`services.infographic.engine.InfographicEngine`.
"""
from fastapi import APIRouter, HTTPException

from services.api_models import InfographicRequest
from services.di import get_infographic

infographic_router = APIRouter(prefix="", tags=["infographic"])


@infographic_router.post("/infographic/generate")
def generate_infographic(req: InfographicRequest):
    """Generate an infographic PNG from labeled data points."""
    try:
        return get_infographic().generate(
            title=req.title,
            data_points=[d.model_dump() for d in req.data_points],
            chart_kind=req.chart_kind,
            theme=req.theme,
            output_dir=req.output_dir,
        )
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - engine may raise anything
        raise HTTPException(status_code=500, detail=f"Infographic error: {exc}") from exc