"""Video routes — download, process, search, info, clip, transforms, refresh-cookies, regenerate."""
import asyncio
import json
import os
import random
import subprocess
import tempfile
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field

from services.utils import TIKTOK_BROWSERS, extract_browser_cookies, has_tiktok_cookies, probe_field, probe_video, run_subprocess
from services.api_models import VideoProcessRequest, VideoInfoRequest, VideoClipRequest, VideoTransformsRequest, VideoFramesRequest, VideoSearchRequest, VideoRegenerateOptions, VideoRegenerateRequest
from services.di import get_looping, get_repurpose_engine, get_remetadata_engine

video_router = APIRouter(prefix="", tags=["video"])





# ── /video/refresh-cookies ──────────────────────────────────────



@video_router.post("/video/refresh-cookies")
async def refresh_tiktok_cookies(browser: str | None = None):
    """Extract fresh TikTok cookies from installed browsers into config/tiktok_cookies.txt.

    Tries chromium, vivaldi, then firefox — stops at the first browser that
    yields .tiktok.com cookies.  Override with ?browser=chromium|vivaldi|firefox.
    """
    cookies_dir = os.path.join(os.path.dirname(__file__), "..", "..", "config")
    cookies_path = os.path.join(cookies_dir, "tiktok_cookies.txt")
    cookies_path = os.path.abspath(os.path.normpath(cookies_path))
    os.makedirs(cookies_dir, exist_ok=True)

    browsers = [browser] if browser else TIKTOK_BROWSERS
    results = []
    used_browser = None

    for name in browsers:
        r = await extract_browser_cookies(name, cookies_path)
        results.append(r)
        if r["status"] == "ok" and os.path.getsize(cookies_path) > 100:
            if has_tiktok_cookies(cookies_path):
                used_browser = name
                break

    summary = {r["browser"]: r.get("status", "unknown") for r in results}

    if used_browser:
        return {"data": {
            "status": "ok",
            "message": f"TikTok cookies refreshed via {used_browser}",
            "cookies_file": cookies_path,
            "size_bytes": os.path.getsize(cookies_path),
            "browser": used_browser,
            "tried": summary,
        }}

    fsize = os.path.getsize(cookies_path) if os.path.exists(cookies_path) else 0
    if fsize > 100:
        return {"data": {
            "status": "partial",
            "message": "Cookies extracted but no .tiktok.com entries found (login required in any browser)",
            "cookies_file": cookies_path,
            "size_bytes": fsize,
            "browser": None,
            "tried": summary,
        }}

    return {"data": {
        "status": "error",
        "message": "No browser produced usable cookies",
        "tried": summary,
    }}


# ── /video/process ─────────────────────────────────────────────

