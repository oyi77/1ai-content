"""
Pydantic request models for 1AI-Content Factory API.

Extracted from services/api.py to keep the route file focused on wiring.
"""

from typing import Optional, Union

from pydantic import BaseModel, Field
from services.db.models import ContentType


class TTSRequest(BaseModel):
    text: str
    language: str = "en"
    voice: str = "default"
    rate: Optional[str] = None
    pitch: Optional[str] = None


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
    color_shift: Optional[Union[bool, str]] = "none"
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


class VideoFramesRequest(BaseModel):
    file_path: str                        # local path (VideoInfoRequest-style, no download)
    num_frames: int = 5                   # N; timestamps at k*duration/(N+1), k=1..N
    output_dir: str | None = None         # optional; defaults to a temp frames dir


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


class ClipperClipRequest(BaseModel):
    """Clip a source video into highlight segments (ClipperEngine.clip_video)."""
    source: str
    num_clips: int = 5
    clip_duration: int = 60
    platform: str = "tiktok"
    language: Optional[str] = None
    reframe_vertical: bool = True
    add_subtitles: bool = True
    add_thumbnails: bool = True


class FacelessGenerateRequest(BaseModel):
    """Generate a faceless video from a topic (FacelessEngine.generate_video)."""
    topic: str
    style: str = "educational"
    platform: str = "tiktok"
    language: str = "id"
    num_scenes: int = 6
    use_ab_split: bool = True
    add_captions: bool = True
    bgm_path: Optional[str] = None


class FacelessProductRequest(BaseModel):
    """Generate a faceless product promo video (FacelessEngine.generate_product_video)."""
    product_name: str
    product_desc: str
    price: str = ""
    style: str = "pain_point"
    platform: str = "tiktok"
    language: str = "id"


class FacelessBatchRequest(BaseModel):
    """Batch-generate faceless videos from a clone plan (FacelessEngine.batch_generate)."""
    clone_plan: dict
    platform: str = "tiktok"
    language: str = "id"
    max_videos: int = 10


class BrandSetRequest(BaseModel):
    """Set per-user brand settings (BrandSettings.set_brand)."""
    user_id: str
    name: str = ""
    logo_path: Optional[str] = None
    watermark_path: Optional[str] = None
    primary_color: str = "#FF6B35"
    secondary_color: str = "#004E89"
    font_style: str = "default"
    tagline: str = ""
    platforms: list[str] = Field(default_factory=list)


class BrandWatermarkRequest(BaseModel):
    """Apply a user's watermark to a video (BrandSettings.apply_watermark)."""
    video_path: str
    user_id: str
    output_path: str


# ── Content-type gaps (Phase 1-3): podcast / newsletter / article / infographic / meme / subtitles / screen-rec / interactive ──

class PodcastSegment(BaseModel):
    """One spoken segment of a podcast episode (PodcastEngine.generate)."""
    speaker: str = "narrator"
    text: str
    voice: Optional[str] = None
    rate: Optional[str] = None


class PodcastRequest(BaseModel):
    """Generate a podcast episode: TTS per segment + ffmpeg concat (+ optional BGM bed)."""
    title: str = "Podcast Episode"
    segments: list[PodcastSegment]
    music_style: Optional[str] = None
    language: str = "id"
    output_dir: Optional[str] = None


class NewsletterRequest(BaseModel):
    """Generate an HTML email newsletter from a topic (NewsletterEngine.generate)."""
    topic: str
    audience: str = "general"
    sections: int = Field(default=3, ge=1, le=10)
    tone: str = "professional"
    language: str = "en"
    brand_name: str = "1AI Content"
    cta_url: Optional[str] = None


class ArticleRequest(BaseModel):
    """Generate a long-form article (ArticleEngine.generate)."""
    topic: str
    keywords: Optional[list[str]] = None
    audience: str = "general"
    length_words: int = Field(default=800, ge=200, le=5000)
    language: str = "en"
    tone: str = "informative"
    format: str = "html"  # html | markdown


class InfographicDataPoint(BaseModel):
    """One labeled numeric data point (InfographicEngine.generate)."""
    label: str
    value: float


class InfographicRequest(BaseModel):
    """Render a data-point infographic PNG (InfographicEngine.generate)."""
    title: str
    data_points: list[InfographicDataPoint]
    chart_kind: str = "bar"  # bar | stat
    theme: str = "dark"      # dark | light
    output_dir: Optional[str] = None


class MemeRequest(BaseModel):
    """Render a meme PNG (MemeEngine.generate)."""
    template_id: str = "default"
    top_text: str = ""
    bottom_text: str = ""
    image_url: Optional[str] = None
    output_dir: Optional[str] = None


class SubtitleSegment(BaseModel):
    """One subtitle caption window (SubtitlesEngine.burn)."""
    start: float = Field(ge=0)
    end: float = Field(ge=0)
    text: str
    style: Optional[str] = None


class CaptionsMultiRequest(BaseModel):
    """Burn subtitle segments onto a video (SubtitlesEngine.burn)."""
    video_path: str
    segments: list[SubtitleSegment]
    style: str = "default"
    font_size: int = Field(default=24, ge=8, le=120)
    output_dir: Optional[str] = None


class ScreenRecRequest(BaseModel):
    """Record the X display (or region) with optional narration (ScreenRecEngine.capture)."""
    duration: int = Field(default=10, ge=1, le=600)
    region: Optional[str] = None  # "WxH+X+Y" | None = fullscreen
    fps: int = Field(default=15, ge=1, le=60)
    narration: Optional[str] = None
    voice: Optional[str] = None
    allow_headless: bool = False
    output_dir: Optional[str] = None


class InteractiveNode(BaseModel):
    """One branching-video node; choices are target node ids (InteractiveEngine.build)."""
    id: str
    text: str
    choices: list[str] = Field(default_factory=list)
    media: Optional[str] = None


class InteractiveRequest(BaseModel):
    """Build an interactive/branching video manifest (InteractiveEngine.build)."""
    title: str
    start_id: str
    nodes: list[InteractiveNode]
