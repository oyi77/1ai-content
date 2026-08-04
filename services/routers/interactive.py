"""REST API router for the Interactive (branching-video) engine.

Exposes ``POST /video/interactive`` delegating to
:class:`services.interactive.engine.InteractiveEngine.build`.
"""
from fastapi import APIRouter, HTTPException

from services.api_models import InteractiveRequest
from services.di import get_interactive

interactive_router = APIRouter(prefix="", tags=["interactive"])


@interactive_router.post("/video/interactive")
def build_interactive(req: InteractiveRequest):
    """Build an interactive/branching-video manifest from a node graph."""
    try:
        return get_interactive().build(
            title=req.title,
            start_id=req.start_id,
            nodes=[n.model_dump() for n in req.nodes],
            output_dir=None,
        )
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - engine may raise anything
        raise HTTPException(status_code=500, detail=f"Interactive error: {exc}") from exc