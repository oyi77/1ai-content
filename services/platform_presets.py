"""
Canonical platform dimension presets for video rendering.

Single source of truth — all consumers import from here.
"""

PLATFORM_PRESETS: dict[str, dict] = {
    "tiktok": {"width": 1080, "height": 1920, "fps": 30, "max_duration": 180, "aspect": "9:16"},
    "instagram_reels": {"width": 1080, "height": 1920, "fps": 30, "max_duration": 90, "aspect": "9:16"},
    "instagram_feed": {"width": 1080, "height": 1350, "fps": 30, "max_duration": 60, "aspect": "4:5"},
    "youtube_shorts": {"width": 1080, "height": 1920, "fps": 30, "max_duration": 60, "aspect": "9:16"},
    "youtube": {"width": 1920, "height": 1080, "fps": 30, "max_duration": 600, "aspect": "16:9"},
    "square": {"width": 1080, "height": 1080, "fps": 30, "max_duration": 60, "aspect": "1:1"},
}
