"""Download routes — video/profile downloads."""
import os
import re
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from services.api import _PROCESSED_VIDEOS_DB

download_router = APIRouter(prefix="", tags=["download"])


class DownloadRequest(BaseModel):
    video_url: str
    category: str = "general"


class ProfileDownloadRequest(BaseModel):
    profile_url: str
    category: str = "general"
    max_videos: int = Field(default=10, ge=1, le=50)


@download_router.post("/download/video")
async def download_video_endpoint(req: DownloadRequest):
    """Download a single video using full cascade.

    Cascade: tikwm → yt-dlp → Vidbee → Cobalt → CloakBrowser → scrape → cover → placeholder
    Returns {file_path, file_type, status, reason, file_size}.
    """
    from services.download.cascade import download_video

    result = await download_video(req.video_url, req.category)

    # Add file_size if file exists
    if result.get("file_path") and os.path.exists(result["file_path"]):
        result["file_size"] = os.path.getsize(result["file_path"])

    return {"data": result}


@download_router.post("/download/profile")
async def download_profile(req: ProfileDownloadRequest):
    """Download all videos from a TikTok profile.

    Parses profile URL → fetches video list via tikwm → batch-downloads each via cascade.
    Returns list of {file_path, file_type, status, reason, file_size} per video.
    """
    from services.download.cascade import download_video, TIKWM_API_URL

    # 1. Extract username from profile URL
    m = re.search(r"tiktok\.com/@([\w.]+)", req.profile_url)
    if not m:
        return {"data": [], "error": f"Invalid TikTok profile URL: {req.profile_url}"}
    username = m.group(1)

    # 2. Fetch video list via tikwm
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{TIKWM_API_URL}user/posts",
                params={"unique_id": username, "count": min(req.max_videos, 50)},
            )
            if resp.status_code != 200:
                return {"data": [], "error": f"tikwm user/posts returned {resp.status_code}"}
            body = resp.json()
            if body.get("code") != 0:
                return {"data": [], "error": f"tikwm error: {body.get('msg', 'unknown')}"}
            videos = (body.get("data") or {}).get("videos", [])
    except Exception as e:
        return {"data": [], "error": f"tikwm request failed: {e}"}

    if not videos:
        return {"data": [], "error": "No videos found in profile"}

    # 3. Download each video
    results = []
    for v in videos:
        vid_id = v.get("video_id", "")
        if not vid_id:
            continue
        video_url = f"https://www.tiktok.com/@{username}/video/{vid_id}"
        result = await download_video(video_url, req.category)
        if result.get("file_path") and os.path.exists(result["file_path"]):
            result["file_size"] = os.path.getsize(result["file_path"])
        result["video_id"] = vid_id
        result["video_url"] = video_url
        result["title"] = (v.get("title") or "")[:200]
        results.append(result)

    return {"data": results, "total": len(results)}