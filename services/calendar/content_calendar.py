#!/usr/bin/env python3
"""
Content Calendar Service — Schedule and manage content across platforms.

Provides CRUD operations for content calendar entries with
auto-integration to AutoPilot scheduler for automated publishing.

Usage:
    from services.calendar.content_calendar import ContentCalendarService
    cal = ContentCalendarService()
    entry = cal.schedule_content(user_id=123, topic="Tips coding", ...)
"""

import json
import os
from datetime import datetime, timedelta
from typing import Optional


class ContentCalendarService:
    """
    Content calendar for scheduling posts.

    Uses file-based storage with JSON for simplicity.
    In production, this would use Prisma/PostgreSQL.
    """

    def __init__(self, storage_dir: str = None):
        self.storage_dir = storage_dir or os.path.expanduser("~/.openclaw/workspace/data/calendar")
        os.makedirs(self.storage_dir, exist_ok=True)

    def _user_file(self, user_id: int) -> str:
        return os.path.join(self.storage_dir, f"user_{user_id}.json")

    def _load_entries(self, user_id: int) -> list[dict]:
        path = self._user_file(user_id)
        if os.path.exists(path):
            with open(path) as f:
                return json.load(f)
        return []

    def _save_entries(self, user_id: int, entries: list[dict]) -> None:
        path = self._user_file(user_id)
        with open(path, "w") as f:
            json.dump(entries, f, indent=2, ensure_ascii=False, default=str)

    def schedule_content(
        self,
        user_id: int,
        topic: str,
        scheduled_at: str,  # ISO format or "YYYY-MM-DD HH:MM"
        platform: str = "tiktok",
        content_type: str = "video",  # video, carousel, image
        caption: str = "",
        hashtags: list[str] = None,
        niche: str = "",
        style: str = "educational",
        language: str = "id",
        auto_post: bool = False,
    ) -> dict:
        """
        Schedule a content piece for future publishing.

        Returns:
            Created calendar entry dict
        """
        entries = self._load_entries(user_id)

        entry = {
            "id": f"cal_{user_id}_{int(datetime.now().timestamp())}",
            "user_id": user_id,
            "topic": topic,
            "scheduled_at": scheduled_at,
            "platform": platform,
            "content_type": content_type,
            "caption": caption,
            "hashtags": hashtags or [],
            "niche": niche,
            "style": style,
            "language": language,
            "auto_post": auto_post,
            "status": "scheduled",
            "media_url": None,
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
        }

        entries.append(entry)
        self._save_entries(user_id, entries)
        return entry

    def get_entries(
        self,
        user_id: int,
        status: Optional[str] = None,
        platform: Optional[str] = None,
        from_date: Optional[str] = None,
        to_date: Optional[str] = None,
        limit: int = 50,
    ) -> list[dict]:
        """Get calendar entries with optional filters."""
        entries = self._load_entries(user_id)

        if status:
            entries = [e for e in entries if e.get("status") == status]
        if platform:
            entries = [e for e in entries if e.get("platform") == platform]
        if from_date:
            entries = [e for e in entries if e.get("scheduled_at", "") >= from_date]
        if to_date:
            entries = [e for e in entries if e.get("scheduled_at", "") <= to_date]

        # Sort by scheduled_at
        entries.sort(key=lambda e: e.get("scheduled_at", ""))
        return entries[:limit]

    def get_today_entries(self, user_id: int) -> list[dict]:
        """Get entries scheduled for today."""
        today = datetime.now().strftime("%Y-%m-%d")
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        return self.get_entries(user_id, from_date=today, to_date=tomorrow)

    def get_upcoming(self, user_id: int, days: int = 7) -> list[dict]:
        """Get entries for the next N days."""
        now = datetime.now().strftime("%Y-%m-%d")
        end = (datetime.now() + timedelta(days=days)).strftime("%Y-%m-%d 23:59")
        return self.get_entries(user_id, from_date=now, to_date=end)

    def update_entry(self, user_id: int, entry_id: str, updates: dict) -> Optional[dict]:
        """Update a calendar entry."""
        entries = self._load_entries(user_id)
        for entry in entries:
            if entry["id"] == entry_id:
                entry.update(updates)
                entry["updated_at"] = datetime.now().isoformat()
                self._save_entries(user_id, entries)
                return entry
        return None

    def delete_entry(self, user_id: int, entry_id: str) -> bool:
        """Delete a calendar entry."""
        entries = self._load_entries(user_id)
        original_len = len(entries)
        entries = [e for e in entries if e["id"] != entry_id]
        if len(entries) < original_len:
            self._save_entries(user_id, entries)
            return True
        return False

    def mark_published(self, user_id: int, entry_id: str, media_url: str = "") -> Optional[dict]:
        """Mark an entry as published."""
        return self.update_entry(user_id, entry_id, {
            "status": "published",
            "media_url": media_url,
        })

    def get_stats(self, user_id: int) -> dict:
        """Get calendar statistics."""
        entries = self._load_entries(user_id)
        total = len(entries)
        by_status = {}
        by_platform = {}
        by_type = {}

        for e in entries:
            s = e.get("status", "unknown")
            p = e.get("platform", "unknown")
            t = e.get("content_type", "unknown")
            by_status[s] = by_status.get(s, 0) + 1
            by_platform[p] = by_platform.get(p, 0) + 1
            by_type[t] = by_type.get(t, 0) + 1

        return {
            "total": total,
            "by_status": by_status,
            "by_platform": by_platform,
            "by_type": by_type,
            "today_count": len(self.get_today_entries(user_id)),
            "upcoming_count": len(self.get_upcoming(user_id, days=7)),
        }

    def bulk_schedule_week(
        self,
        user_id: int,
        topics: list[str],
        platform: str = "tiktok",
        content_type: str = "video",
        posts_per_day: int = 3,
        posting_hours: list[int] = None,
        **kwargs,
    ) -> list[dict]:
        """
        Bulk schedule content for a week.

        Distributes topics across the next 7 days at specified posting hours.
        """
        if posting_hours is None:
            posting_hours = [11, 15, 19]

        entries = []
        topic_idx = 0

        for day_offset in range(7):
            date = datetime.now() + timedelta(days=day_offset)
            for hour in posting_hours[:posts_per_day]:
                if topic_idx >= len(topics):
                    break
                scheduled_at = date.replace(hour=hour, minute=0, second=0).strftime("%Y-%m-%d %H:%M")
                entry = self.schedule_content(
                    user_id=user_id,
                    topic=topics[topic_idx],
                    scheduled_at=scheduled_at,
                    platform=platform,
                    content_type=content_type,
                    **kwargs,
                )
                entries.append(entry)
                topic_idx += 1

        return entries
