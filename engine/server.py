"""1ai-content Download Engine — REST API.

Runs on port 9012. Called by 1ai-hub workflow orchestrator.
"""

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from download import download_video


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(
    title="1ai-content",
    description="Content engine: download, remake, sheet loader",
    version="0.1.0",
    lifespan=lifespan,
)


# ── Schemas ─────────────────────────────────────────────────────────


class DownloadRequest(BaseModel):
    video_url: str
    category: str = "general"


class RemakeRequest(BaseModel):
    file_path: str
    style: str = "default"
    caption: str = ""



# ── Endpoints ───────────────────────────────────────────────────────


@app.get("/health")
async def health():
    return {"status": "ok", "service": "1ai-content"}


@app.post("/api/content/download")
async def download(req: DownloadRequest):
    """Download a single video using the full cascade.

    Cascade: tikwm → yt-dlp → Vidbee → Cobalt → CloakBrowser → scrape → cover → placeholder
    """
    result = await download_video(req.video_url, req.category)

    # Add file_size if file exists
    if result.get("file_path") and os.path.exists(result["file_path"]):
        result["file_size"] = os.path.getsize(result["file_path"])

    return {"data": result}


@app.post("/api/content/remake")
async def remake(req: RemakeRequest):
    """Remake content — trim, overlay, caption, hashtags.

    TODO: Implement actual remake logic.
    For now, returns the original file with generated caption.
    """
    if not os.path.exists(req.file_path):
        raise HTTPException(404, f"File not found: {req.file_path}")

    # Placeholder: return original file with basic caption
    caption = req.caption or f"Check out this {req.style} content!"
    hashtags = f"#{req.style.replace(' ', '')} #content #viral"

    return {
        "data": {
            "remade_path": req.file_path,
            "caption": caption,
            "hashtags": hashtags,
            "style": req.style,
        }
    }



if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=9012, log_level="info")
