"""Movie routes — short-film generation."""
import json
import os
from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field

from services.movie_gen.engine import generate_movie

movie_router = APIRouter(prefix="", tags=["movie"])

MOVIE_BASE = os.path.join(os.path.dirname(__file__), "..", "media", "movies")


class MovieGenerateRequest(BaseModel):
    prompt: str = Field(..., description="Video concept / story")
    genre: str = Field(default="general", description="Movie genre")
    language: str = Field(default="en", description="Language code")
    num_scenes: int = Field(default=8, ge=3, le=30, description="Number of scenes")
    style: str = Field(default="slideshow", description="Visual style")


@movie_router.post("/movie/generate")
async def movie_generate(req: MovieGenerateRequest):
    """Generate a short film: script -> scenes -> audio -> video (SSE streamed)."""
    async def _generate():
        try:
            style_map = {
                "slideshow": {"generate_images": True, "generate_audio": True, "generate_video": False},
                "full": {"generate_images": True, "generate_audio": True, "generate_video": True},
                "script_only": {"generate_images": False, "generate_audio": False, "generate_video": False},
            }
            gen_opts = style_map.get(req.style, {"generate_images": True, "generate_audio": True, "generate_video": True})
            async for event in generate_movie(
                prompt=req.prompt,
                genre=req.genre,
                language=req.language,
                num_scenes=req.num_scenes,
                **gen_opts,
            ):
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(_generate(), media_type="text/event-stream")


@movie_router.get("/movie/media/{path:path}")
async def movie_media(path: str):
    """Serve a generated movie file (cover image or video)."""
    base = Path(MOVIE_BASE).resolve()
    full = (base / path).resolve()
    if not str(full).startswith(str(base)):
        raise HTTPException(status_code=403, detail="Path traversal denied")
    if not full.exists():
        raise HTTPException(status_code=404, detail="File not found")

    ext = full.suffix.lower()
    media_type = (
        "image/png" if ext == ".png"
        else "image/jpeg" if ext in (".jpg", ".jpeg")
        else "video/mp4" if ext == ".mp4"
        else None
    )
    if not media_type:
        raise HTTPException(status_code=400, detail=f"Unsupported type: {ext}")

    return FileResponse(str(full), media_type=media_type)