@video_router.post("/video/process")
async def process_video(req: VideoProcessRequest):
    """Download video and convert to target format.

    Pipeline: download → detect format → reframe if needed → return file_path.
    Returns {file_path, file_type, duration, width, height, format, status}.
    """
    from services.download.cascade import download_video

    # 1. Download
    result = await download_video(req.source_url, req.category)
    if result.get("status") != "downloaded" or not result.get("file_path"):
        return {"data": {
            "status": "failed",
            "error": f"Download failed: {result.get('reason', 'unknown')}",
            "file_path": None,
        }}

    file_path = result["file_path"]
    file_type = "video" if os.path.splitext(file_path)[1].lower() in (".mp4", ".mov", ".avi", ".mkv", ".webm") else "image"
    duration = None
    width = None
    height = None
    video_codec = None
    try:
        meta = await probe_video(file_path)
        width = meta.get("width")
        height = meta.get("height")
        video_codec = meta.get("video_codec")
        duration = meta.get("duration")
    except Exception:
        pass

    # Re-encode to H.264 for Facebook compatibility — but only if needed.
    if file_type == "video":
        print(f"[process_video] codec={video_codec}, file_type={file_type}, w={width}x{height}")

        _needs_reencode = True
        if video_codec and video_codec.lower() in ("h264", "avc1", "libx264"):
            try:
                px_fmt = await probe_field(file_path, "pix_fmt")
                if px_fmt and px_fmt.strip() == "yuv420p":
                    _needs_reencode = False
            except Exception:
                pass

        if _needs_reencode:
            h264_path = os.path.join(os.path.dirname(file_path), f"{uuid.uuid4().hex}_h264.mp4")
            try:
                reenc = await run_subprocess(
                    ["ffmpeg", "-y", "-i", file_path,
                     "-c:v", "libx264", "-crf", "18", "-preset", "fast",
                     "-pix_fmt", "yuv420p",
                     "-c:a", "aac", "-b:a", "128k",
                     "-movflags", "+faststart",
                     h264_path],
                    capture_output=True, text=True, timeout=180,
                )
                if reenc.returncode == 0 and os.path.exists(h264_path) and os.path.getsize(h264_path) > 10000:
                    file_path = h264_path
                    video_codec = "h264"
                    try:
                        meta2 = await probe_video(file_path)
                        width = meta2.get("width")
                        height = meta2.get("height")
                        duration = meta2.get("duration")
                    except Exception:
                        pass
                else:
                    if os.path.exists(h264_path):
                        os.remove(h264_path)
            except Exception:
                pass
        else:
            print(f"[process_video] Already H.264 yuv420p — skipping re-encode")

    # 4. Convert to target format if video and dimensions don't match
    target_w, target_h = {"9:16": (1080, 1920), "16:9": (1920, 1080), "1:1": (1080, 1080)}.get(req.target_format, (1080, 1920))

    if file_type == "video" and width and height:
        current_aspect = width / height if height > 0 else 0
        target_aspect = target_w / target_h if target_h > 0 else 0

        if abs(current_aspect - target_aspect) > 0.1:
            output_path = os.path.join(os.path.dirname(file_path), f"{uuid.uuid4().hex}.mp4")
            try:
                from services.clipper.reframer import Reframer
                reframer = Reframer()
                output_path = reframer.reframe_to_vertical(file_path, output_path, req.target_format)
                if os.path.exists(output_path):
                    file_path = output_path
                    width = target_w
                    height = target_h
                    try:
                        meta2 = await probe_video(file_path)
                        duration = meta2.get("duration")
                    except Exception:
                        pass
            except Exception as e:
                pass

    # 5. Apply uniqueness transforms (mirror / speed / crop_zoom)
    if file_type == "video" and req.transforms:
        from services.clipper.reframer import Reframer as _Reframer
        _reframer = _Reframer()
        for _transform in req.transforms:
            _out = os.path.join(os.path.dirname(file_path), f"{uuid.uuid4().hex}_t.mp4")
            try:
                if _transform == "mirror":
                    file_path = _reframer.apply_mirror(file_path, _out)
                elif _transform.startswith("speed_"):
                    _factor = float(_transform.split("_", 1)[1])
                    file_path = _reframer.apply_speed(file_path, _out, _factor)
                elif _transform.startswith("crop_zoom_"):
                    _zoom = float(_transform.split("_", 2)[2])
                    file_path = _reframer.apply_crop_zoom(file_path, _out, _zoom)
            except Exception:
                if os.path.exists(_out):
                    os.remove(_out)

    # Log to processed_videos for duplicate detection
    if file_type == "video" and file_path:
        from services.db.models import record_processed_video as _rpv
        try:
            await _rpv(req.source_url, file_path)
        except Exception:
            pass

    return {"data": {
        "status": "processed",
        "file_path": file_path,
        "file_type": file_type,
        "duration": round(duration, 2) if duration else None,
        "width": width,
        "height": height,
        "format": req.target_format,
        "reason": result.get("reason", ""),
        "file_size": os.path.getsize(file_path) if os.path.exists(file_path) else 0,
    }}


