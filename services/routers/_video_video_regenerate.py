"""Carved verbatim out of ``services/routers/video.py`` — statements moved, no logic changed."""

from .video import (
    VideoClipRequest,
    VideoFramesRequest,
    VideoInfoRequest,
    VideoRegenerateRequest,
    VideoTransformsRequest,
    video_router,
)

from . import video as _facade

@video_router.post("/video/regenerate")
async def video_regenerate(req: VideoRegenerateRequest):
    """Full content regeneration: download → strip watermark → reframe → color grade → overlay → captions → metadata.

    Pipeline runs best-effort — if any step fails, continue with the rest.
    Returns {file_path, metadata: {title, hashtags, description}, duration, width, height, format, file_size}.
    """
    errors: list[str] = []
    run_id = _facade.uuid.uuid4().hex[:12]
    out_dir = _facade.Path(f"/tmp/1ai-content/{run_id}")
    out_dir.mkdir(parents=True, exist_ok=True)

    # ── 1. Download ──────────────────────────────────────────
    try:
        from services.download.cascade import download_video as _dl
        dl = await _dl(req.url)
        if dl.get("status") != "downloaded" or not dl.get("file_path"):
            raise RuntimeError(f"Download failed: {dl.get('reason', 'unknown')}")
        file_path: str = dl["file_path"]
    except Exception as e:
        raise _facade.HTTPException(status_code=422, detail=f"Download failed: {e}")

    # Helper: get video metadata via ffprobe
    async def _probe(path: str) -> dict:
        try:
            r = await _facade.run_subprocess(
                ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", "-show_format", path],
                capture_output=True, text=True, timeout=10,
            )
            if r.returncode == 0:
                return _facade.json.loads(r.stdout)
        except Exception:
            pass
        return {}

    # ── 2. Strip watermark (crop bottom-right corner) ────────
    if req.options.remove_watermark:
        try:
            cropped = str(out_dir / f"crop_{run_id}.mp4")
            await _facade.run_subprocess(
                ["ffmpeg", "-y", "-i", file_path, "-vf", "crop=iw-20:ih-20:0:0", "-c:a", "copy", cropped],
                capture_output=True, text=True, timeout=120,
            )
            if _facade.os.path.exists(cropped) and _facade.os.path.getsize(cropped) > 0:
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
                if _facade.os.path.exists(reframed) and _facade.os.path.getsize(reframed) > 0:
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
            await _facade.run_subprocess(
                ["ffmpeg", "-y", "-i", file_path,
                 "-vf", f"scale={target_w}:{target_h}:flags=lanczos",
                 "-c:v", "libx264", "-crf", "18", "-preset", "medium",
                 "-c:a", "copy", "-pix_fmt", "yuv420p", upscaled],
                capture_output=True, text=True, timeout=180,
            )
            if _facade.os.path.exists(upscaled) and _facade.os.path.getsize(upscaled) > 0:
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
                await _facade.run_subprocess(
                    ["ffmpeg", "-y", "-i", file_path, "-vf", vf, "-c:a", "copy", graded],
                    capture_output=True, text=True, timeout=120,
                )
                if _facade.os.path.exists(graded) and _facade.os.path.getsize(graded) > 0:
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
            await _facade.run_subprocess(
                ["ffmpeg", "-y", "-i", file_path, "-vf", drawtext, "-c:a", "copy", overlaid],
                capture_output=True, text=True, timeout=120,
            )
            if _facade.os.path.exists(overlaid) and _facade.os.path.getsize(overlaid) > 0:
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

            if _facade.os.path.exists(sub_path):
                captioned = str(out_dir / f"caption_{run_id}.mp4")
                reframer.burn_subtitles(file_path, sub_path, captioned)
                if _facade.os.path.exists(captioned) and _facade.os.path.getsize(captioned) > 0:
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
            omni_url = _facade.os.getenv("OMNIRoute_URL", "http://127.0.0.1:20128/v1")
            omni_key = _facade.os.getenv("OMNIROUTE_API_KEY", "")
            async with httpx.AsyncClient(timeout=15.0) as llm_client:
                llm_resp = await llm_client.post(
                    f"{omni_url}/chat/completions",
                    json={
                        "model": "auto/all-working",
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
                        "stream": False,
                    },
                    headers={"Authorization": f"Bearer {omni_key}"} if omni_key else {},
                )
                if llm_resp.status_code == 200:
                    content = llm_resp.json().get("choices", [{}])[0].get("message", {}).get("content", "")
                    import re as _re
                    json_match = _re.search(r'\{[^}]+\}', content)
                    if json_match:
                        metadata = _facade.json.loads(json_match.group())
                        if metadata.get("title"):
                            raise RuntimeError("")
        except RuntimeError:
            pass
        except Exception as e:
            errors.append(f"metadata_llm: {e}")

        if not metadata.get("title"):
            preset = _PLATFORM_METADATA.get(req.platform, _PLATFORM_METADATA["facebook"])
            metadata = {
                "title": _facade.random.choice(preset["titles"]),
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
            await _facade.run_subprocess(
                ["ffmpeg", "-y", "-i", file_path,
                 "-c:v", "libx264", "-crf", "18", "-preset", "fast",
                 "-pix_fmt", "yuv420p",
                 "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart",
                 h264_final],
                capture_output=True, text=True, timeout=180,
            )
            if _facade.os.path.exists(h264_final) and _facade.os.path.getsize(h264_final) > 10000:
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
        "file_size": _facade.os.path.getsize(file_path) if _facade.os.path.exists(file_path) else 0,
        "errors": errors,
    }}
