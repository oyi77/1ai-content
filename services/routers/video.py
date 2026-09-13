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
from typing import Optional, Union

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field

from services.utils import TIKTOK_BROWSERS, extract_browser_cookies, has_tiktok_cookies, probe_field, probe_video, run_subprocess
from services.api_models import VideoProcessRequest, VideoInfoRequest, VideoClipRequest, VideoTransformsRequest, VideoFramesRequest, VideoSearchRequest, VideoRegenerateOptions, VideoRegenerateRequest, RepurposeRequest
from services.di import get_looping, get_repurpose_engine, get_remetadata_engine
from services.remetadata.engine import normalize_color_shift

video_router = APIRouter(prefix="", tags=["video"])
MOVIE_BASE = os.path.join(os.path.dirname(__file__), "..", "media", "movies")

from ._video_refresh_tiktok_cookies import (  # noqa: E402  (must follow the names it imports back)
    process_video,
    refresh_tiktok_cookies,
    video_search,
)

from ._video_video_regenerate import (  # noqa: E402  (must follow the names it imports back)
    _get_video_clip_fn,
    video_clip,
    video_frames,
    video_info,
    video_regenerate,
    video_transforms,
)

from ._video_moviegeneraterequest import (  # noqa: E402  (must follow the names it imports back)
    LoopRequest,
    MovieGenerateRequest,
    RemetaAdRequest,
    RenderAdRequest,
    video_ad,
    video_ad_hyperframes,
    video_loop,
    video_loop_video,
    video_movie,
    video_movie_media,
    video_remeta,
    video_repurpose,
)


__all__ = [
    "APIRouter",
    "BaseModel",
    "Field",
    "FileResponse",
    "HTTPException",
    "LoopRequest",
    "MOVIE_BASE",
    "MovieGenerateRequest",
    "Optional",
    "Path",
    "RemetaAdRequest",
    "RenderAdRequest",
    "RepurposeRequest",
    "StreamingResponse",
    "TIKTOK_BROWSERS",
    "Union",
    "VideoClipRequest",
    "VideoFramesRequest",
    "VideoInfoRequest",
    "VideoProcessRequest",
    "VideoRegenerateOptions",
    "VideoRegenerateRequest",
    "VideoSearchRequest",
    "VideoTransformsRequest",
    "_get_video_clip_fn",
    "asyncio",
    "datetime",
    "extract_browser_cookies",
    "get_looping",
    "get_remetadata_engine",
    "get_repurpose_engine",
    "has_tiktok_cookies",
    "json",
    "normalize_color_shift",
    "os",
    "probe_field",
    "probe_video",
    "process_video",
    "random",
    "refresh_tiktok_cookies",
    "run_subprocess",
    "subprocess",
    "tempfile",
    "uuid",
    "video_ad",
    "video_ad_hyperframes",
    "video_clip",
    "video_frames",
    "video_info",
    "video_loop",
    "video_loop_video",
    "video_movie",
    "video_movie_media",
    "video_regenerate",
    "video_remeta",
    "video_repurpose",
    "video_router",
    "video_search",
    "video_transforms",
]