# ── /video/search ──────────────────────────────────────────────

@video_router.post("/video/search")
async def video_search(req: VideoSearchRequest):
    """Check if a source URL has been processed before.

    Returns {found, url_hash, processed_at, file_path}.
    """
    from services.db.models import check_processed_video as _cpv
    try:
        result = await _cpv(req.url)
    except Exception:
        result = {"found": False, "url_hash": "", "processed_at": None, "file_path": None}
    return {"data": result}


# ── /video/regenerate ──────────────────────────────────────────

@video_router.post("/video/regenerate")
async def video_regenerate(req: VideoRegenerateRequest):
    """Full content regeneration: download → strip watermark → reframe → color grade → overlay → captions → metadata.

    Pipeline runs best-effort — if any step fails, continue with the rest.
    Returns {file_path, metadata: {title, hashtags, description}, duration, width, height, format, file_size}.
    """
    errors: list[str] = []
    run_id = uuid.uuid4().hex[:12]
    out_dir = Path(f"/tmp/1ai-content/{run_id}")
    out_dir.mkdir(parents=True, exist_ok=True)

    # ── 1. Download ──────────────────────────────────────────
    try:
        from services.download.cascade import download_video as _dl
        dl = await _dl(req.url)
        if dl.get("status") != "downloaded" or not dl.get("file_path"):
            raise RuntimeError(f"Download failed: {dl.get('reason', 'unknown')}")
        file_path: str = dl["file_path"]
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Download failed: {e}")

    # Helper: get video metadata via ffprobe
    async def _probe(path: str) -> dict:
        try:
            r = await run_subprocess(
                ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", "-show_format", path],
                capture_output=True, text=True, timeout=10,
            )
            if r.returncode == 0:
                return json.loads(r.stdout)
        except Exception:
            pass
        return {}

    # ── 2. Strip watermark (crop bottom-right corner) ────────
    if req.options.remove_watermark:
        try:
            cropped = str(out_dir / f"crop_{run_id}.mp4")
            await run_subprocess(
                ["ffmpeg", "-y", "-i", file_path, "-vf", "crop=iw-20:ih-20:0:0", "-c:a", "copy", cropped],
                capture_output=True, text=True, timeout=120,
            )
            if os.path.exists(cropped) and os.path.getsize(cropped) > 0:
                file_path = cropped
        except Exception as e:
            errors.append(f"watermark_strip: {e}")

    # ── 3. Reframe to target platform dimensions ─────────────
    try:
        from services.platform_presets import PLATFORM_PRESETS
        preset = PLATFORM_PRESETS.get(req.platform, PLATFORM_PRESETS.get("tiktok"))
        target_w, target_h = preset["width"], preset["height"]

        meta = await _probe(file_path)
        cur_w, cur_h = 0, 0
        for s in meta.get("streams", []):
            if s.get("codec_type") == "video":
                cur_w, cur_h = int(s.get("width", 0)), int(s.get("height", 0))
                break

        if cur_w and cur_h:
            cur_aspect = cur_w / cur_h
            tgt_aspect = target_w / target_h
            if abs(cur_aspect - tgt_aspect) > 0.1:
                reframed = str(out_dir / f"reframe_{run_id}.mp4")
                from services.clipper.reframer import Reframer
                reframer = Reframer()
                aspect_str = preset.get("aspect", "9:16")
                reframer.reframe_to_vertical(file_path, reframed, aspect_str)
                if os.path.exists(reframed) and os.path.getsize(reframed) > 0:
                    file_path = reframed
    except Exception as e:
        errors.append(f"reframe: {e}")

    # ── 3b. Upscale if resolution is too low ──────────────
    try:
        meta2 = await _probe(file_path)
        cur_w2, cur_h2 = 0, 0
        for s in meta2.get("streams", []):
            if s.get("codec_type") == "video":
                cur_w2, cur_h2 = int(s.get("width", 0)), int(s.get("height", 0))
                break
        if cur_w2 and cur_h2 and (cur_w2 < target_w or cur_h2 < target_h):
            upscaled = str(out_dir / f"upscale_{run_id}.mp4")
            await run_subprocess(
                ["ffmpeg", "-y", "-i", file_path,
                 "-vf", f"scale={target_w}:{target_h}:flags=lanczos",
                 "-c:v", "libx264", "-crf", "18", "-preset", "medium",
                 "-c:a", "copy", "-pix_fmt", "yuv420p", upscaled],
                capture_output=True, text=True, timeout=180,
            )
            if os.path.exists(upscaled) and os.path.getsize(upscaled) > 0:
                file_path = upscaled
    except Exception as e:
        errors.append(f"upscale: {e}")

    # ── 4. Color grade ───────────────────────────────────────
    if req.options.color_grade and req.options.color_grade != "none":
        try:
            from services.repurpose.presets import COLOR_PRESETS
            vf = COLOR_PRESETS.get(req.options.color_grade, "")
            if vf:
                graded = str(out_dir / f"grade_{run_id}.mp4")
                await run_subprocess(
                    ["ffmpeg", "-y", "-i", file_path, "-vf", vf, "-c:a", "copy", graded],
                    capture_output=True, text=True, timeout=120,
                )
                if os.path.exists(graded) and os.path.getsize(graded) > 0:
                    file_path = graded
        except Exception as e:
            errors.append(f"color_grade: {e}")

    # ── 5. Text overlay ──────────────────────────────────────
    if req.options.text_overlay:
        try:
            from services.repurpose.presets import OVERLAY_POSITIONS
            pos = OVERLAY_POSITIONS.get(req.options.overlay_position, OVERLAY_POSITIONS["bottom_center"])
            safe_text = req.options.text_overlay.replace("'", "'\\''").replace(":", "\\:")
            drawtext = (
                f"drawtext=text='{safe_text}'"
                f":fontsize=48:fontcolor=white:borderw=3:bordercolor=black"
                f":x={pos['x']}:y={pos['y']}"
            )
            overlaid = str(out_dir / f"overlay_{run_id}.mp4")
            await run_subprocess(
                ["ffmpeg", "-y", "-i", file_path, "-vf", drawtext, "-c:a", "copy", overlaid],
                capture_output=True, text=True, timeout=120,
            )
            if os.path.exists(overlaid) and os.path.getsize(overlaid) > 0:
                file_path = overlaid
        except Exception as e:
            errors.append(f"text_overlay: {e}")

    # ── 6. Add captions ──────────────────────────────────────
    if req.options.add_captions and req.options.caption_style != "none":
        try:
            from services.clipper.reframer import Reframer
            reframer = Reframer()
            sub_path = str(out_dir / f"subs_{run_id}.ass")
            try:
                reframer.generate_karaoke_subtitles(file_path, sub_path, style=req.options.caption_style)
            except Exception:
                meta = await _probe(file_path)
                dur = float(meta.get("format", {}).get("duration", 10))
                import pysubs2
                subs = pysubs2.SSAFile()
                subs.events.append(pysubs2.SSAEvent(
                    start=0, end=int(dur * 1000),
                    text=req.options.text_overlay or "Regenerated by 1AI",
                ))
                subs.save(sub_path)

            if os.path.exists(sub_path):
                captioned = str(out_dir / f"caption_{run_id}.mp4")
                reframer.burn_subtitles(file_path, sub_path, captioned)
                if os.path.exists(captioned) and os.path.getsize(captioned) > 0:
                    file_path = captioned
        except Exception as e:
            errors.append(f"captions: {e}")

    # ── 7. Generate metadata ─────────────────────────────────
    _PLATFORM_METADATA = {
        "facebook": {
            "titles": [
                "Coba lihat ini! 🔥", "Wajib coba! 💪", "Tips yang jarang orang tahu",
                "Ini dia yang kamu cari! ✨", "Jangan sampai ketinggalan! 🚀",
            ],
            "hashtags": ["#facebookreels", "#viral", "#trending", "#fyp", "#indonesia", "#tips"],
        },
        "tiktok": {
            "titles": [
                "POV: kamu nemuin ini 🔥", "Ini gila sih! 😱", "Coba tebak...",
            ],
            "hashtags": ["#fyp", "#foryou", "#viral", "#trending", "#tiktokindonesia"],
        },
        "instagram": {
            "titles": [
                "Save this for later! ✨", "Your feed needed this 💫",
            ],
            "hashtags": ["#reels", "#explore", "#viral", "#trending", "#instagram"],
        },
    }

    metadata: dict = {"title": "", "hashtags": [], "description": ""}
    if req.options.generate_metadata:
        try:
            import httpx
            omni_url = os.getenv("OMNIRoute_URL", "http://127.0.0.1:20128/v1")
            async with httpx.AsyncClient(timeout=15.0) as llm_client:
                llm_resp = await llm_client.post(
                    f"{omni_url}/chat/completions",
                    json={
                        "model": "gemini-2.0-flash",
                        "messages": [{
                            "role": "user",
                            "content": (
                                f"Generate a short catchy social media title (max 60 chars), "
                                f"5 relevant hashtags, and a 1-sentence description for a "
                                f"{req.platform} post. Language: {req.options.language}. "
                                f"Return JSON: {{\"title\":\"...\",\"hashtags\":[\"#...\"],\"description\":\"...\"}}"
                            ),
                        }],
                        "max_tokens": 200,
                    },
                )
                if llm_resp.status_code == 200:
                    content = llm_resp.json().get("choices", [{}])[0].get("message", {}).get("content", "")
                    import re as _re
                    json_match = _re.search(r'\{[^}]+\}', content)
                    if json_match:
                        metadata = json.loads(json_match.group())
                        if metadata.get("title"):
                            raise RuntimeError("")
        except RuntimeError:
            pass
        except Exception as e:
            errors.append(f"metadata_llm: {e}")

        if not metadata.get("title"):
            preset = _PLATFORM_METADATA.get(req.platform, _PLATFORM_METADATA["facebook"])
            metadata = {
                "title": random.choice(preset["titles"]),
                "hashtags": preset["hashtags"],
                "description": f"Check out this content on {req.platform}!",
            }

    # ── 8. Final H.264 guarantee + metadata ───────────────────
    final_meta = await _probe(file_path)
    final_codec = None
    duration = None
    width = None
    height = None
    for s in final_meta.get("streams", []):
        if s.get("codec_type") == "video":
            width = int(s.get("width", 0))
            height = int(s.get("height", 0))
            final_codec = s.get("codec_name", "").lower()
            break
    duration = float(final_meta.get("format", {}).get("duration", 0)) if final_meta.get("format") else None

    if True:
        print(f"[video_regenerate] final_codec={final_codec}, w={width}x{height}, re-encode=YES")
        h264_final = str(out_dir / f"h264_final_{run_id}.mp4")
        try:
            await run_subprocess(
                ["ffmpeg", "-y", "-i", file_path,
                 "-c:v", "libx264", "-crf", "18", "-preset", "fast",
                 "-pix_fmt", "yuv420p",
                 "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart",
                 h264_final],
                capture_output=True, text=True, timeout=180,
            )
            if os.path.exists(h264_final) and os.path.getsize(h264_final) > 10000:
                file_path = h264_final
        except Exception:
            errors.append(f"h264_final: re-encode failed")

    return {"data": {
        "status": "regenerated",
        "file_path": file_path,
        "metadata": metadata,
        "duration": round(duration, 2) if duration else None,
        "width": width,
        "height": height,
        "format": "mp4",
        "file_size": os.path.getsize(file_path) if os.path.exists(file_path) else 0,
        "errors": errors,
    }}


