#!/usr/bin/env python3
"""
A/B Testing Service — Test content variants and pick winners.

Generates two variants (A/B) of content, tracks performance,
and determines winners based on engagement metrics.

Usage:
    from services.ab_testing.service import ABTestingService
    ab = ABTestingService()
    test = ab.create_test("Caption test", topic="Tips coding", ...)
"""

import json
import os
from datetime import datetime
from typing import Optional

import httpx

OMNIRoute_URL = os.getenv("OMNIRoute_URL", "http://127.0.0.1:20128/v1")


class ABTestingService:
    """A/B testing for TikTok/Instagram content."""

    def __init__(self, storage_dir: str = None):
        self.storage_dir = storage_dir or os.path.expanduser("~/.openclaw/workspace/data/ab_tests")
        self.api_url = OMNIRoute_URL
        os.makedirs(self.storage_dir, exist_ok=True)

    def _user_file(self, user_id: int) -> str:
        return os.path.join(self.storage_dir, f"user_{user_id}.json")

    def _load_tests(self, user_id: int) -> list[dict]:
        path = self._user_file(user_id)
        if os.path.exists(path):
            with open(path) as f:
                return json.load(f)
        return []

    def _save_tests(self, user_id: int, tests: list[dict]) -> None:
        path = self._user_file(user_id)
        with open(path, "w") as f:
            json.dump(tests, f, indent=2, ensure_ascii=False, default=str)

    def create_test(
        self,
        user_id: int,
        name: str,
        topic: str,
        platform: str = "tiktok",
        content_type: str = "caption",  # "caption", "video", "carousel"
        language: str = "id",
        description: str = "",
    ) -> dict:
        """
        Create an A/B test with two variants.

        Generates variant A and variant B content using LLM.
        """
        # Generate two variants
        variants = self._generate_variants(topic, content_type, language)

        test = {
            "id": f"ab_{user_id}_{int(datetime.now().timestamp())}",
            "user_id": user_id,
            "name": name,
            "description": description,
            "platform": platform,
            "content_type": content_type,
            "topic": topic,
            "language": language,
            "variant_a": variants["A"],
            "variant_b": variants["B"],
            "metrics_a": {"views": 0, "likes": 0, "shares": 0, "comments": 0},
            "metrics_b": {"views": 0, "likes": 0, "shares": 0, "comments": 0},
            "status": "draft",
            "winner": None,
            "started_at": None,
            "ended_at": None,
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
        }

        tests = self._load_tests(user_id)
        tests.append(test)
        self._save_tests(user_id, tests)
        return test

    def start_test(self, user_id: int, test_id: str) -> Optional[dict]:
        """Start an A/B test."""
        return self._update_test(user_id, test_id, {
            "status": "running",
            "started_at": datetime.now().isoformat(),
        })

    def update_metrics(
        self,
        user_id: int,
        test_id: str,
        variant: str,  # "A" or "B"
        views: int = 0,
        likes: int = 0,
        shares: int = 0,
        comments: int = 0,
    ) -> Optional[dict]:
        """Update metrics for a variant."""
        tests = self._load_tests(user_id)
        for test in tests:
            if test["id"] == test_id:
                key = f"metrics_{variant.lower()}"
                if key in test:
                    test[key]["views"] += views
                    test[key]["likes"] += likes
                    test[key]["shares"] += shares
                    test[key]["comments"] += comments
                    test["updated_at"] = datetime.now().isoformat()
                    self._save_tests(user_id, tests)
                    return test
        return None

    def end_test(self, user_id: int, test_id: str) -> Optional[dict]:
        """End test and determine winner."""
        tests = self._load_tests(user_id)
        for test in tests:
            if test["id"] == test_id:
                test["status"] = "completed"
                test["ended_at"] = datetime.now().isoformat()
                test["winner"] = self._determine_winner(test["metrics_a"], test["metrics_b"])
                test["updated_at"] = datetime.now().isoformat()
                self._save_tests(user_id, tests)
                return test
        return None

    def get_tests(self, user_id: int, status: Optional[str] = None) -> list[dict]:
        """Get all tests, optionally filtered by status."""
        tests = self._load_tests(user_id)
        if status:
            tests = [t for t in tests if t.get("status") == status]
        return tests

    def get_test(self, user_id: int, test_id: str) -> Optional[dict]:
        """Get a specific test."""
        tests = self._load_tests(user_id)
        for test in tests:
            if test["id"] == test_id:
                return test
        return None

    def delete_test(self, user_id: int, test_id: str) -> bool:
        """Delete a test."""
        tests = self._load_tests(user_id)
        original_len = len(tests)
        tests = [t for t in tests if t["id"] != test_id]
        if len(tests) < original_len:
            self._save_tests(user_id, tests)
            return True
        return False

    def get_stats(self, user_id: int) -> dict:
        """Get A/B testing statistics."""
        tests = self._load_tests(user_id)
        total = len(tests)
        by_status = {}
        wins_a = 0
        wins_b = 0

        for t in tests:
            s = t.get("status", "draft")
            by_status[s] = by_status.get(s, 0) + 1
            if t.get("winner") == "A":
                wins_a += 1
            elif t.get("winner") == "B":
                wins_b += 1

        return {
            "total_tests": total,
            "by_status": by_status,
            "wins_a": wins_a,
            "wins_b": wins_b,
            "running": by_status.get("running", 0),
        }

    def _generate_variants(self, topic: str, content_type: str, language: str) -> dict:
        """Generate A/B variants using LLM."""
        lang_inst = "Gunakan bahasa Indonesia." if language == "id" else "Use English."

        if content_type == "caption":
            prompt = f"""Buatkan 2 variasi caption TikTok untuk topik: "{topic}"

{lang_inst}

Variasi A: Gaya formal/edukatif, panjang 200-300 karakter
Variasi B: Gaya casual/viral, panjang 100-200 karakter, banyak emoji

Output JSON:
{{"A": {{"caption": "...", "hashtags": ["#tag1", "#tag2"]}}, "B": {{"caption": "...", "hashtags": ["#tag1", "#tag2"]}}}}"""
        elif content_type == "carousel":
            prompt = f"""Buatkan 2 variasi judul carousel TikTok untuk topik: "{topic}"

{lang_inst}

Variasi A: Judul edukatif, bikin penasaran
Variasi B: Judul provokatif/clickbait tapi tetap relevan

Output JSON:
{{"A": {{"title": "...", "hook": "..."}}, "B": {{"title": "...", "hook": "..."}}}}"""
        else:
            prompt = f"""Buatkan 2 variasi deskripsi video TikTok untuk topik: "{topic}"

{lang_inst}

Variasi A: Storytelling naratif
Variasi B: Direct to the point, listicle style

Output JSON:
{{"A": {{"description": "...", "tags": ["#tag1"]}}, "B": {{"description": "...", "tags": ["#tag1"]}}}}"""

        try:
            response = httpx.post(
                f"{self.api_url}/chat/completions",
                json={
                    "model": "default",
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.9,
                    "max_tokens": 1000,
                },
                timeout=30,
            )
            response.raise_for_status()
            data = response.json()
            content = data["choices"][0]["message"]["content"]

            # Parse JSON from response
            import re
            json_match = re.search(r"\{[\s\S]*\}", content)
            if json_match:
                return json.loads(json_match.group(0))
        except Exception:
            pass

        # Fallback
        return {
            "A": {"caption": f"Variasi A: {topic}", "hashtags": []},
            "B": {"caption": f"🔥 Variasi B: {topic} 🔥", "hashtags": []},
        }

    def _determine_winner(self, metrics_a: dict, metrics_b: dict) -> str:
        """Determine winner based on engagement score."""
        score_a = self._engagement_score(metrics_a)
        score_b = self._engagement_score(metrics_b)

        if score_a == score_b:
            return "tie"
        return "A" if score_a > score_b else "B"

    def _engagement_score(self, metrics: dict) -> float:
        """Calculate engagement score: views×0.1 + likes×1 + shares×3 + comments×2."""
        return (
            metrics.get("views", 0) * 0.1
            + metrics.get("likes", 0) * 1.0
            + metrics.get("shares", 0) * 3.0
            + metrics.get("comments", 0) * 2.0
        )

    def _update_test(self, user_id: int, test_id: str, updates: dict) -> Optional[dict]:
        tests = self._load_tests(user_id)
        for test in tests:
            if test["id"] == test_id:
                test.update(updates)
                test["updated_at"] = datetime.now().isoformat()
                self._save_tests(user_id, tests)
                return test
        return None
