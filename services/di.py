"""
Dependency injection — lazy singleton getters for content services.

Each function imports its service module on first call and caches the instance,
avoiding up-front import cost of every service at module load.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
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

        _instances["engagement"] = AutoReplyEngine()
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
