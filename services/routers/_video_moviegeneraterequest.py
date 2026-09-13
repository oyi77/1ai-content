"""Carved verbatim out of ``services/routers/video.py`` — statements moved, no logic changed."""

from .video import (
    BaseModel,
    RepurposeRequest,
    video_router,
)

from . import video as _facade

class MovieGenerateRequest(BaseModel):
    prompt: str = _facade.Field(..., description="Video concept / story")
    genre: str = _facade.Field(default="general", description="Movie genre")
    language: str = _facade.Field(default="en", description="Language code")
    num_scenes: int = _facade.Field(default=8, ge=3, le=30, description="Number of scenes")
    style: str = _facade.Field(default="slideshow", description="Visual style")
class LoopRequest(BaseModel):
    audio_path: str
    duration_minutes: int = _facade.Field(default=60, ge=1, le=360)
    visual_type: str = "gradient"
    resolution: str = "1920x1080"
    colors: _facade.Optional[str] = None
    image_path: _facade.Optional[str] = None
class RemetaAdRequest(BaseModel):
    source: str
    overlay: _facade.Optional[str] = None
    watermark: _facade.Optional[str] = None
    position: str = "bottom"
    speed: float = 1.0
    color_shift: _facade.Optional[_facade.Union[bool, str]] = None
    niche: str = "general"
    platform: str = "facebook"
    language: str = "en"
class RenderAdRequest(BaseModel):
    image_url: str = ""
    title: str = _facade.Field(..., description="Product title/name")
    category: str = _facade.Field(default="beauty", description="Product category")
    affiliate_link: str = _facade.Field(default="", description="Shopee affiliate link")
    brand_name: str = _facade.Field(default="Shopee Affiliate", description="Brand/page name")
    ad_copy: _facade.Optional[str] = _facade.Field(default=None, description="Custom ad copy text")
    hook_text: _facade.Optional[str] = _facade.Field(default=None, description="Custom hook text")
    cta_text: str = _facade.Field(default="Link di Bio! 🔗", description="Call-to-action text")
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
                yield f"data: {_facade.json.dumps(event)}\n\n"
        except Exception as e:
            yield f"data: {_facade.json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return _facade.StreamingResponse(_generate(), media_type="text/event-stream")
@video_router.get("/video/movie/media/{path:path}")
async def video_movie_media(path: str):
    """Serve a generated movie file (cover image or video)."""
    base = _facade.Path(_facade.MOVIE_BASE).resolve()
    full = (base / path).resolve()
    if not str(full).startswith(str(base)):
        raise _facade.HTTPException(status_code=403, detail="Path traversal denied")
    if not full.exists():
        raise _facade.HTTPException(status_code=404, detail="File not found")

    ext = full.suffix.lower()
    media_type = (
        "image/png" if ext == ".png"
        else "image/jpeg" if ext in (".jpg", ".jpeg")
        else "video/mp4" if ext == ".mp4"
        else None
    )
    if not media_type:
        raise _facade.HTTPException(status_code=400, detail=f"Unsupported type: {ext}")

    return _facade.FileResponse(str(full), media_type=media_type)
@video_router.post("/video/loop")
async def video_loop(req: LoopRequest):
    """Create a looping video from audio."""
    try:
        engine = _facade.get_looping()
        res = req.resolution.split("x")
        width = int(res[0]) if len(res) == 2 else 1920
        height = int(res[1]) if len(res) == 2 else 1080
        timestamp = _facade.datetime.now().strftime("%Y%m%d_%H%M%S")
        output_dir = _facade.Path("/tmp/looping_output")
        output_dir.mkdir(parents=True, exist_ok=True)
        output_path = str(output_dir / f"loop_{timestamp}.mp4")

        result = await _facade.asyncio.to_thread(
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
        raise _facade.HTTPException(status_code=500, detail=str(e))
@video_router.get("/video/loop/video/{filename}")
async def video_loop_video(filename: str):
    """Serve generated looping video."""
    base_dir = _facade.Path("/tmp/looping_output")
    full_path = (base_dir / filename).resolve()
    if not str(full_path).startswith(str(base_dir.resolve()) + _facade.os.sep):
        raise _facade.HTTPException(status_code=400, detail="Invalid path")
    if not full_path.exists():
        raise _facade.HTTPException(status_code=404, detail="Video not found")
    return _facade.FileResponse(str(full_path), media_type="video/mp4")
@video_router.post("/video/remeta")
async def video_remeta(req: RemetaAdRequest):
    """Re-render video with new metadata (text overlay + re-encode)."""
    try:
        engine = _facade.get_remetadata_engine()
        result = engine.remetadata(
            source=req.source,
            overlay=req.overlay or None,
            watermark=req.watermark or None,
            position=req.position,
            speed=req.speed if req.speed > 0 else None,
            color_shift=_facade.normalize_color_shift(req.color_shift),
            niche=req.niche,
            platform=req.platform,
            language=req.language,
        )
        return result
    except Exception as e:
        raise _facade.HTTPException(status_code=500, detail=str(e))
@video_router.post("/video/repurpose")
async def video_repurpose(req: RepurposeRequest):
    """Repurpose content from multiple sources — anti-copyright remix."""
    try:
        engine = _facade.get_repurpose_engine()
        result = await _facade.asyncio.to_thread(
            engine.repurpose,
            sources=req.sources,
            target_duration=req.target_duration,
            platform=req.platform,
            niche=req.niche,
            style=req.style,
            language=req.language,
            color_preset=req.color_preset,
            transition_style=req.transition_style,
            overlay_text=req.overlay_text or None,
            overlay_position=req.overlay_position,
            watermark_text=req.watermark_text or None,
            watermark_image=req.watermark_image or None,
            bgm_path=req.bgm_path or None,
            bgm_volume=req.bgm_volume,
            voiceover_path=req.voiceover_path or None,
            speed_range=(req.speed_min, req.speed_max),
            add_subtitles=req.add_subtitles,
            subtitle_style=req.subtitle_style,
        )
        return result
    except Exception as e:
        raise _facade.HTTPException(status_code=500, detail=str(e))
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
        raise _facade.HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise _facade.HTTPException(status_code=500, detail=f"Remotion render error: {type(e).__name__}: {e}")
@video_router.post("/video/ad-hyperframes")
async def video_ad_hyperframes(req: RenderAdRequest):
    """Render a product ad video using HyperFrames (9:16, 1080x1920, 15s)."""
    import services.hyperframes as hyperframes
    try:
        result = await hyperframes.render_product_ad(
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
        raise _facade.HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise _facade.HTTPException(status_code=500, detail=f"HyperFrames render error: {type(e).__name__}: {e}")
