"""
Dependency injection — singleton getters for content services.

Service modules are imported eagerly at module load for boot-time determinism
(static imports, no import cycles at load). Each getter lazily instantiates —
and caches — its singleton on first call.
"""

from __future__ import annotations

from typing import Any

# Static imports — eager module load for boot-time determinism (Phase 4).
from services.storyboard.engine import StoryboardEngine
from services.tts.engine import TTSEngine
from services.music.generator import MusicGenerator
from services.looping.engine import LoopingEngine
from services.analysis.channel_analyzer import ChannelAnalyzer
from services.cloak_adapter import CloakBrowserAdapter
from services.pinterest import PinterestScraper
from services.carousel.generator import CarouselGenerator
from services.content_calendar.content_calendar import ContentCalendarService
from services.ab_testing.service import ABTestingService
from services.autopilot.orchestrator import AutoPilotOrchestrator
from services.engagement import AutoReplyEngine
from services.repurpose.engine import RepurposeEngine
from services.remetadata.engine import ReMetadataEngine
from services.clipper.engine import ClipperEngine
from services.faceless.engine import FacelessEngine
from services.brand import BrandSettings
from services.podcast.engine import PodcastEngine
from services.newsletter.engine import NewsletterEngine
from services.article.engine import ArticleEngine
from services.infographic.engine import InfographicEngine
from services.meme.engine import MemeEngine
from services.subtitles.engine import SubtitlesEngine
from services.screenrec.engine import ScreenRecEngine
from services.interactive.engine import InteractiveEngine

_instances: dict[str, Any] = {}


def get_storyboard() -> StoryboardEngine:
    if "storyboard" not in _instances:
        from services.storyboard.engine import StoryboardEngine

        _instances["storyboard"] = StoryboardEngine()
    return _instances["storyboard"]


def get_tts() -> TTSEngine:
    if "tts" not in _instances:
        from services.tts.engine import TTSEngine

        _instances["tts"] = TTSEngine()
    return _instances["tts"]


def get_music() -> MusicGenerator:
    if "music" not in _instances:
        from services.music.generator import MusicGenerator

        _instances["music"] = MusicGenerator()
    return _instances["music"]


def get_looping() -> LoopingEngine:
    if "looping" not in _instances:
        from services.looping.engine import LoopingEngine

        _instances["looping"] = LoopingEngine()
    return _instances["looping"]


def get_analyzer() -> ChannelAnalyzer:
    if "analyzer" not in _instances:
        from services.analysis.channel_analyzer import ChannelAnalyzer

        _instances["analyzer"] = ChannelAnalyzer()
    return _instances["analyzer"]


def get_cloak() -> CloakBrowserAdapter:
    if "cloak" not in _instances:
        from services.cloak_adapter import CloakBrowserAdapter

        _instances["cloak"] = CloakBrowserAdapter()
    return _instances["cloak"]


def get_pinterest() -> PinterestScraper:
    if "pinterest" not in _instances:
        from services.pinterest import PinterestScraper

        _instances["pinterest"] = PinterestScraper()
    return _instances["pinterest"]


def get_carousel() -> CarouselGenerator:
    if "carousel" not in _instances:
        from services.carousel.generator import CarouselGenerator

        _instances["carousel"] = CarouselGenerator()
    return _instances["carousel"]


def get_calendar() -> ContentCalendarService:
    if "calendar" not in _instances:
        from services.content_calendar.content_calendar import ContentCalendarService

        _instances["calendar"] = ContentCalendarService()
    return _instances["calendar"]


def get_ab_testing() -> ABTestingService:
    if "ab_testing" not in _instances:
        from services.ab_testing.service import ABTestingService

        _instances["ab_testing"] = ABTestingService()
    return _instances["ab_testing"]


def get_autopilot() -> AutoPilotOrchestrator:
    if "autopilot" not in _instances:
        from services.autopilot.orchestrator import AutoPilotOrchestrator

        _instances["autopilot"] = AutoPilotOrchestrator()
    return _instances["autopilot"]


def get_engagement() -> AutoReplyEngine:
    if "engagement" not in _instances:
        from services.engagement import AutoReplyEngine

        _instances["engagement"] = AutoReplyEngine(cloak_adapter=get_cloak())
    return _instances["engagement"]


def get_repurpose_engine() -> RepurposeEngine:
    if "repurpose" not in _instances:
        from services.repurpose.engine import RepurposeEngine

        _instances["repurpose"] = RepurposeEngine()
    return _instances["repurpose"]


def get_remetadata_engine() -> ReMetadataEngine:
    if "remetadata" not in _instances:
        from services.remetadata.engine import ReMetadataEngine

        _instances["remetadata"] = ReMetadataEngine()
    return _instances["remetadata"]


def get_clipper() -> ClipperEngine:
    if "clipper" not in _instances:
        from services.clipper.engine import ClipperEngine

        _instances["clipper"] = ClipperEngine()
    return _instances["clipper"]


def get_faceless() -> FacelessEngine:
    if "faceless" not in _instances:
        from services.faceless.engine import FacelessEngine

        _instances["faceless"] = FacelessEngine()
    return _instances["faceless"]


def get_brand() -> BrandSettings:
    if "brand" not in _instances:
        from services.brand import BrandSettings

        _instances["brand"] = BrandSettings()
    return _instances["brand"]


def get_podcast() -> PodcastEngine:
    if "podcast" not in _instances:
        from services.podcast.engine import PodcastEngine

        _instances["podcast"] = PodcastEngine()
    return _instances["podcast"]


def get_newsletter() -> NewsletterEngine:
    if "newsletter" not in _instances:
        from services.newsletter.engine import NewsletterEngine

        _instances["newsletter"] = NewsletterEngine()
    return _instances["newsletter"]


def get_article() -> ArticleEngine:
    if "article" not in _instances:
        from services.article.engine import ArticleEngine

        _instances["article"] = ArticleEngine()
    return _instances["article"]


def get_infographic() -> InfographicEngine:
    if "infographic" not in _instances:
        from services.infographic.engine import InfographicEngine

        _instances["infographic"] = InfographicEngine()
    return _instances["infographic"]


def get_meme() -> MemeEngine:
    if "meme" not in _instances:
        from services.meme.engine import MemeEngine

        _instances["meme"] = MemeEngine()
    return _instances["meme"]


def get_subtitles() -> SubtitlesEngine:
    if "subtitles" not in _instances:
        from services.subtitles.engine import SubtitlesEngine

        _instances["subtitles"] = SubtitlesEngine()
    return _instances["subtitles"]


def get_screenrec() -> ScreenRecEngine:
    if "screenrec" not in _instances:
        from services.screenrec.engine import ScreenRecEngine

        _instances["screenrec"] = ScreenRecEngine()
    return _instances["screenrec"]


def get_interactive() -> InteractiveEngine:
    if "interactive" not in _instances:
        from services.interactive.engine import InteractiveEngine

        _instances["interactive"] = InteractiveEngine()
    return _instances["interactive"]
