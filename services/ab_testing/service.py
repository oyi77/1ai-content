"""
A/B Testing Service — PostgreSQL-backed via SQLAlchemy.

Generates two variants, tracks metrics, determines winner.
"""

import os
import json
import re
from datetime import datetime
from typing import Optional

import httpx
from sqlalchemy import select, update, delete, func
from sqlalchemy.ext.asyncio import AsyncSession

from services.db.models import ABTest, ContentType, get_async_session

OMNIRoute_URL = os.getenv("OMNIRoute_URL", "http://127.0.0.1:20128/v1")


class ABTestingService:
    """A/B testing backed by PostgreSQL."""

    async def create_test(
        self,
        user_id: int,
        name: str,
        topic: str,
        platform: str = "tiktok",
        content_type: str = ContentType.caption.value,
        language: str = "id",
        description: str = "",
    ) -> dict:
        """Create an A/B test with two AI-generated variants."""
        variants = self._generate_variants(topic, content_type, language)

        async with get_async_session() as session:
            test = ABTest(
                user_id=user_id,
                name=name,
                description=description,
                platform=platform,
                content_type=content_type,
                variant_a_caption=variants.get("A", {}).get("caption", ""),
                variant_b_caption=variants.get("B", {}).get("caption", ""),
                status="draft",
            )
            session.add(test)
            await session.commit()
            await session.refresh(test)
            return self._to_dict(test)

    async def get_tests(self, user_id: int, status: Optional[str] = None) -> list[dict]:
        """Get all tests for a user."""
        async with get_async_session() as session:
            query = select(ABTest).where(ABTest.user_id == user_id)
            if status:
                query = query.where(ABTest.status == status)
            query = query.order_by(ABTest.created_at.desc())
            result = await session.execute(query)
            return [self._to_dict(row) for row in result.scalars().all()]

    async def get_test(self, user_id: int, test_id: int) -> Optional[dict]:
        """Get a specific test."""
        async with get_async_session() as session:
            result = await session.execute(
                select(ABTest).where(ABTest.id == test_id, ABTest.user_id == user_id)
            )
            test = result.scalar_one_or_none()
            return self._to_dict(test) if test else None

    async def start_test(self, user_id: int, test_id: int) -> Optional[dict]:
        """Start an A/B test."""
        async with get_async_session() as session:
            query = (
                update(ABTest)
                .where(ABTest.id == test_id, ABTest.user_id == user_id)
                .values(status="running", started_at=datetime.now())
            )
            await session.execute(query)
            await session.commit()
            return await self.get_test(user_id, test_id)

    async def update_metrics(
        self,
        user_id: int,
        test_id: int,
        variant: str,
        views: int = 0,
        likes: int = 0,
        shares: int = 0,
        comments: int = 0,
    ) -> Optional[dict]:
        """Update metrics for a variant."""
        async with get_async_session() as session:
            test = await session.execute(
                select(ABTest).where(ABTest.id == test_id, ABTest.user_id == user_id)
            )
            entry = test.scalar_one_or_none()
            if not entry:
                return None

            suffix = "a" if variant.upper() == "A" else "b"
            current_views = getattr(entry, f"variant_{suffix}_views") or 0
            current_likes = getattr(entry, f"variant_{suffix}_likes") or 0
            current_shares = getattr(entry, f"variant_{suffix}_shares") or 0
            current_comments = getattr(entry, f"variant_{suffix}_comments") or 0

            query = (
                update(ABTest)
                .where(ABTest.id == test_id)
                .values(**{
                    f"variant_{suffix}_views": current_views + views,
                    f"variant_{suffix}_likes": current_likes + likes,
                    f"variant_{suffix}_shares": current_shares + shares,
                    f"variant_{suffix}_comments": current_comments + comments,
                })
            )
            await session.execute(query)
            await session.commit()
            return await self.get_test(user_id, test_id)

    async def end_test(self, user_id: int, test_id: int) -> Optional[dict]:
        """End test and determine winner."""
        test = await self.get_test(user_id, test_id)
        if not test:
            return None

        score_a = self._engagement_score(test.get("metrics_a", {}))
        score_b = self._engagement_score(test.get("metrics_b", {}))

        if score_a == score_b:
            winner = "tie"
        else:
            winner = "A" if score_a > score_b else "B"

        async with get_async_session() as session:
            query = (
                update(ABTest)
                .where(ABTest.id == test_id, ABTest.user_id == user_id)
                .values(status="completed", winner=winner, ended_at=datetime.now())
            )
            await session.execute(query)
            await session.commit()
            return await self.get_test(user_id, test_id)

    async def delete_test(self, user_id: int, test_id: int) -> bool:
        """Delete a test."""
        async with get_async_session() as session:
            query = delete(ABTest).where(ABTest.id == test_id, ABTest.user_id == user_id)
            result = await session.execute(query)
            await session.commit()
            return result.rowcount > 0

    async def get_stats(self, user_id: int) -> dict:
        """Get A/B testing statistics."""
        async with get_async_session() as session:
            total = await session.scalar(
                select(func.count()).select_from(ABTest).where(ABTest.user_id == user_id)
            )
            running = await session.scalar(
                select(func.count()).select_from(ABTest).where(
                    ABTest.user_id == user_id, ABTest.status == "running"
                )
            )
            completed = await session.scalar(
                select(func.count()).select_from(ABTest).where(
                    ABTest.user_id == user_id, ABTest.status == "completed"
                )
            )
            return {
                "total_tests": total or 0,
                "running": running or 0,
                "completed": completed or 0,
            }

    def _generate_variants(self, topic: str, content_type: str, language: str) -> dict:
        """Generate A/B variants using LLM."""
        lang_inst = "Gunakan bahasa Indonesia." if language == "id" else "Use English."

        if content_type == ContentType.caption.value:
            prompt = f"""Buatkan 2 variasi caption TikTok untuk topik: "{topic}"
{lang_inst}
Variasi A: Gaya formal/edukatif, panjang 200-300 karakter
Variasi B: Gaya casual/viral, panjang 100-200 karakter, banyak emoji
Output JSON: {{"A": {{"caption": "...", "hashtags": ["#tag1"]}}, "B": {{"caption": "...", "hashtags": ["#tag1"]}}}}"""
        else:
            prompt = f"""Buatkan 2 variasi deskripsi video TikTok untuk topik: "{topic}"
{lang_inst}
Variasi A: Storytelling naratif
Variasi B: Direct to the point, listicle
Output JSON: {{"A": {{"description": "...", "tags": ["#tag1"]}}, "B": {{"description": "...", "tags": ["#tag1"]}}}}"""

        try:
            response = httpx.post(
                f"{OMNIRoute_URL}/chat/completions",
                json={"model": "default", "messages": [{"role": "user", "content": prompt}], "temperature": 0.9, "max_tokens": 1000},
                timeout=30,
            )
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"]
            json_match = re.search(r"\{[\s\S]*\}", content)
            if json_match:
                return json.loads(json_match.group(0))
        except Exception:
            pass
        return {"A": {"caption": f"Variasi A: {topic}", "hashtags": []}, "B": {"caption": f"🔥 Variasi B: {topic} 🔥", "hashtags": []}}

    def _engagement_score(self, metrics: dict) -> float:
        return (
            metrics.get("views", 0) * 0.1
            + metrics.get("likes", 0) * 1.0
            + metrics.get("shares", 0) * 3.0
            + metrics.get("comments", 0) * 2.0
        )

    def _to_dict(self, test: ABTest) -> dict:
        return {
            "id": str(test.id),
            "user_id": test.user_id,
            "name": test.name,
            "description": test.description,
            "platform": test.platform,
            "content_type": test.content_type,
            "topic": test.description or "",
            "variant_a": {"caption": test.variant_a_caption},
            "variant_b": {"caption": test.variant_b_caption},
            "metrics_a": {
                "views": test.variant_a_views or 0,
                "likes": test.variant_a_likes or 0,
                "shares": test.variant_a_shares or 0,
                "comments": test.variant_a_comments or 0,
            },
            "metrics_b": {
                "views": test.variant_b_views or 0,
                "likes": test.variant_b_likes or 0,
                "shares": test.variant_b_shares or 0,
                "comments": test.variant_b_comments or 0,
            },
            "status": test.status,
            "winner": test.winner,
            "started_at": test.started_at.isoformat() if test.started_at else None,
            "ended_at": test.ended_at.isoformat() if test.ended_at else None,
            "created_at": test.created_at.isoformat() if test.created_at else None,
        }