# ── /video/info ────────────────────────────────────────────────

@video_router.post("/video/info")
async def video_info(req: VideoInfoRequest):
    """Get video metadata via ffprobe."""
    try:
        meta = await probe_video(req.file_path)
        if not meta:
            return {"file_path": req.file_path, "status": "failed", "error": "ffprobe returned no data"}
        return {
            "file_path": req.file_path,
            "duration": meta.get("duration", 0),
            "width": meta.get("width", 0),
            "height": meta.get("height", 0),
            "video_codec": meta.get("video_codec", ""),
            "audio_codec": meta.get("audio_codec", ""),
            "status": "ok",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"ffprobe error: {e}")


# ── /video/clip ────────────────────────────────────────────────

def _get_video_clip_fn():
    """Return the clip endpoint function for backward compat (original had no @app decorator)."""
    from fastapi import APIRouter as _R
    r = _R()


# Note: original file had `async def video_clip(...)` without @app decorator
# and was NOT registered as a route. Keeping as non-route.
async def video_clip(req: VideoClipRequest):
    """Clip video to specified duration."""
    try:
        meta = await probe_video(req.file_path)
        if not meta:
            return {"file_path": req.file_path, "status": "failed", "error": "ffprobe returned no data"}
        out_dir = os.path.dirname(req.file_path)
        out_path = os.path.join(out_dir, f"{uuid.uuid4().hex}_clip.mp4")
        result = await run_subprocess(
            ["ffmpeg", "-y", "-i", req.file_path,
             "-ss", str(req.start_time), "-t", str(req.duration),
             "-c:v", "libx264", "-preset", "fast", "-crf", "23",
             "-c:a", "aac", "-b:a", "128k",
             "-movflags", "+faststart",
             out_path],
            capture_output=True, text=True, timeout=60,
        )
        if result.returncode != 0 or not os.path.exists(out_path):
            if os.path.exists(out_path):
                os.remove(out_path)
            return {"file_path": req.file_path, "status": "failed", "error": result.stderr.strip()[:200]}
        meta2 = await probe_video(out_path)
        return {
            "file_path": out_path,
            "duration": meta2.get("duration", 0),
            "width": meta2.get("width", 0),
            "height": meta2.get("height", 0),
            "status": "ok",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"video clip error: {e}")


