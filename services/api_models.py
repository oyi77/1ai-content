"""
Pydantic request models for 1AI-Content Factory API.

Extracted from services/api.py to keep the route file focused on wiring.
"""

from typing import Optional

from pydantic import BaseModel, Field


class TTSRequest(BaseModel):
    text: str
    language: str = "en"
    voice: str = "default"
    rate: Optional[float] = None
    pitch: Optional[float] = None


class AnalyzeRequest(BaseModel):
    channel_url: str
    niche: str = "general"
    limit: int = 10


class CompareRequest(BaseModel):
    channel_urls: list[str]
    niche: str = "general"


class CloakPostRequest(BaseModel):
    profile_id: str
    media_path: str
    caption: str
    platform: str
    link: Optional[str] = None
    tags: Optional[list[str]] = None


class CloakBatchPostRequest(BaseModel):
    profile_ids: list[str]
    media_path: str
    caption: str
    platform: str
    link: Optional[str] = None


class AutoPilotJobRequest(BaseModel):
    name: str
    niche: str
    platforms: list[str]
    videos_per_day: int = 3
    posting_times: list[str]
    content_type: str = "short"
    style: Optional[str] = None
    language: str = "en"
    auto_publish: bool = False
    tiktok_profile_id: Optional[str] = None


class CalendarEntryRequest(BaseModel):
    user_id: int
    topic: str
    scheduled_at: str
    platform: str
    content_type: str
    caption: str = ""
    hashtags: list[str] = Field(default_factory=list)
    niche: str = "general"
    style: str = "default"
    language: str = "en"
    auto_post: bool = False


class ABTestRequest(BaseModel):
    user_id: int
    name: str
    topic: str
    platform: str
    content_type: str
    language: str = "en"


class CaptionRequest(BaseModel):
    topic: str
    style: str = "default"
    platform: str = "tiktok"
    language: str = "en"
    max_length: int = 200
    include_hashtags: bool = True
    hashtag_count: int = 5


class RepurposeRequest(BaseModel):
    sources: list[str]
    target_duration: int = 60
    platform: str = "tiktok"
    niche: str = "general"
    style: str = "default"
    language: str = "en"
    color_preset: str = "default"
    transition_style: str = "fade"
    overlay_text: Optional[str] = None
    overlay_position: str = "bottom"
    watermark_text: Optional[str] = None
    watermark_image: Optional[str] = None
    bgm_path: Optional[str] = None
    bgm_volume: float = 0.3
    voiceover_path: Optional[str] = None
    speed_min: float = 0.8
    speed_max: float = 1.2
    add_subtitles: bool = False
    subtitle_style: str = "default"


class ReMetadataRequest(BaseModel):
    source: str
    overlay: Optional[str] = None
    watermark: Optional[str] = None
    position: str = "bottom"
    speed: float = 1.0
    color_shift: str = "none"
    niche: str = "general"
    platform: str = "tiktok"
    language: str = "en"
