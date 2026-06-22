#!/usr/bin/env python3
"""
YouTube Uploader — Upload videos via YouTube Data API v3.

Uses resumable upload protocol for reliable large file uploads.
OAuth2 access token required (obtained via /connect flow, stored as
YOUTUBE_ACCESS_TOKEN env var).

Endpoints:
- Video upload: https://www.googleapis.com/upload/youtube/v3/videos
- Thumbnail:    https://www.googleapis.com/upload/youtube/v3/thumbnails/set
- Channel info: https://www.googleapis.com/youtube/v3/channels
"""

import os
import json
import httpx
from pathlib import Path
from typing import Optional


YOUTUBE_UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos"
YOUTUBE_THUMBNAIL_URL = "https://www.googleapis.com/upload/youtube/v3/thumbnails/set"
YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3"

# YouTube limits: 128 GB or 12 hours, whichever is less.
# Enforce 10 GB sanity limit to avoid runaway uploads.
MAX_VIDEO_SIZE_BYTES = 10 * 1024 * 1024 * 1024
REQUEST_TIMEOUT = 600  # 10 min for large uploads


class YouTubeUploader:
    """Upload videos to YouTube via Data API v3."""

    def __init__(self, api_key: str = ""):
        self.api_key = api_key or os.getenv("YOUTUBE_API_KEY", "")

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def upload_video(
        self,
        video_path: str,
        title: str,
        description: str = "",
        tags: list[str] = None,
        category_id: str = "22",
        privacy_status: str = "public",
        thumbnail_path: str = "",
    ) -> dict:
        """
        Upload a video to YouTube using resumable upload protocol.

        Reads the OAuth2 access token from YOUTUBE_ACCESS_TOKEN env var
        (set by the /connect flow).

        Args:
            video_path: Local path to the video file.
            title: Video title (required).
            description: Video description.
            tags: List of tag strings.
            category_id: YouTube category ID (default 22 = People & Blogs).
            privacy_status: 'public', 'unlisted', or 'private'.
            thumbnail_path: Optional path to a thumbnail image.

        Returns:
            {success, video_id, video_url, error}
        """
        access_token = os.getenv("YOUTUBE_ACCESS_TOKEN", "")

        # Validate inputs
        if not access_token:
            return {"success": False, "video_id": "", "video_url": "", "error": "YOUTUBE_ACCESS_TOKEN not set — run /connect first"}

        video_file = Path(video_path)
        if not video_file.exists():
            return {"success": False, "video_id": "", "video_url": "", "error": f"Video file not found: {video_path}"}

        file_size = video_file.stat().st_size
        if file_size > MAX_VIDEO_SIZE_BYTES:
            return {"success": False, "video_id": "", "video_url": "", "error": f"Video too large ({file_size} bytes, max {MAX_VIDEO_SIZE_BYTES})"}

        if not title:
            return {"success": False, "video_id": "", "video_url": "", "error": "title is required"}

        headers = {
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json",
        }

        # Build video metadata
        snippet = {
            "title": title,
            "description": description,
            "categoryId": category_id,
        }
        if tags:
            snippet["tags"] = tags

        metadata = {
            "snippet": snippet,
            "status": {
                "privacyStatus": privacy_status,
                "selfDeclaredMadeForKids": False,
            },
        }

        # Step 1: Initiate resumable upload
        try:
            upload_url = self._initiate_resumable_upload(headers, metadata, file_size)
        except httpx.HTTPStatusError as exc:
            return {"success": False, "video_id": "", "video_url": "", "error": self._format_http_error(exc)}
        except Exception as exc:
            return {"success": False, "video_id": "", "video_url": "", "error": f"Initiation failed: {exc}"}

        # Step 2: Upload video binary
        try:
            result = self._upload_binary(upload_url, access_token, video_file, file_size)
        except httpx.HTTPStatusError as exc:
            return {"success": False, "video_id": "", "video_url": "", "error": self._format_http_error(exc)}
        except Exception as exc:
            return {"success": False, "video_id": "", "video_url": "", "error": f"Upload failed: {exc}"}

        video_id = result.get("id", "")
        video_url = f"https://www.youtube.com/watch?v={video_id}" if video_id else ""

        # Step 3: Set thumbnail if provided
        if thumbnail_path and video_id:
            thumb_ok = self.set_thumbnail(video_id, thumbnail_path)
            if not thumb_ok:
                # Non-fatal — video is already uploaded
                return {
                    "success": True,
                    "video_id": video_id,
                    "video_url": video_url,
                    "error": "Video uploaded but thumbnail setting failed",
                }

        return {
            "success": True,
            "video_id": video_id,
            "video_url": video_url,
            "error": "",
        }

    def set_thumbnail(self, video_id: str, thumbnail_path: str) -> bool:
        """
        Upload a custom thumbnail for a video.

        Reads the OAuth2 access token from YOUTUBE_ACCESS_TOKEN env var.

        Args:
            video_id: YouTube video ID.
            thumbnail_path: Path to thumbnail image (JPEG/PNG, <=2MB).

        Returns:
            True on success, False otherwise.
        """
        access_token = os.getenv("YOUTUBE_ACCESS_TOKEN", "")
        if not access_token:
            return False

        thumb_file = Path(thumbnail_path)
        if not thumb_file.exists():
            return False

        headers = {"Authorization": f"Bearer {access_token}"}

        try:
            with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
                with open(thumb_file, "rb") as f:
                    resp = client.put(
                        YOUTUBE_THUMBNAIL_URL,
                        params={"videoId": video_id},
                        headers=headers,
                        files={"media": (thumb_file.name, f, "image/jpeg")},
                    )
                resp.raise_for_status()
            return True
        except Exception:
            return False

    def get_channel_info(self, access_token: str) -> dict:
        """
        Get authenticated user's channel info.

        Args:
            access_token: OAuth2 access token.

        Returns:
            {channel_id, title, subscriber_count, video_count}
            or {error: '...'} on failure.
        """
        try:
            with httpx.Client(timeout=30) as client:
                resp = client.get(
                    f"{YOUTUBE_API_BASE}/channels",
                    params={"part": "snippet,statistics", "mine": "true"},
                    headers={"Authorization": f"Bearer {access_token}"},
                )
                resp.raise_for_status()
                data = resp.json()

            items = data.get("items", [])
            if not items:
                return {"error": "No channel found for this account"}

            channel = items[0]
            snippet = channel.get("snippet", {})
            stats = channel.get("statistics", {})

            return {
                "channel_id": channel.get("id", ""),
                "title": snippet.get("title", ""),
                "subscriber_count": stats.get("subscriberCount", "0"),
                "video_count": stats.get("videoCount", "0"),
            }
        except httpx.HTTPStatusError as exc:
            return {"error": self._format_http_error(exc)}
        except Exception as exc:
            return {"error": str(exc)}

    def validate_token(self, access_token: str) -> bool:
        """
        Validate an OAuth2 access token by fetching channel info.

        Returns True if the token is valid and yields channel data.
        """
        if not access_token:
            return False
        info = self.get_channel_info(access_token)
        return "error" not in info

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _initiate_resumable_upload(self, headers: dict, metadata: dict, file_size: int) -> str:
        """
        POST metadata to initiate a resumable upload session.
        Returns the upload URL from the Location header.
        """
        initiate_headers = {
            **headers,
            "Content-Type": "application/json; charset=UTF-8",
            "X-Upload-Content-Length": str(file_size),
            "X-Upload-Content-Type": "video/*",
        }

        with httpx.Client(timeout=60) as client:
            resp = client.post(
                YOUTUBE_UPLOAD_URL,
                params={
                    "uploadType": "resumable",
                    "part": "snippet,status",
                },
                headers=initiate_headers,
                json=metadata,
            )
            resp.raise_for_status()

        upload_url = resp.headers.get("Location")
        if not upload_url:
            raise RuntimeError("No Location header in resumable upload initiation response")
        return upload_url

    def _upload_binary(self, upload_url: str, access_token: str, video_file: Path, file_size: int) -> dict:
        """
        PUT the video binary to the resumable upload URL.
        Returns the JSON response from YouTube.
        """
        with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
            with open(video_file, "rb") as f:
                resp = client.put(
                    upload_url,
                    headers={
                        "Authorization": f"Bearer {access_token}",
                        "Content-Length": str(file_size),
                        "Content-Type": "video/*",
                    },
                    content=f,
                )
            resp.raise_for_status()
        return resp.json()

    @staticmethod
    def _format_http_error(exc: httpx.HTTPStatusError) -> str:
        """Extract a human-readable error from an HTTP error response."""
        status = exc.response.status_code
        try:
            body = exc.response.json()
            message = body.get("error", {}).get("message", str(exc))
        except Exception:
            message = str(exc)

        if status == 403:
            if "quotaExceeded" in message:
                return f"YouTube API quota exceeded: {message}"
            return f"YouTube API forbidden (403): {message}"
        if status == 401:
            return f"Invalid or expired access token (401): {message}"
        return f"YouTube API error ({status}): {message}"


# CLI entry point
if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python youtube_uploader.py <command> [args...]")
        print("\nCommands:")
        print("  upload <video_path> [title] [description]")
        print("  info   <access_token>           — get channel info")
        print("  check  <access_token>           — validate token")
        sys.exit(1)

    cmd = sys.argv[1]
    uploader = YouTubeUploader()

    if cmd == "upload" and len(sys.argv) >= 3:
        video = sys.argv[2]
        title = sys.argv[3] if len(sys.argv) > 3 else Path(video).stem
        desc = sys.argv[4] if len(sys.argv) > 4 else ""
        result = uploader.upload_video(video, title, desc)
        print(json.dumps(result, indent=2))
    elif cmd == "info" and len(sys.argv) >= 3:
        result = uploader.get_channel_info(sys.argv[2])
        print(json.dumps(result, indent=2))
    elif cmd == "check" and len(sys.argv) >= 3:
        valid = uploader.validate_token(sys.argv[2])
        print(json.dumps({"valid": valid}))
    else:
        print(f"Unknown command: {cmd}")
        sys.exit(1)
