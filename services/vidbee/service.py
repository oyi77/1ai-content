"""
VidBee Service — Video Download API
Wraps yt-dlp for downloading videos from any website.
Runs on port 8772.
"""

import os
import json
import uuid
import asyncio
import logging
from pathlib import Path
from datetime import datetime

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, HttpUrl
import yt_dlp

logger = logging.getLogger("vidbee")

app = FastAPI(title="VidBee Service", version="1.0.0")

DOWNLOAD_DIR = Path("/tmp/vidbee_downloads")
DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)

MAX_DURATION = 600  # 10 minutes max
MAX_FILE_SIZE = 500 * 1024 * 1024  # 500MB max


class DownloadRequest(BaseModel):
    url: str
    format: str = "mp4"
    quality: str = "best"  # best, 720p, 480p, 360p
    audio_only: bool = False
    max_duration: int = MAX_DURATION


class DownloadResponse(BaseModel):
    success: bool
    job_id: str
    filename: str = ""
    title: str = ""
    duration: float = 0
    filesize: int = 0
    thumbnail: str = ""
    download_path: str = ""
    error: str = ""


class VideoInfo(BaseModel):
    url: str


class VideoInfoResponse(BaseModel):
    success: bool
    title: str = ""
    duration: float = 0
    thumbnail: str = ""
    uploader: str = ""
    view_count: int = 0
    formats: list = []
    error: str = ""


def _get_ydl_opts(req: DownloadRequest, output_path: str) -> dict:
    """Build yt-dlp options from request."""
    format_str = "bestaudio/best" if req.audio_only else "best[ext=mp4]/best"

    if req.quality == "720p" and not req.audio_only:
        format_str = "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720]"
    elif req.quality == "480p" and not req.audio_only:
        format_str = "bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480]"
    elif req.quality == "360p" and not req.audio_only:
        format_str = "bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]/best[height<=360]"

    opts = {
        "format": format_str,
        "outtmpl": output_path,
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "socket_timeout": 30,
        "retries": 3,
        "max_filesize": MAX_FILE_SIZE,
        "extractor_args": {"youtube": {"skip": ["dash", "hls"]}},
    }

    if req.audio_only:
        opts["postprocessors"] = [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "mp3",
            "preferredquality": "192",
        }]

    return opts


@app.get("/health")
async def health():
    return {"status": "ok", "service": "vidbee", "timestamp": datetime.utcnow().isoformat()}


@app.post("/download", response_model=DownloadResponse)
async def download_video(req: DownloadRequest):
    """Download a video from any supported URL."""
    job_id = str(uuid.uuid4())[:12]
    ext = "mp3" if req.audio_only else "mp4"
    output_template = str(DOWNLOAD_DIR / f"{job_id}.%(ext)s")

    opts = _get_ydl_opts(req, output_template)

    try:
        info = await asyncio.get_event_loop().run_in_executor(
            None, _download_and_extract, req.url, opts
        )

        # Find the actual output file
        output_file = None
        for f in DOWNLOAD_DIR.glob(f"{job_id}.*"):
            output_file = f
            break

        if not output_file:
            return DownloadResponse(
                success=False,
                job_id=job_id,
                error="Download completed but output file not found",
            )

        duration = info.get("duration", 0)
        if duration and duration > req.max_duration:
            output_file.unlink(missing_ok=True)
            return DownloadResponse(
                success=False,
                job_id=job_id,
                error=f"Video duration ({duration}s) exceeds max ({req.max_duration}s)",
            )

        return DownloadResponse(
            success=True,
            job_id=job_id,
            filename=output_file.name,
            title=info.get("title", ""),
            duration=duration or 0,
            filesize=output_file.stat().st_size,
            thumbnail=info.get("thumbnail", ""),
            download_path=f"/file/{job_id}",
        )

    except Exception as e:
        logger.error(f"Download failed for {req.url}: {e}")
        return DownloadResponse(success=False, job_id=job_id, error=str(e))


@app.post("/info", response_model=VideoInfoResponse)
async def get_video_info(req: VideoInfo):
    """Get video metadata without downloading."""
    try:
        info = await asyncio.get_event_loop().run_in_executor(
            None, _extract_info, req.url
        )

        formats = []
        for f in info.get("formats", []):
            if f.get("vcodec") != "none" or f.get("acodec") != "none":
                formats.append({
                    "format_id": f.get("format_id"),
                    "ext": f.get("ext"),
                    "resolution": f.get("resolution", "audio only"),
                    "filesize": f.get("filesize"),
                    "fps": f.get("fps"),
                })

        return VideoInfoResponse(
            success=True,
            title=info.get("title", ""),
            duration=info.get("duration", 0),
            thumbnail=info.get("thumbnail", ""),
            uploader=info.get("uploader", ""),
            view_count=info.get("view_count", 0),
            formats=formats[:20],  # Limit to 20 formats
        )

    except Exception as e:
        logger.error(f"Info extraction failed for {req.url}: {e}")
        return VideoInfoResponse(success=False, error=str(e))


@app.get("/file/{job_id}")
async def serve_file(job_id: str):
    """Serve a downloaded file."""
    for f in DOWNLOAD_DIR.glob(f"{job_id}.*"):
        if f.is_file():
            return FileResponse(
                path=str(f),
                filename=f.name,
                media_type="application/octet-stream",
            )
    raise HTTPException(status_code=404, detail="File not found")


@app.delete("/file/{job_id}")
async def delete_file(job_id: str):
    """Delete a downloaded file."""
    deleted = False
    for f in DOWNLOAD_DIR.glob(f"{job_id}.*"):
        if f.is_file():
            f.unlink()
            deleted = True
    return {"deleted": deleted, "job_id": job_id}


def _download_and_extract(url: str, opts: dict) -> dict:
    """Synchronous download + info extraction."""
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=True)
        return {
            "title": info.get("title", ""),
            "duration": info.get("duration", 0),
            "thumbnail": info.get("thumbnail", ""),
            "uploader": info.get("uploader", ""),
        }


def _extract_info(url: str) -> dict:
    """Synchronous info extraction only."""
    with yt_dlp.YoutubeDL({"quiet": True, "no_warnings": True}) as ydl:
        return ydl.extract_info(url, download=False)


if __name__ == "__main__":
    import uvicorn
    logging.basicConfig(level=logging.INFO)
    uvicorn.run(app, host="0.0.0.0", port=8772)