@video_router.post("/video/info")
async def video_info(req: VideoInfoRequest):
    """Get video metadata via ffprobe."""
    try:
        meta = await _facade.probe_video(req.file_path)
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
        raise _facade.HTTPException(status_code=500, detail=f"ffprobe error: {e}")
def _get_video_clip_fn():
    """Return the clip endpoint function for backward compat (original had no @app decorator)."""
    from fastapi import APIRouter as _R
    r = _R()
async def video_clip(req: VideoClipRequest):
    """Clip video to specified duration."""
    try:
        meta = await _facade.probe_video(req.file_path)
        if not meta:
            return {"file_path": req.file_path, "status": "failed", "error": "ffprobe returned no data"}
        out_dir = _facade.os.path.dirname(req.file_path)
        out_path = _facade.os.path.join(out_dir, f"{_facade.uuid.uuid4().hex}_clip.mp4")
        result = await _facade.run_subprocess(
            ["ffmpeg", "-y", "-i", req.file_path,
             "-ss", str(req.start_time), "-t", str(req.duration),
             "-c:v", "libx264", "-preset", "fast", "-crf", "23",
             "-c:a", "aac", "-b:a", "128k",
             "-movflags", "+faststart",
             out_path],
            capture_output=True, text=True, timeout=60,
        )
        if result.returncode != 0 or not _facade.os.path.exists(out_path):
            if _facade.os.path.exists(out_path):
                _facade.os.remove(out_path)
            return {"file_path": req.file_path, "status": "failed", "error": result.stderr.strip()[:200]}
        meta2 = await _facade.probe_video(out_path)
        return {
            "file_path": out_path,
            "duration": meta2.get("duration", 0),
            "width": meta2.get("width", 0),
            "height": meta2.get("height", 0),
            "status": "ok",
        }
    except Exception as e:
        raise _facade.HTTPException(status_code=500, detail=f"video clip error: {e}")
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
    dirpath = _facade.os.path.dirname(req.file_path)
    for name in req.transforms:
        spec = TRANSFORM_MAP.get(name)
        if not spec:
            continue
        out_path = _facade.os.path.join(dirpath, f"{name}_{_facade.uuid.uuid4().hex[:8]}.mp4")
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
            result = await _facade.run_subprocess(cmd, capture_output=True, text=True, timeout=120)
            if result.returncode == 0 and _facade.os.path.isfile(out_path) and _facade.os.path.getsize(out_path) > 0:
                variants.append({"name": name, "file_path": out_path})
        except Exception:
            pass
    return {"variants": variants, "status": "ok"}
@video_router.post("/video/frames")
async def video_frames(req: VideoFramesRequest):
    """Extract N evenly-spaced reference frames from a local video file.

    Timestamps at t = k * duration / (N+1) for k = 1..N (never the first or
    last frame).  Used by the Content Factory workflow to send reference
    frames alongside a base video to the variation bot.
    """
    if not _facade.os.path.isfile(req.file_path):
        raise _facade.HTTPException(status_code=404, detail=f"File not found: {req.file_path}")
    if req.num_frames < 1:
        raise _facade.HTTPException(status_code=400, detail="num_frames must be >= 1")

    from services.clipper.reframer import Reframer  # lazy import (endpoint convention)
    reframer = Reframer()

    meta = await _facade.probe_video(req.file_path)
    duration = float(meta.get("duration") or 0.0)
    if duration <= 0:
        return {"data": {"status": "failed", "error": "Could not probe video duration", "frames": []}}

    out_dir = req.output_dir or _facade.os.path.join(_facade.tempfile.gettempdir(), "content_factory_frames")
    _facade.os.makedirs(out_dir, exist_ok=True)

    n = req.num_frames
    frames = []
    for k in range(1, n + 1):
        ts = round(k * duration / (n + 1), 3)
        out_path = _facade.os.path.join(out_dir, f"frame_{k:02d}_{_facade.uuid.uuid4().hex[:8]}.jpg")
        try:
            reframer.generate_thumbnail(req.file_path, ts, out_path, title="")
        except Exception as exc:
            return {"data": {"status": "failed", "error": f"Frame {k} extraction failed: {exc}", "frames": frames}}
        frames.append({"index": k, "timestamp": ts, "file_path": out_path})

    return {"data": {"status": "ok", "num_frames": n, "frames": frames}}
