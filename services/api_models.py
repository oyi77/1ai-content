"""
Pydantic request models for 1AI-Content Factory API.

Extracted from services/api.py to keep the route file focused on wiring.
"""

from typing import Optional

from pydantic import BaseModel, Field
from services.db.models import ContentType


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
    content_type: str = ContentType.short.value
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


class VideoProcessRequest(BaseModel):
    source_url: str
    target_format: str = "9:16"  # 9:16, 16:9, 1:1
    platform: str = "facebook"   # facebook, tiktok, instagram
    category: str = "general"
    transforms: list[str] = []   # mirror | speed_<factor> | crop_zoom_<zoom>


class VideoInfoRequest(BaseModel):
    file_path: str


class VideoClipRequest(BaseModel):
    file_path: str
    start_time: float = 0
    duration: float = 30


class VideoTransformsRequest(BaseModel):
    file_path: str
    transforms: list[str]


class VideoSearchRequest(BaseModel):
    url: str


class VideoRegenerateOptions(BaseModel):
    remove_watermark: bool = True
    add_captions: bool = True
    caption_style: str = "karaoke"  # karaoke, simple, none
    color_grade: str = "vibrant"     # none, cinematic, warm, cool, vibrant, vintage
    text_overlay: str = ""           # e.g. "Check this out!"
    overlay_position: str = "bottom_center"
    generate_metadata: bool = True
    language: str = "id"


class VideoRegenerateRequest(BaseModel):
    url: str
    platform: str = "facebook"
    options: VideoRegenerateOptions = VideoRegenerateOptions()