# ── /video/transforms ──────────────────────────────────────────

@video_router.post("/video/transforms")
async def video_transforms(req: VideoTransformsRequest):
    """Generate video variants with mirror/speed/crop transforms."""
    TRANSFORM_MAP = {
        "mirror": {"vf": "hflip", "audio": "copy"},
        "speed_105": {"vf": "setpts=0.952381*PTS", "af": "atempo=1.05"},
        "crop_zoom": {"vf": "crop=iw/1.05:ih/1.05:(iw-iw/1.05)/2:(ih-ih/1.05)/2,scale=iw*1.05:ih*1.05", "audio": "copy"},
        "mirror_speed": {"vf": "hflip,setpts=0.952381*PTS", "af": "atempo=1.05"},
        "mirror_crop": {"vf": "hflip,crop=iw/1.05:ih/1.05:(iw-iw/1.05)/2:(ih-ih/1.05)/2,scale=iw*1.05:ih*1.05", "audio": "copy"},
    }
    variants = []
    dirpath = os.path.dirname(req.file_path)
    for name in req.transforms:
        spec = TRANSFORM_MAP.get(name)
        if not spec:
            continue
        out_path = os.path.join(dirpath, f"{name}_{uuid.uuid4().hex[:8]}.mp4")
        cmd = ["ffmpeg", "-y", "-i", req.file_path]
        if spec.get("vf"):
            cmd += ["-vf", spec["vf"]]
        if spec.get("af"):
            cmd += ["-af", spec["af"]]
        cmd += ["-c:v", "libx264", "-crf", "18", "-preset", "fast"]
        cmd += ["-c:a", spec.get("audio", "aac")]
        if spec.get("audio") != "copy":
            cmd += ["-b:a", "128k"]
        cmd += ["-movflags", "+faststart", out_path]
        try:
            result = await run_subprocess(cmd, capture_output=True, text=True, timeout=120)
            if result.returncode == 0 and os.path.isfile(out_path) and os.path.getsize(out_path) > 0:
                variants.append({"name": name, "file_path": out_path})
        except Exception:
            pass
    return {"variants": variants, "status": "ok"}


