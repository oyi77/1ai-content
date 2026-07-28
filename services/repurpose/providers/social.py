"""Social media specific processing — metadata generation for platform-specific output."""
from __future__ import annotations

from typing import Any


def _generate_metadata(
    seo_engine: Any,
    segments: list[dict],
    niche: str,
    platform: str,
    language: str,
) -> dict:
    """Generate completely new metadata."""
    combined = " ".join(seg.get("text", "") for seg in segments if seg.get("text"))

    try:
        title = f"Best {niche} Tips You Need To Know"
        if language == "id":
            title = f"Tips {niche} Terbaik Yang Wajib Kamu Tahu"

        seo = seo_engine.generate_seo(title, combined[:500], platform, language)
        return {
            "title": seo.get("title", title),
            "caption": seo.get("caption", combined[:300]),
            "hashtags": seo.get("hashtags", []),
            "posting_time": seo.get("posting_time", "12:00"),
            "engagement_hooks": seo.get("engagement_hooks", []),
            "platform": platform,
        }
    except Exception:
        return {
            "title": f"Best {niche} Tips",
            "caption": combined[:300],
            "hashtags": [f"#{niche.replace(' ', '')}", "#tips", "#viral"],
            "posting_time": "12:00",
            "platform": platform,
        }