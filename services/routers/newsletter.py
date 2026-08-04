"""REST API router for the Newsletter engine.

Exposes ``POST /text/newsletter`` delegating to
:class:`services.newsletter.engine.NewsletterEngine`.
"""
from fastapi import APIRouter, HTTPException

from services.api_models import NewsletterRequest
from services.di import get_newsletter

newsletter_router = APIRouter(prefix="", tags=["newsletter"])


@newsletter_router.post("/text/newsletter")
def generate_newsletter(req: NewsletterRequest):
    """Generate an HTML email newsletter from a topic."""
    try:
        return get_newsletter().generate(
            topic=req.topic,
            audience=req.audience,
            sections=req.sections,
            tone=req.tone,
            language=req.language,
            brand_name=req.brand_name,
            cta_url=req.cta_url,
        )
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - engine may raise anything
        raise HTTPException(status_code=500, detail=f"Newsletter error: {exc}") from exc