# ── /video/frames ───────────────────────────────────────────────


@video_router.post("/video/frames")
async def video_frames(req: VideoFramesRequest):
    """Extract N evenly-spaced reference frames from a local video file.

    Timestamps at t = k * duration / (N+1) for k = 1..N (never the first or
    last frame).  Used by the Content Factory workflow to send reference
    frames alongside a base video to the variation bot.
    """
    if not os.path.isfile(req.file_path):
        raise HTTPException(status_code=404, detail=f"File not found: {req.file_path}")
    if req.num_frames < 1:
        raise HTTPException(status_code=400, detail="num_frames must be >= 1")

    from services.clipper.reframer import Reframer  # lazy import (endpoint convention)
    reframer = Reframer()

    meta = await probe_video(req.file_path)
    duration = float(meta.get("duration") or 0.0)
    if duration <= 0:
        return {"data": {"status": "failed", "error": "Could not probe video duration", "frames": []}}

    out_dir = req.output_dir or os.path.join(tempfile.gettempdir(), "content_factory_frames")
    os.makedirs(out_dir, exist_ok=True)

    n = req.num_frames
    frames = []
    for k in range(1, n + 1):
        ts = round(k * duration / (n + 1), 3)
        out_path = os.path.join(out_dir, f"frame_{k:02d}_{uuid.uuid4().hex[:8]}.jpg")
        try:
            reframer.generate_thumbnail(req.file_path, ts, out_path, title="")
        except Exception as exc:
            return {"data": {"status": "failed", "error": f"Frame {k} extraction failed: {exc}", "frames": frames}}
        frames.append({"index": k, "timestamp": ts, "file_path": out_path})

    return {"data": {"status": "ok", "num_frames": n, "frames": frames}}


