"""REST API router for the Article engine.

Exposes ``POST /text/article`` delegating to
:class:`services.article.engine.ArticleEngine`, plus ``GET /text/articles``
and ``GET /text/articles/{slug}`` backed by the SQLite side-store
(:mod:`services.article.store`).
"""
from fastapi import APIRouter, HTTPException

from services.api_models import ArticleRequest
from services.article.store import get_article_store
from services.di import get_article

article_router = APIRouter(prefix="", tags=["article"])


@article_router.post("/text/article")
def generate_article(req: ArticleRequest):
    """Generate a long-form article (HTML or markdown) from a topic.

    On success the article is persisted and the response gains a ``slug``
    field used by ``GET /text/articles/{slug}``.
    """
    try:
        result = get_article().generate(
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

    if result.get("success"):
        try:
            result["slug"] = get_article_store().save(result)
        except Exception as exc:  # pragma: no cover - storage must not break generation
            raise HTTPException(status_code=500, detail=f"Article storage error: {exc}") from exc
    return result


@article_router.get("/text/articles")
def list_articles(limit: int = 50):
    """List persisted articles (metadata only, newest first)."""
    return {"success": True, "articles": get_article_store().list(limit=limit)}


@article_router.get("/text/articles/{slug}")
def get_article_by_slug(slug: str):
    """Fetch one persisted article by slug; 404 when unknown."""
    record = get_article_store().get(slug)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Article not found: {slug}")
    return {"success": True, "article": record}
