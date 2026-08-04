"""REST API router for the Article engine.

Exposes ``POST /text/article`` delegating to
:class:`services.article.engine.ArticleEngine`.
"""
from fastapi import APIRouter, HTTPException

from services.api_models import ArticleRequest
from services.di import get_article

article_router = APIRouter(prefix="", tags=["article"])


@article_router.post("/text/article")
def generate_article(req: ArticleRequest):
    """Generate a long-form article (HTML or markdown) from a topic."""
    try:
        return get_article().generate(
            topic=req.topic,
            keywords=req.keywords,
            audience=req.audience,
            length_words=req.length_words,
            language=req.language,
            tone=req.tone,
            format=req.format,
        )
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - engine may raise anything
        raise HTTPException(status_code=500, detail=f"Article error: {exc}") from exc
