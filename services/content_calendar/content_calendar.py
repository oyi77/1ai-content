"""
Content Calendar Service — PostgreSQL-backed via SQLAlchemy.

Schedules content for auto-publishing across platforms.
"""

import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select, update, delete, func
from sqlalchemy.ext.asyncio import AsyncSession

from services.db.models import ContentCalendar, get_async_session


class ContentCalendarService:
    """Content calendar backed by PostgreSQL."""

    async def schedule_content(
        self,
        user_id: int,
        topic: str,
        scheduled_at: str,
        platform: str = "tiktok",
        content_type: str = "video",
        caption: str = "",
        hashtags: list[str] = None,
        niche: str = "",
        style: str = "educational",
        language: str = "id",
        auto_post: bool = False,
    ) -> dict:
        """Schedule a content piece."""
        async with get_async_session() as session:
            raw = scheduled_at if isinstance(scheduled_at, str) else None
            if raw is not None:
                dt = datetime.fromisoformat(raw)
            else:
                dt = scheduled_at
            # content_calendar.scheduled_at is TIMESTAMP WITHOUT TIME ZONE;
            # strip tzinfo (normalize to UTC) to avoid asyncpg DataError on
            # aware datetimes from ISO-8601 strings with a Z/offset suffix.
            if getattr(dt, "tzinfo", None) is not None:
                dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
            entry = ContentCalendar(
                user_id=user_id,
                topic=topic,
                scheduled_at=dt,
                platform=platform,
                content_type=content_type,
                caption=caption,
                hashtags=hashtags or [],
                niche=niche,
                style=style,
                language=language,
                auto_post=auto_post,
                status="scheduled",
            )
            session.add(entry)
            await session.commit()
            await session.refresh(entry)
            return self._to_dict(entry)

    async def get_entries(
        self,
        user_id: int,
        status: Optional[str] = None,
        platform: Optional[str] = None,
        limit: int = 50,
    ) -> list[dict]:
        """Get calendar entries with optional filters."""
        async with get_async_session() as session:
            query = select(ContentCalendar).where(ContentCalendar.user_id == user_id)
            if status:
                query = query.where(ContentCalendar.status == status)
            if platform:
                query = query.where(ContentCalendar.platform == platform)
            query = query.order_by(ContentCalendar.scheduled_at.asc()).limit(limit)
            result = await session.execute(query)
            return [self._to_dict(row) for row in result.scalars().all()]

    async def get_today_entries(self, user_id: int) -> list[dict]:
        """Get entries scheduled for today."""
        today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        tomorrow = today + timedelta(days=1)
        async with get_async_session() as session:
            query = (
                select(ContentCalendar)
                .where(ContentCalendar.user_id == user_id)
                .where(ContentCalendar.scheduled_at >= today)
                .where(ContentCalendar.scheduled_at < tomorrow)
                .order_by(ContentCalendar.scheduled_at.asc())
            )
            result = await session.execute(query)
            return [self._to_dict(row) for row in result.scalars().all()]

    async def update_entry(self, user_id: int, entry_id: int, updates: dict) -> Optional[dict]:
        """Update a calendar entry."""
        async with get_async_session() as session:
            query = (
                update(ContentCalendar)
                .where(ContentCalendar.id == entry_id)
                .where(ContentCalendar.user_id == user_id)
                .values(**updates)
            )
            await session.execute(query)
            await session.commit()
            # Return updated entry
            result = await session.execute(
                select(ContentCalendar).where(ContentCalendar.id == entry_id)
            )
            entry = result.scalar_one_or_none()
            return self._to_dict(entry) if entry else None

    async def delete_entry(self, user_id: int, entry_id: int) -> bool:
        """Delete a calendar entry."""
        async with get_async_session() as session:
            query = delete(ContentCalendar).where(
                ContentCalendar.id == entry_id,
                ContentCalendar.user_id == user_id,
            )
            result = await session.execute(query)
            await session.commit()
            return result.rowcount > 0

    async def mark_published(self, user_id: int, entry_id: int, media_url: str = "") -> Optional[dict]:
        """Mark an entry as published."""
        return await self.update_entry(user_id, entry_id, {
            "status": "published",
            "media_url": media_url,
        })

    async def get_stats(self, user_id: int) -> dict:
        """Get calendar statistics."""
        async with get_async_session() as session:
            total = await session.scalar(
                select(func.count()).select_from(ContentCalendar).where(ContentCalendar.user_id == user_id)
            )
            scheduled = await session.scalar(
                select(func.count()).select_from(ContentCalendar).where(
                    ContentCalendar.user_id == user_id, ContentCalendar.status == "scheduled"
                )
            )
            published = await session.scalar(
                select(func.count()).select_from(ContentCalendar).where(
                    ContentCalendar.user_id == user_id, ContentCalendar.status == "published"
                )
            )
            failed = await session.scalar(
                select(func.count()).select_from(ContentCalendar).where(
                    ContentCalendar.user_id == user_id, ContentCalendar.status == "failed"
                )
            )
            return {
                "total": total or 0,
                "scheduled": scheduled or 0,
                "published": published or 0,
                "failed": failed or 0,
            }

    async def get_pending_for_auto_publish(self) -> list[dict]:
        """Get entries that are due for auto-publishing."""
        now = datetime.now()
        async with get_async_session() as session:
            query = (
                select(ContentCalendar)
                .where(ContentCalendar.status == "scheduled")
                .where(ContentCalendar.auto_post == True)  # noqa: E712
                .where(ContentCalendar.scheduled_at <= now)
                .order_by(ContentCalendar.scheduled_at.asc())
                .limit(10)
            )
            result = await session.execute(query)
            return [self._to_dict(row) for row in result.scalars().all()]

    def _to_dict(self, entry: ContentCalendar) -> dict:
        """Convert model to dict."""
        return {
            "id": str(entry.id),
            "user_id": entry.user_id,
            "topic": entry.topic,
            "scheduled_at": entry.scheduled_at.isoformat() if entry.scheduled_at else None,
            "platform": entry.platform,
            "content_type": entry.content_type,
            "caption": entry.caption,
            "hashtags": entry.hashtags or [],
            "media_url": entry.media_url,
            "status": entry.status,
            "niche": entry.niche,
            "style": entry.style,
            "language": entry.language,
            "auto_post": entry.auto_post,
            "created_at": entry.created_at.isoformat() if entry.created_at else None,
        }