# ══════════════════════════════════════════════════════════════
# CONTENT GENERATION ENDPOINTS — added alongside provider routers
# ══════════════════════════════════════════════════════════════

# ── Request models ──────────────────────────────────────────────


class MovieGenerateRequest(BaseModel):
    prompt: str = Field(..., description="Video concept / story")
    genre: str = Field(default="general", description="Movie genre")
    language: str = Field(default="en", description="Language code")
    num_scenes: int = Field(default=8, ge=3, le=30, description="Number of scenes")
    style: str = Field(default="slideshow", description="Visual style")


class LoopRequest(BaseModel):
    audio_path: str
    duration_minutes: int = Field(default=60, ge=1, le=360)
    visual_type: str = "gradient"
    resolution: str = "1920x1080"
    colors: Optional[str] = None
    image_path: Optional[str] = None


class RemetaAdRequest(BaseModel):
    source: str
    overlay: Optional[str] = None
    watermark: Optional[str] = None
    position: str = "bottom"
    speed: float = 1.0
    color_shift: Optional[str] = None
    niche: str = "general"
    platform: str = "facebook"
    language: str = "en"


class RenderAdRequest(BaseModel):
    image_url: str = ""
    title: str = Field(..., description="Product title/name")
    category: str = Field(default="beauty", description="Product category")
    affiliate_link: str = Field(default="", description="Shopee affiliate link")
    brand_name: str = Field(default="Shopee Affiliate", description="Brand/page name")
    ad_copy: Optional[str] = Field(default=None, description="Custom ad copy text")
    hook_text: Optional[str] = Field(default=None, description="Custom hook text")
    cta_text: str = Field(default="Link di Bio! 🔗", description="Call-to-action text")


