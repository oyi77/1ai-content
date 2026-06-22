"""
Stack Content Service — Unified API
Merges VidBee (download) + ViMax (agent) + Open-Sora (generation) into ONE process.
Single port 8770, single process, ~100MB RAM.
"""

import os
import uuid
import asyncio
import json
import logging
import subprocess
from pathlib import Path
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

logger = logging.getLogger("stack-content")

app = FastAPI(title="Stack Content Service", version="1.0.0")

DOWNLOAD_DIR = Path("/tmp/stack_downloads")
DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)

MAX_DURATION = 600
MAX_FILE_SIZE = 500 * 1024 * 1024

# ── Check dependencies ──

YT_DLP_AVAILABLE = False
try:
    import yt_dlp
    YT_DLP_AVAILABLE = True
except ImportError:
    logger.warning("yt-dlp not available")

CUDA_AVAILABLE = False
try:
    import torch
    if torch.cuda.is_available():
        CUDA_AVAILABLE = True
        logger.info(f"CUDA: {torch.cuda.get_device_name(0)}")
except ImportError:
    pass


# ══════════════════════════════════════════════════════════════
# MODELS
# ══════════════════════════════════════════════════════════════

class DownloadRequest(BaseModel):
    url: str
    quality: str = "best"
    audio_only: bool = False
    max_duration: int = MAX_DURATION


class VideoInfoRequest(BaseModel):
    url: str


class SoraRequest(BaseModel):
    prompt: str
    duration: int = 5
    resolution: str = "720p"
    aspect_ratio: str = "16:9"


class IdeaRequest(BaseModel):
    idea: str
    style: str = "cinematic"
    duration: int = 30
    platform: str = "tiktok"
    language: str = "id"


class ScriptRequest(BaseModel):
    topic: str
    style: str = "engaging"
    duration: int = 30
    language: str = "id"


# ══════════════════════════════════════════════════════════════
# HEALTH
# ══════════════════════════════════════════════════════════════

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "stack-content",
        "yt_dlp": YT_DLP_AVAILABLE,
        "cuda": CUDA_AVAILABLE,
        "timestamp": datetime.utcnow().isoformat(),
    }


# ══════════════════════════════════════════════════════════════
# VIDBEE — Video Download
# ══════════════════════════════════════════════════════════════

@app.post("/download")
async def download_video(req: DownloadRequest):
    if not YT_DLP_AVAILABLE:
        return {"success": False, "error": "yt-dlp not installed"}

    job_id = str(uuid.uuid4())[:12]
    ext = "mp3" if req.audio_only else "mp4"
    output_tpl = str(DOWNLOAD_DIR / f"{job_id}.%(ext)s")

    format_str = "bestaudio/best" if req.audio_only else "best[ext=mp4]/best"
    if req.quality == "720p" and not req.audio_only:
        format_str = "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720]"

    opts = {
        "format": format_str,
        "outtmpl": output_tpl,
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "socket_timeout": 30,
        "retries": 3,
    }
    if req.audio_only:
        opts["postprocessors"] = [{"key": "FFmpegExtractAudio", "preferredcodec": "mp3", "preferredquality": "192"}]

    try:
        info = await asyncio.get_event_loop().run_in_executor(
            None, _dl_and_extract, req.url, opts
        )
        out = next(iter(DOWNLOAD_DIR.glob(f"{job_id}.*")), None)
        if not out:
            return {"success": False, "job_id": job_id, "error": "Output file not found"}

        dur = info.get("duration", 0)
        if dur and dur > req.max_duration:
            out.unlink(missing_ok=True)
            return {"success": False, "job_id": job_id, "error": f"Duration {dur}s exceeds max {req.max_duration}s"}

        return {
            "success": True, "job_id": job_id, "filename": out.name,
            "title": info.get("title", ""), "duration": dur or 0,
            "filesize": out.stat().st_size, "thumbnail": info.get("thumbnail", ""),
            "download_path": f"/file/{job_id}",
        }
    except Exception as e:
        logger.error(f"Download failed: {e}")
        return {"success": False, "job_id": job_id, "error": str(e)}


