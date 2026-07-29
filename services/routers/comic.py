"""Comic routes — comic/manga/manhwa generation."""
import json
from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field

comic_router = APIRouter(prefix="", tags=["comic"])


class ComicGenerateRequest(BaseModel):
    prompt: str = Field(..., description="Story concept / premise")
    format: str = Field(default="comic", description="comic / manga / manhwa")
    language: str = Field(default="en", description="Language code")
    pages_per_episode: int = Field(default=5, ge=1, le=30, description="Pages per episode")
    num_episodes: int = Field(default=1, ge=1, le=10, description="Number of episodes")
    generate_images: bool = Field(default=False, description="Render panel images (slow)")


@comic_router.post("/comic/generate")
async def comic_generate(req: ComicGenerateRequest):
    """Generate a comic/manga/manhwa: script -> panels -> pages (SSE streamed)."""
    async def _generate():
        try:
            from services.comic_gen.comic_types import ComicFormat
            from services.comic_gen.engine import generate_comic_pipeline
            fmt = ComicFormat(req.format)
            async for event in generate_comic_pipeline(
                prompt=req.prompt,
                fmt=fmt,
                language=req.language,
                pages_per_episode=req.pages_per_episode,
                num_episodes=req.num_episodes,
                generate_images=req.generate_images,
            ):
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(_generate(), media_type="text/event-stream")


@comic_router.get("/comic/page/{path:path}")
async def comic_page(path: str):
    """Serve a generated comic page image."""
    full_path = Path(__file__).resolve().parent.parent.parent / "data" / "comic" / path
    if not full_path.exists():
        full_path = full_path.with_suffix(".png")
    if not full_path.exists():
        raise HTTPException(status_code=404, detail="Page not found")
    return FileResponse(str(full_path), media_type="image/png")