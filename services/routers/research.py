"""Research routes — KDP topic research and book generation."""
import json
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

research_router = APIRouter(prefix="", tags=["research"])

_research_engine: "ResearchEngine | None" = None


def _get_research_engine():
    global _research_engine
    if _research_engine is None:
        from services.research.engine import ResearchEngine
        _research_engine = ResearchEngine()
    return _research_engine


class BookshelfRequest(BaseModel):
    subject: str = Field(..., description="Book topic/subject")
    additional_instructions: str = ""
    long_mode: bool = False
    title_model: Optional[str] = None
    structure_model: Optional[str] = None
    section_model: Optional[str] = None


class ResearchNicheRequest(BaseModel):
    """Request model for researching trending book niches."""
    language: str = Field(default="en", description="ISO language code (en, id, ms, zh, etc.)")
    region: str = Field(default="", description="Target region/country")
    category: str = Field(default="", description="Optional category filter")
    count: int = Field(default=8, ge=3, le=20)
    source_hint: str = Field(default="", description="Optional market data hint")


class BookBriefRequest(BaseModel):
    """Request model for generating a book brief."""
    niche: str = Field(..., description="Book topic/niche")
    language: str = Field(default="en", description="Output language code")
    region: str = Field(default="", description="Target region")
    target_market: str = Field(default="", description="Specific demographic target")


class ResearchGenerateBookRequest(BaseModel):
    """Request model for full research → generation pipeline."""
    subject: str = Field(..., description="Book subject/topic")
    language: str = Field(default="en", description="Book language")
    region: str = Field(default="", description="Target region")
    additional_instructions: str = ""


@research_router.post("/research/topics")
async def research_topics(req: ResearchNicheRequest):
    """Research trending niches for a given language / region."""
    engine = _get_research_engine()
    niches = await engine.research_niches(
        language=req.language,
        region=req.region,
        category=req.category,
        count=req.count,
        source_hint=req.source_hint,
    )
    return {"niches": niches, "language": req.language}


@research_router.post("/research/book-brief")
async def research_book_brief(req: BookBriefRequest):
    """Generate a book brief with outline from a niche."""
    engine = _get_research_engine()
    brief = await engine.generate_book_brief(
        niche=req.niche,
        language=req.language,
        region=req.region,
        target_market=req.target_market,
    )
    return {"brief": brief}


@research_router.post("/research/generate-book")
async def research_generate_book(req: ResearchGenerateBookRequest):
    """Full pipeline: research brief → generate book content (SSE streamed)."""
    engine = _get_research_engine()

    async def _generate():
        # 1. brief (outline)
        try:
            brief = await engine.generate_book_brief(
                niche=req.subject,
                language=req.language,
                region=req.region,
            )
            yield f"data: {json.dumps({'type': 'brief', 'payload': brief})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': f'Brief generation failed: {e}'})}\n\n"
            return

        # 2. generate full book using existing bookshelf pipeline
        from services.bookshelf.engine import generate_book_pipeline

        sections = []
        try:
            async for event in generate_book_pipeline(
                req.subject,
                additional_instructions=req.additional_instructions,
                language=req.language,
            ):
                event_type = event.get("type")
                if event_type == "section_content":
                    payload = event.get("payload", {})
                    sections.append({
                        "index": event.get("current", 0),
                        "title": payload.get("title", ""),
                        "content": payload.get("content", ""),
                    })
                yield f"data: {json.dumps(event)}\n\n"

            book = "\n\n".join(
                f"# {s['title']}\n\n{s['content']}" for s in sections
            )
            yield f"data: {json.dumps({'type': 'complete', 'payload': {'subject': req.subject, 'language': req.language, 'sections': sections, 'word_count': len(book.split())}})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(_generate(), media_type="text/event-stream")


