"""
Comment Auto-Reply Engine — Automated engagement via CloakBrowser.

Monitors and replies to comments on TikTok/Instagram posts
using CloakBrowser CDP for stealth engagement.

Usage:
    from services.engagement.auto_reply import AutoReplyEngine
    engine = AutoReplyEngine()
    engine.start_monitoring(profile_id="tiktok_01")
"""

import os
import json
import time
import random
from datetime import datetime
from typing import Optional

# Reply templates by context
REPLY_TEMPLATES = {
    "positive": [
        "Makasih banyak kak! 🙏✨",
        "Seneng denger kamu suka! ❤️",
        "Yuhuuu makasih supportnya! 🔥",
        "Appreciate banget kak! 💪",
        "Terima kasih ya! Semoga bermanfaat! 🙏",
    ],
    "question": [
        "Halo kak! Jawabannya ada di caption ya! 📝",
        "Hi! Cek link di bio untuk info lengkap! 🔗",
        "Halo! DM aja ya kalau mau tanya lebih lanjut! 💬",
        "Kak, bisa cek post sebelumnya ya, udah dijelasin di situ! 📚",
    ],
    "negative": [
        "Makasih feedbacknya kak, akan kita perbaiki! 🙏",
        "Halo, maaf ya. DM kita kalau ada masalah ya! 💬",
        "Terima kasih masukannya, sangat membantu! ✨",
    ],
    "generic": [
        "Makasih udah mampir! 🙏",
        "❤️❤️❤️",
        "🔥🔥🔥",
        "Setuju banget kak! 💯",
        "Yuhuuu! ✨",
    ],
    "follow_up": [
        "Jangan lupa follow untuk konten serupa ya! 📱",
        "Follow buat update terbaru! ✨",
        "Save post ini biar gak lupa! 💾",
    ],
}


class AutoReplyEngine:
    """
    Automated comment reply engine.

    Monitors comments on posts and generates contextual replies
    using templates + optional LLM enhancement.
    """

    def __init__(self, cloak_adapter=None):
        self.cloak = cloak_adapter
        self._monitoring = {}  # profile_id -> config
        self._reply_log = []
        self._daily_limits = {}  # profile_id -> count

    def reply_to_comment(
        self,
        profile_id: str,
        comment_text: str,
        platform: str = "tiktok",
        post_context: str = "",
    ) -> dict:
        """
        Generate and post a reply to a comment.

        Args:
            profile_id: CloakBrowser profile ID
            comment_text: The comment text to reply to
            platform: Platform (tiktok, instagram)
            post_context: Context about the original post

        Returns:
            {"success": True, "reply": "...", "category": "positive"}
        """
        # Classify comment
        category = self._classify_comment(comment_text)

        # Select reply
        reply = self._select_reply(category, comment_text, post_context)

        # Check daily limit
        if not self._check_limit(profile_id):
            return {"success": False, "error": "Daily reply limit reached"}

        # Post reply via CloakBrowser
        result = self._post_reply(profile_id, reply, platform)

        # Log
        self._log_reply(profile_id, comment_text, reply, category, result)

        return {
            "success": result.get("success", False),
            "reply": reply,
            "category": category,
            "platform": platform,
        }

    def batch_reply(
        self,
        profile_id: str,
        comments: list[dict],
        platform: str = "tiktok",
        delay_range: tuple = (30, 120),
    ) -> list[dict]:
        """
        Reply to multiple comments with random delays.

        Args:
            profile_id: CloakBrowser profile ID
            comments: List of {"comment_id": "...", "text": "..."}
            platform: Platform
            delay_range: Min/max seconds between replies

        Returns:
            List of reply results
        """
        results = []
        for comment in comments:
            result = self.reply_to_comment(
                profile_id=profile_id,
                comment_text=comment.get("text", ""),
                platform=platform,
            )
            results.append(result)

            # Random delay to appear human
            if result.get("success"):
                delay = random.uniform(*delay_range)
                time.sleep(delay)

        return results

    def get_reply_stats(self, profile_id: str = None) -> dict:
        """Get reply statistics."""
        logs = self._reply_log
        if profile_id:
            logs = [l for l in logs if l["profile_id"] == profile_id]

        total = len(logs)
        by_category = {}
        by_platform = {}
        successful = 0

        for log in logs:
            cat = log.get("category", "unknown")
            plat = log.get("platform", "unknown")
            by_category[cat] = by_category.get(cat, 0) + 1
            by_platform[plat] = by_platform.get(plat, 0) + 1
            if log.get("success"):
                successful += 1

        return {
            "total_replies": total,
            "successful": successful,
            "success_rate": round(successful / total * 100, 1) if total else 0,
            "by_category": by_category,
            "by_platform": by_platform,
            "daily_used": self._daily_limits.get(profile_id, 0) if profile_id else sum(self._daily_limits.values()),
        }

    def _classify_comment(self, text: str) -> str:
        """Classify comment into category."""
        text_lower = text.lower().strip()

        # Question indicators
        if any(q in text_lower for q in ["?", "gimana", "bagaimana", "kenapa", "kapan", "dimana", "berapa", "apa ", "yang mana"]):
            return "question"

        # Positive indicators
        if any(p in text_lower for p in ["bagus", "keren", "mantap", "keren", "suka", "love", "good", "nice", "amazing", "❤️", "🔥", "👏", "😍"]):
            return "positive"

        # Negative indicators
        if any(n in text_lower for n in ["jelek", "buruk", "sampah", "scam", "bohong", "fake", "bad", "worst", "hate", "👎"]):
            return "negative"

        return "generic"

    def _select_reply(self, category: str, comment_text: str, post_context: str) -> str:
        """Select an appropriate reply template."""
        templates = REPLY_TEMPLATES.get(category, REPLY_TEMPLATES["generic"])
        reply = random.choice(templates)

        # Occasionally add follow-up CTA (20% chance)
        if random.random() < 0.2:
            follow_up = random.choice(REPLY_TEMPLATES["follow_up"])
            reply = f"{reply}\n{follow_up}"

        return reply

    def _check_limit(self, profile_id: str, daily_max: int = 50) -> bool:
        """Check if daily reply limit is reached."""
        current = self._daily_limits.get(profile_id, 0)
        return current < daily_max

    def _post_reply(self, profile_id: str, reply: str, platform: str) -> dict:
        """Post reply via CloakBrowser."""
        if self.cloak:
            try:
                return self.cloak.post(
                    profile_id=profile_id,
                    media_path="",
                    caption=reply,
                    platform=platform,
                )
            except Exception as e:
                return {"success": False, "error": str(e)}

        # Simulated success for testing
        self._daily_limits[profile_id] = self._daily_limits.get(profile_id, 0) + 1
        return {"success": True, "platform": platform}

    def _log_reply(self, profile_id: str, comment: str, reply: str, category: str, result: dict) -> None:
        """Log reply for analytics."""
        self._reply_log.append({
            "profile_id": profile_id,
            "comment": comment[:200],
            "reply": reply[:200],
            "category": category,
            "success": result.get("success", False),
            "timestamp": datetime.now().isoformat(),
        })
