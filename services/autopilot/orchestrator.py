#!/usr/bin/env python3
"""
AutoPilot Orchestrator — Executes scheduled content jobs.

Takes jobs from AutoPilotScheduler and runs the full pipeline:
1. Generate faceless videos (FacelessEngine)
2. Generate SEO metadata per platform
3. Publish via CloakBrowser profiles

Usage:
    from services.autopilot.orchestrator import AutoPilotOrchestrator
    orch = AutoPilotOrchestrator()
    result = orch.run_job({"job_id": "abc123", "config": {...}})
"""

import json
import os
from datetime import datetime

OMNIROUTE_URL = os.getenv("OMNIRoute_URL", "http://127.0.0.1:20128/v1")


class AutoPilotOrchestrator:
    """Execute autopilot jobs: generate → SEO → publish."""

    def __init__(self):
        self._faceless_engine = None
        self._seo_generator = None
        self._cloak_adapter = None
        # Daily counters
        self._total_videos_today = 0
        self._total_published_today = 0
        self._active_jobs = 0
        self._last_count_date = datetime.now().strftime("%Y-%m-%d")

    @property
    def faceless_engine(self):
        """Lazy-load FacelessEngine."""
        if self._faceless_engine is None:
            from services.faceless.engine import FacelessEngine
            self._faceless_engine = FacelessEngine()
        return self._faceless_engine

    @property
    def seo_generator(self):
        """Lazy-load SEOGenerator (uses LLM via OmniRoute)."""
        if self._seo_generator is None:
            self._seo_generator = _SEOGenerator()
        return self._seo_generator

    @property
    def cloak_adapter(self):
        """Lazy-load CloakBrowserAdapter."""
        if self._cloak_adapter is None:
            from services.cloak_adapter import CloakBrowserAdapter
            self._cloak_adapter = CloakBrowserAdapter()
        return self._cloak_adapter

    def run_job(self, job: dict) -> dict:
        """
        Execute a scheduled job.

        Steps:
        a. Generate N faceless videos using FacelessEngine
        b. Generate SEO for each video per platform
        c. Publish to CloakBrowser profiles

        Args:
            job: Job dict from scheduler with job_id, name, action, config.

        Returns:
            {success, job_id, videos_generated, videos_published, errors}
        """
        job_id = job.get("job_id", "unknown")
        config = job.get("config", {})
        niche = config.get("niche", "general")
        platforms = config.get("platforms", ["tiktok"])
        videos_per_day = config.get("videos_per_day", 1)
        language = config.get("language", "id")
        style = config.get("style", "educational")
        auto_publish = config.get("auto_publish", True)

        self._reset_daily_counters_if_needed()

        videos_generated = []
        videos_published = []
        errors = []

        # ── STEP A: Generate videos ─────────────────────────
        for i in range(videos_per_day):
            try:
                topic = f"{niche} - part {i + 1}"
                # Generate for the first platform (primary)
                primary_platform = platforms[0] if platforms else "tiktok"
                result = self.faceless_engine.generate_video(
                    topic=topic,
                    style=style,
                    platform=primary_platform,
                    language=language,
                )
                if result.get("success"):
                    videos_generated.append({
                        "index": i,
                        "path": result.get("output_path", ""),
                        "topic": topic,
                    })
                    self._total_videos_today += 1
                else:
                    errors.append(f"Video {i} generation failed: {result.get('error', 'unknown')}")
            except Exception as e:
                errors.append(f"Video {i} generation error: {e}")

        # ── STEP B: Generate SEO per video per platform ──────
        seo_data = {}
        for video in videos_generated:
            video_seo = {}
            for platform in platforms:
                try:
                    seo = self.seo_generator.generate(
                        topic=video["topic"],
                        platform=platform,
                        language=language,
                    )
                    video_seo[platform] = seo
                except Exception as e:
                    errors.append(f"SEO error for {video['topic']} on {platform}: {e}")
            seo_data[video["index"]] = video_seo

        # ── STEP C: Publish via CloakBrowser ─────────────────
        if auto_publish:
            for video in videos_generated:
                for platform in platforms:
                    try:
                        seo = seo_data.get(video["index"], {}).get(platform, {})
                        caption = seo.get("title", video["topic"])
                        tags = seo.get("tags", [])

                        pub_result = self.cloak_adapter.post(
                            profile_id=None,  # auto-select
                            media_path=video["path"],
                            caption=caption,
                            platform=platform,
                            tags=tags,
                        )
                        if pub_result and "error" not in pub_result:
                            videos_published.append({
                                "video_index": video["index"],
                                "platform": platform,
                            })
                            self._total_published_today += 1
                        else:
                            errors.append(
                                f"Publish {video['topic']} to {platform}: {pub_result.get('error', 'failed')}"
                            )
                    except Exception as e:
                        errors.append(f"Publish error {video['topic']} to {platform}: {e}")

        self._active_jobs += 1

        return {
            "success": len(errors) == 0,
            "job_id": job_id,
            "videos_generated": len(videos_generated),
            "videos_published": len(videos_published),
            "errors": errors,
        }

    def get_status(self) -> dict:
        """Return overall autopilot status."""
        self._reset_daily_counters_if_needed()
        return {
            "active_jobs": self._active_jobs,
            "total_videos_today": self._total_videos_today,
            "total_published_today": self._total_published_today,
            "next_run": self._next_run_hint(),
        }

    # ── INTERNAL ────────────────────────────────────────────

    def _reset_daily_counters_if_needed(self):
        """Reset counters if it's a new day."""
        today = datetime.now().strftime("%Y-%m-%d")
        if today != self._last_count_date:
            self._total_videos_today = 0
            self._total_published_today = 0
            self._active_jobs = 0
            self._last_count_date = today

    def _next_run_hint(self) -> str | None:
        """Return a hint for the next run (informational)."""
        return datetime.now().strftime("%Y-%m-%d %H:%M")


class _SEOGenerator:
    """Generate SEO metadata (titles, tags, descriptions) via LLM."""

    def generate(self, topic: str, platform: str, language: str = "id") -> dict:
        """Generate platform-specific SEO for a video topic."""
        import httpx

        lang_label = "Bahasa Indonesia" if language == "id" else language
        prompt = f"""Generate SEO metadata for a {platform} video about: "{topic}"
Language: {lang_label}

Return JSON with keys:
- title: catchy title for {platform} (max 100 chars)
- description: engaging description with hashtags (max 300 chars)
- tags: list of 10 relevant hashtags (without #)
- thumbnail_text: short text for thumbnail (max 5 words)

Return ONLY valid JSON, no markdown."""

        try:
            resp = httpx.post(
                f"{OMNIROUTE_URL}/chat/completions",
                json={
                    "model": "auto/best-chat",
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 512,
                    "temperature": 0.7,
                },
                timeout=30,
            )
            if resp.status_code == 200:
                content = resp.json()["choices"][0]["message"]["content"]
                # Strip markdown fences if present
                content = content.strip()
                if content.startswith("```"):
                    content = content.split("\n", 1)[-1]
                    content = content.rsplit("```", 1)[0]
                return json.loads(content.strip())
            return self._fallback_seo(topic, platform, language)
        except Exception:
            return self._fallback_seo(topic, platform, language)

    def _fallback_seo(self, topic: str, platform: str, language: str) -> dict:
        """Return basic SEO when LLM is unavailable."""
        return {
            "title": topic[:100],
            "description": f"{topic} #{platform} #viral",
            "tags": [topic.split()[0] if topic.split() else topic],
            "thumbnail_text": topic[:20],
        }
