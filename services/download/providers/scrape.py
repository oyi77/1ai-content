"""Scrape TikTok pages and convert slideshows to video."""
from __future__ import annotations

import json
import os
import re
import subprocess

import httpx

from ..cascade import TIKTOK_OEMBED
from ..utils import _dl_url


async def scrape_tiktok_page(client: httpx.AsyncClient, url: str) -> dict | None:
    """Scrape TikTok page for video metadata (supports both videos and slideshows).

    First tries the rehydration script (broken since ~July 2026 — TikTok removed `itemInfo`),
    falls back to oEmbed API for at least cover/thumbnail data.
    """
    ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    try:
        r = await client.get(url, headers={"User-Agent": ua}, timeout=10)
        if r.status_code == 200:
            m = re.search(r'id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)</script>', r.text)
            if m:
                data = json.loads(m.group(1))
                item = data.get("__DEFAULT_SCOPE__", {}).get("webapp.video-detail", {}).get("itemInfo", {}).get("itemStruct", {})
                video_data = item.get("video", {})
                # Detect slideshow: TikTok puts images[] in itemStruct for slideshows
                images = item.get("images", [])
                if images:
                    video_data["_slideshow_images"] = [img.get("url", "") for img in images if img.get("url")]
                    video_data["_is_slideshow"] = True
                else:
                    video_data["_is_slideshow"] = False
                return video_data
    except Exception:
        pass

    # Fallback: oEmbed API (still functional) — returns thumbnail_url, author metadata
    try:
        r2 = await client.get(f"{TIKTOK_OEMBED}?url={url}", timeout=5)
        if r2.status_code == 200:
            oembed = r2.json()
            thumb = oembed.get("thumbnail_url", "")
            if thumb:
                return {"_is_slideshow": False, "_slideshow_images": [], "cover": thumb, "originCover": thumb}
    except Exception:
        pass
    return None


async def convert_slideshow_to_video(image_urls: list[str], vid_id: str, tmpdir: str, client: httpx.AsyncClient) -> dict:
    """Download slideshow images and convert to video using ffmpeg."""
    try:
        # Download all images
        img_paths = []
        for i, url in enumerate(image_urls[:20]):  # Max 20 images
            r = await _dl_url(client, url, f"{vid_id}_slide_{i:03d}", tmpdir, "jpg", referer="https://www.tiktok.com/")
            if r["status"] == "downloaded" and r.get("file_path"):
                img_paths.append(r["file_path"])

        if not img_paths:
            return {"file_path": None, "file_type": "none", "status": "failed", "tmpdir": tmpdir, "error": "no_slideshow_images"}

        # Create ffmpeg slideshow: each image shown for 3s with fade transitions
        output_path = os.path.join(tmpdir, f"{vid_id}_slideshow.mp4")
        duration_per_image = 3

        # Build ffmpeg command with crossfade
        if len(img_paths) == 1:
            # Single image -> still video
            cmd = [
                "ffmpeg", "-y", "-loop", "1", "-i", img_paths[0],
                "-c:v", "libx264", "-t", "5", "-pix_fmt", "yuv420p",
                "-vf", "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2",
                output_path
            ]
        else:
            # Multiple images -> slideshow with crossfade
            # Create concat file with durations
            concat_path = os.path.join(tmpdir, f"{vid_id}_concat.txt")
            with open(concat_path, "w") as f:
                for img in img_paths:
                    f.write(f"file '{img}'\n")
                    f.write(f"duration {duration_per_image}\n")
                # Last image needs to be listed again for ffmpeg concat
                f.write(f"file '{img_paths[-1]}'\n")

            cmd = [
                "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", concat_path,
                "-vf", "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,fade=t=in:st=0:d=0.5",
                "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", "30",
                output_path
            ]

        result = subprocess.run(cmd, capture_output=True, timeout=120)
        if result.returncode == 0 and os.path.isfile(output_path):
            return {
                "file_path": output_path,
                "file_type": "video",
                "status": "downloaded",
                "tmpdir": tmpdir,
                "file_size": os.path.getsize(output_path),
                "reason": "slideshow_to_video",
            }
        return {"file_path": None, "file_type": "none", "status": "failed", "tmpdir": tmpdir, "error": f"ffmpeg_exit_{result.returncode}"}
    except Exception as e:
        return {"file_path": None, "file_type": "none", "status": "failed", "tmpdir": tmpdir, "error": f"slideshow_convert_{type(e).__name__}"}


async def convert_slideshow_to_video_remotion(
    image_urls: list[str],
    vid_id: str,
    tmpdir: str,
    client: httpx.AsyncClient,
    *,
    title: str = "",
    category: str = "beauty",
    brand_name: str = "Shopee Affiliate",
    affiliate_link: str = "",
    cta_text: str = "Link di Bio! 🔗",
) -> dict:
    """Convert slideshow images to a professional product ad video using Remotion.

    Falls back to ffmpeg slideshow if Remotion is unavailable or fails.
    """
    try:
        import services.remotion as remotion  # noqa: F811
    except ImportError:
        # Remotion not available — fall back to ffmpeg
        return await convert_slideshow_to_video(image_urls, vid_id, tmpdir, client)

    try:
        # Download first image for Remotion
        img_paths = []
        for i, url in enumerate(image_urls[:5]):  # Download up to 5 images
            r = await _dl_url(client, url, f"{vid_id}_remotion_{i:03d}", tmpdir, "jpg", referer="https://www.tiktok.com/")
            if r["status"] == "downloaded" and r.get("file_path"):
                img_paths.append(r["file_path"])

        if not img_paths:
            return {"file_path": None, "file_type": "none", "status": "failed", "tmpdir": tmpdir, "error": "no_images_for_remotion"}

        # Use first image as the main product image
        result = await remotion.render_product_ad(
            image_url=img_paths[0],
            title=title or f"Produk Terbaru — {vid_id}",
            category=category,
            affiliate_link=affiliate_link,
            brand_name=brand_name,
            cta_text=cta_text,
            output_path=os.path.join(tmpdir, f"{vid_id}_remotion_ad.mp4"),
        )

        return {
            "file_path": result["file_path"],
            "file_type": "video",
            "status": "downloaded",
            "tmpdir": tmpdir,
            "file_size": result["file_size"],
            "reason": "remotion_product_ad",
            "duration": result.get("duration"),
            "width": result.get("width"),
            "height": result.get("height"),
        }

    except Exception as e:
        # Remotion failed — fall back to ffmpeg slideshow
        print(f"[Download] Remotion render failed ({e}), falling back to ffmpeg")
        return await convert_slideshow_to_video(image_urls, vid_id, tmpdir, client)