# ── /video/movie ────────────────────────────────────────────────

MOVIE_BASE = os.path.join(os.path.dirname(__file__), "..", "media", "movies")


@video_router.post("/video/movie")
async def video_movie(req: MovieGenerateRequest):
    """Generate a short film: script → scenes → audio → video (SSE streamed)."""
    async def _generate():
        try:
            from services.movie_gen.engine import generate_movie
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


@video_router.get("/video/movie/media/{path:path}")
async def video_movie_media(path: str):
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


# ── /video/loop ─────────────────────────────────────────────────

@video_router.post("/video/loop")
async def video_loop(req: LoopRequest):
    """Create a looping video from audio."""
    try:
        engine = get_looping()
        res = req.resolution.split("x")
        width = int(res[0]) if len(res) == 2 else 1920
        height = int(res[1]) if len(res) == 2 else 1080
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_dir = Path("/tmp/looping_output")
        output_dir.mkdir(parents=True, exist_ok=True)
        output_path = str(output_dir / f"loop_{timestamp}.mp4")

        result = await asyncio.to_thread(
            engine.create_loop,
            audio_path=req.audio_path,
            output_path=output_path,
            duration_hours=req.duration_minutes / 60,
            width=width,
            height=height,
            visual_type=req.visual_type,
            image_path=req.image_path,
            base_color=req.colors or "0x1a1a2e",
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@video_router.get("/video/loop/video/{filename}")
async def video_loop_video(filename: str):
    """Serve generated looping video."""
    base_dir = Path("/tmp/looping_output")
    full_path = (base_dir / filename).resolve()
    if not str(full_path).startswith(str(base_dir.resolve()) + os.sep):
        raise HTTPException(status_code=400, detail="Invalid path")
    if not full_path.exists():
        raise HTTPException(status_code=404, detail="Video not found")
    return FileResponse(str(full_path), media_type="video/mp4")


# ── /video/remeta ───────────────────────────────────────────────

@video_router.post("/video/remeta")
async def video_remeta(req: RemetaAdRequest):
    """Re-render video with new metadata (text overlay + re-encode)."""
    try:
        engine = get_remetadata_engine()
        result = engine.remetadata(
            source=req.source,
            overlay=req.overlay or None,
            watermark=req.watermark or None,
            position=req.position,
            speed=req.speed if req.speed > 0 else None,
            color_shift=req.color_shift,
            niche=req.niche,
            platform=req.platform,
            language=req.language,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── /video/repurpose ────────────────────────────────────────────

@video_router.post("/video/repurpose")
async def video_repurpose(req: RemetaAdRequest):
    """Repurpose content from multiple sources — anti-copyright remix."""
    try:
        from services.api_models import RepurposeRequest
        engine = get_repurpose_engine()
        result = engine.repurpose(
            sources=req.source if isinstance(req.source, list) else [req.source],
            target_duration=60,
            platform=req.platform,
            niche=req.niche,
            style="dynamic",
            language=req.language,
            color_preset=req.overlay,
            transition_style="crossfade",
            overlay_text=req.overlay or None,
            overlay_position=req.position,
            watermark_text=req.watermark or None,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── /video/ad (Remotion) ────────────────────────────────────────

@video_router.post("/video/ad")
async def video_ad(req: RenderAdRequest):
    """Render a product ad video using Remotion (9:16, 1080x1920, 15s)."""
    import services.remotion as remotion
    try:
        result = await remotion.render_product_ad(
            image_url=req.image_url,
            title=req.title,
            category=req.category,
            affiliate_link=req.affiliate_link,
            brand_name=req.brand_name,
            ad_copy=req.ad_copy,
            hook_text=req.hook_text,
            cta_text=req.cta_text,
        )
        return {"status": "ok", "data": result}
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Remotion render error: {type(e).__name__}: {e}")