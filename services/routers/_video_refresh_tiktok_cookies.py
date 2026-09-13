"""Carved verbatim out of ``services/routers/video.py`` — statements moved, no logic changed."""

from .video import (
    VideoProcessRequest,
    VideoSearchRequest,
    video_router,
)

from . import video as _facade

@video_router.post("/video/refresh-cookies")
async def refresh_tiktok_cookies(browser: str | None = None):
    """Extract fresh TikTok cookies from installed browsers into config/tiktok_cookies.txt.

    Tries chromium, vivaldi, then firefox — stops at the first browser that
    yields .tiktok.com cookies.  Override with ?browser=chromium|vivaldi|firefox.
    """
    cookies_dir = _facade.os.path.join(_facade.os.path.dirname(__file__), "..", "..", "config")
    cookies_path = _facade.os.path.join(cookies_dir, "tiktok_cookies.txt")
    cookies_path = _facade.os.path.abspath(_facade.os.path.normpath(cookies_path))
    _facade.os.makedirs(cookies_dir, exist_ok=True)

    browsers = [browser] if browser else _facade.TIKTOK_BROWSERS
    results = []
    used_browser = None

    for name in browsers:
        r = await _facade.extract_browser_cookies(name, cookies_path)
        results.append(r)
        if r["status"] == "ok" and _facade.os.path.getsize(cookies_path) > 100:
            if _facade.has_tiktok_cookies(cookies_path):
                used_browser = name
                break

    summary = {r["browser"]: r.get("status", "unknown") for r in results}

    if used_browser:
        return {"data": {
            "status": "ok",
            "message": f"TikTok cookies refreshed via {used_browser}",
            "cookies_file": cookies_path,
            "size_bytes": _facade.os.path.getsize(cookies_path),
            "browser": used_browser,
            "tried": summary,
        }}

    fsize = _facade.os.path.getsize(cookies_path) if _facade.os.path.exists(cookies_path) else 0
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
    file_type = "video" if _facade.os.path.splitext(file_path)[1].lower() in (".mp4", ".mov", ".avi", ".mkv", ".webm") else "image"
    duration = None
    width = None
    height = None
    video_codec = None
    try:
        meta = await _facade.probe_video(file_path)
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
                px_fmt = await _facade.probe_field(file_path, "pix_fmt")
                if px_fmt and px_fmt.strip() == "yuv420p":
                    _needs_reencode = False
            except Exception:
                pass

        if _needs_reencode:
            h264_path = _facade.os.path.join(_facade.os.path.dirname(file_path), f"{_facade.uuid.uuid4().hex}_h264.mp4")
            try:
                reenc = await _facade.run_subprocess(
                    ["ffmpeg", "-y", "-i", file_path,
                     "-c:v", "libx264", "-crf", "18", "-preset", "fast",
                     "-pix_fmt", "yuv420p",
                     "-c:a", "aac", "-b:a", "128k",
                     "-movflags", "+faststart",
                     h264_path],
                    capture_output=True, text=True, timeout=180,
                )
                if reenc.returncode == 0 and _facade.os.path.exists(h264_path) and _facade.os.path.getsize(h264_path) > 10000:
                    file_path = h264_path
                    video_codec = "h264"
                    try:
                        meta2 = await _facade.probe_video(file_path)
                        width = meta2.get("width")
                        height = meta2.get("height")
                        duration = meta2.get("duration")
                    except Exception:
                        pass
                else:
                    if _facade.os.path.exists(h264_path):
                        _facade.os.remove(h264_path)
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
            output_path = _facade.os.path.join(_facade.os.path.dirname(file_path), f"{_facade.uuid.uuid4().hex}.mp4")
            try:
                from services.clipper.reframer import Reframer
                reframer = Reframer()
                output_path = reframer.reframe_to_vertical(file_path, output_path, req.target_format)
                if _facade.os.path.exists(output_path):
                    file_path = output_path
                    width = target_w
                    height = target_h
                    try:
                        meta2 = await _facade.probe_video(file_path)
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
            _out = _facade.os.path.join(_facade.os.path.dirname(file_path), f"{_facade.uuid.uuid4().hex}_t.mp4")
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
                if _facade.os.path.exists(_out):
                    _facade.os.remove(_out)

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
        "file_size": _facade.os.path.getsize(file_path) if _facade.os.path.exists(file_path) else 0,
    }}
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