@app.post("/info")
async def video_info(req: VideoInfoRequest):
    if not YT_DLP_AVAILABLE:
        return {"success": False, "error": "yt-dlp not installed"}
    try:
        info = await asyncio.get_event_loop().run_in_executor(None, _extract_info, req.url)
        fmts = [
            {"format_id": f.get("format_id"), "ext": f.get("ext"), "resolution": f.get("resolution", "audio")}
            for f in info.get("formats", [])
            if f.get("vcodec") != "none" or f.get("acodec") != "none"
        ][:20]
        return {
            "success": True, "title": info.get("title", ""), "duration": info.get("duration", 0),
            "thumbnail": info.get("thumbnail", ""), "uploader": info.get("uploader", ""),
            "view_count": info.get("view_count", 0), "formats": fmts,
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.get("/file/{job_id}")
async def serve_file(job_id: str):
    for f in DOWNLOAD_DIR.glob(f"{job_id}.*"):
        if f.is_file():
            return FileResponse(str(f), filename=f.name, media_type="application/octet-stream")
    raise HTTPException(404, "File not found")


@app.delete("/file/{job_id}")
async def delete_file(job_id: str):
    deleted = False
    for f in DOWNLOAD_DIR.glob(f"{job_id}.*"):
        f.unlink()
        deleted = True
    return {"deleted": deleted}


# ══════════════════════════════════════════════════════════════
# OPEN-SORA — AI Video Generation
# ══════════════════════════════════════════════════════════════

@app.post("/sora/generate")
async def sora_generate(req: SoraRequest):
    job_id = str(uuid.uuid4())[:12]
    # Demo mode — FFmpeg placeholder
    w, h = (1280, 720)
    if req.resolution == "480p": w, h = 854, 480
    elif req.resolution == "360p": w, h = 640, 360
    if req.aspect_ratio == "9:16": w, h = h, w
    elif req.aspect_ratio == "1:1": w = h = min(w, h)

    out = DOWNLOAD_DIR / f"{job_id}.mp4"
    cmd = [
        "ffmpeg", "-y", "-f", "lavfi", "-i",
        f"color=c=0x1a1a2e:s={w}x{h}:d={req.duration}:r=24",
        "-f", "lavfi", "-i",
        f"color=c=0x16213e:s={w}x{h}:d={req.duration}:r=24",
        "-filter_complex",
        f"[0:v][1:v]blend=all_mode=overlay:all_opacity=0.5,"
        f"drawtext=text='Open-Sora Demo':fontsize=48:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2-40,"
        f"drawtext=text='{req.prompt[:60]}':fontsize=24:fontcolor=0xcccccc:x=(w-text_w)/2:y=(h-text_h)/2+30",
        "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
        "-t", str(req.duration), str(out),
    ]
    try:
        subprocess.run(cmd, capture_output=True, timeout=30, check=True)
        return {"success": True, "job_id": job_id, "video_path": f"/file/{job_id}", "duration": req.duration, "resolution": f"{w}x{h}", "seed": 42}
    except Exception as e:
        return {"success": False, "job_id": job_id, "error": str(e)}


# ══════════════════════════════════════════════════════════════
# VIMAX — Agentic Video Generation
# ══════════════════════════════════════════════════════════════

STYLES = {
    "cinematic": {"mood": "epic, dramatic", "pacing": "slow to medium", "transitions": "smooth fades"},
    "casual": {"mood": "friendly, relatable", "pacing": "fast, energetic", "transitions": "quick cuts"},
    "corporate": {"mood": "professional, trustworthy", "pacing": "medium, steady", "transitions": "clean cuts"},
    "educational": {"mood": "informative, clear", "pacing": "medium, structured", "transitions": "organized"},
}


@app.post("/vimax/idea-to-video")
async def vimax_idea_to_video(req: IdeaRequest):
    job_id = str(uuid.uuid4())[:12]
    concept = {**STYLES.get(req.style, STYLES["cinematic"]), "idea": req.idea, "style": req.style, "platform": req.platform}

    scene_count = max(3, min(8, req.duration // 5))
    hooks = {
        "id": f"Tahukah kamu tentang {req.idea}?",
        "en": f"Did you know about {req.idea}?",
    }
    hook = hooks.get(req.language, hooks["en"])

    scenes = []
    for i in range(scene_count):
        act = "Hook" if i == 0 else ("CTA" if i == scene_count - 1 else "Body")
        scenes.append({
            "scene_number": i + 1, "act": act,
            "duration": round(req.duration / scene_count, 1),
            "visual_prompt": f"Scene for {req.idea} — {act}",
            "narration": hook if act == "Hook" else ("Follow for more!" if act == "CTA" else ""),
            "motion": "medium" if act == "Hook" else "slow",
            "camera": "dynamic" if act == "Hook" else "static",
            "transition": "fade_in" if i == 0 else "cut",
        })

    voiceover = "\n".join(s["narration"] for s in scenes if s["narration"])
    return {
        "success": True, "job_id": job_id,
        "script": json.dumps({"title": f"Video: {req.idea}", "hook": hook, "acts": [{"act": a, "duration": req.duration // 3} for a in ["Hook", "Body", "CTA"]]}, ensure_ascii=False, indent=2),
        "scenes": scenes, "voiceover": voiceover,
        "metadata": {"concept": concept, "scene_count": len(scenes)},
    }


@app.post("/vimax/generate-script")
async def vimax_generate_script(req: ScriptRequest):
    job_id = str(uuid.uuid4())[:12]
    hooks = {"id": f"Tahukah kamu tentang {req.topic}?", "en": f"Did you know about {req.topic}?"}
    hook = hooks.get(req.language, hooks["en"])
    script = {
        "title": f"Script: {req.topic}", "hook": hook, "language": req.language,
        "acts": [
            {"act": 1, "name": "Hook", "duration": 5, "content": hook},
            {"act": 2, "name": "Body", "duration": req.duration - 10, "content": f"Main content about {req.topic}"},
            {"act": 3, "name": "CTA", "duration": 5, "content": "Follow for more!"},
        ],
    }
    return {"success": True, "job_id": job_id, "script": json.dumps(script, ensure_ascii=False, indent=2), "scenes": [], "metadata": {"topic": req.topic}}


# ══════════════════════════════════════════════════════════════
# INTERNAL HELPERS
# ══════════════════════════════════════════════════════════════

def _dl_and_extract(url: str, opts: dict) -> dict:
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=True)
        return {"title": info.get("title", ""), "duration": info.get("duration", 0), "thumbnail": info.get("thumbnail", "")}


def _extract_info(url: str) -> dict:
    with yt_dlp.YoutubeDL({"quiet": True, "no_warnings": True}) as ydl:
        return ydl.extract_info(url, download=False)


if __name__ == "__main__":
    import uvicorn
    logging.basicConfig(level=logging.INFO)
    uvicorn.run(app, host="0.0.0.0", port=8770)
