#!/usr/bin/env python3
"""
AutoPilot TikTok Publisher — Full pipeline from schedule to publish.

Wires AutoPilotScheduler → FacelessEngine / CarouselAssembler → CloakBrowser.

Usage:
    from services.autopilot.tiktok_publisher import AutoPilotTikTokPublisher
    pub = AutoPilotTikTokPublisher()
    result = pub.run_scheduled_job(job)
"""

import json
import os
import time
from datetime import datetime
from typing import Optional

from services.autopilot.scheduler import AutoPilotScheduler
from services.autopilot.orchestrator import AutoPilotOrchestrator
from services.cloakbrowser import CloakBrowserAdapter
from services.trends.seo_generator import SEOGenerator


class AutoPilotTikTokPublisher:
    """
    Full autopilot pipeline for TikTok content:
    1. Check scheduler for ready jobs
    2. Generate content (faceless video OR carousel)
    3. Generate SEO metadata (caption, hashtags)
    4. Publish via CloakBrowser
    5. Track results
    """

    def __init__(self):
        self.scheduler = AutoPilotScheduler()
        self.orchestrator = AutoPilotOrchestrator()
        self.cloak = CloakBrowserAdapter()
        self.seo = SEOGenerator()
        self._results_log = []

    def create_job(
        self,
        name: str,
        niche: str,
        platforms: list[str] = None,
        videos_per_day: int = 3,
        posting_times: list[str] = None,
        content_type: str = "video",  # "video", "carousel", "mixed"
        style: str = "educational",
        language: str = "id",
        auto_publish: bool = True,
        tiktok_profile_id: str = "",
    ) -> dict:
        """
        Create a new autopilot job.

        Args:
            name: Job name
            niche: Content niche (e.g., "tech tips", "cooking")
            platforms: Target platforms (default: ["tiktok"])
            videos_per_day: How many posts per day
            posting_times: List of posting times (e.g., ["11:00", "15:00", "19:00"])
            content_type: "video", "carousel", or "mixed"
            style: Content style
            language: Content language
            auto_publish: Whether to auto-publish or just generate
            tiktok_profile_id: CloakBrowser profile ID for TikTok

        Returns:
            Job config dict
        """
        if platforms is None:
            platforms = ["tiktok"]
        if posting_times is None:
            posting_times = ["11:00", "15:00", "19:00"]

        config = {
            "niche": niche,
            "platforms": platforms,
            "videos_per_day": videos_per_day,
            "posting_times": posting_times[:videos_per_day],
            "content_type": content_type,
            "style": style,
            "language": language,
            "auto_publish": auto_publish,
            "tiktok_profile_id": tiktok_profile_id,
        }

        return self.scheduler.create_job(name, config)

    def run_scheduled_job(self, job: dict) -> dict:
        """
        Execute a scheduled job: generate content → SEO → publish.

        Args:
            job: Job dict from scheduler

        Returns:
            Result dict with success/failure details
        """
        config = job.get("config", {})
        niche = config.get("niche", "general")
        content_type = config.get("content_type", "video")
        language = config.get("language", "id")
        style = config.get("style", "educational")
        auto_publish = config.get("auto_publish", True)
        tiktok_profile_id = config.get("tiktok_profile_id", "")

        result = {
            "job_id": job.get("job_id"),
            "timestamp": datetime.now().isoformat(),
            "content_type": content_type,
            "success": False,
        }

        try:
            # Step 1: Generate content
            if content_type == "carousel":
                content_result = self._generate_carousel(niche, style, language)
            elif content_type == "mixed":
                # Alternate between video and carousel
                import random
                content_type = random.choice(["video", "carousel"])
                if content_type == "carousel":
                    content_result = self._generate_carousel(niche, style, language)
                else:
                    content_result = self._generate_video(niche, style, language)
            else:
                content_result = self._generate_video(niche, style, language)

            if not content_result.get("success"):
                result["error"] = content_result.get("error", "Generation failed")
                return result

            # Step 2: Generate SEO metadata
            title = content_result.get("title", niche)
            desc = content_result.get("caption", "")
            seo = self.seo.generate_seo(title, desc, "tiktok", language)
            caption = seo.get("caption", desc)
            hashtags = seo.get("hashtags", [])

            result["caption"] = caption
            result["hashtags"] = hashtags
            result["posting_time"] = seo.get("posting_time")

            # Step 3: Publish via CloakBrowser
            if auto_publish and tiktok_profile_id:
                media_path = content_result.get("media_path") or (
                    content_result.get("slides", [None])[0]
                    if content_type == "carousel"
                    else content_result.get("video_path")
                )

                if media_path and os.path.exists(media_path):
                    tags = [h.lstrip("#") for h in hashtags[:5]]
                    pub_result = self.cloak.post(
                        profile_id=tiktok_profile_id,
                        media_path=media_path,
                        caption=caption,
                        platform="tiktok",
                        tags=tags,
                    )
                    result["publish_result"] = pub_result
                    result["published"] = "error" not in pub_result
                else:
                    result["published"] = False
                    result["error"] = "Media file not found"
            else:
                result["published"] = False
                result["ready_to_publish"] = True
                result["media_path"] = content_result.get("media_path") or content_result.get("video_path")

            result["success"] = True
            result["content_result"] = {
                k: v for k, v in content_result.items()
                if k not in ("slides", "content")
            }

        except Exception as e:
            result["error"] = str(e)

        self._results_log.append(result)
        return result

    def check_and_run(self) -> list[dict]:
        """Check scheduler for ready jobs and execute them."""
        ready_jobs = self.scheduler.check_and_run()
        results = []
        for job in ready_jobs:
            result = self.run_scheduled_job(job)
            self.scheduler.mark_run(job["job_id"])
            results.append(result)
        return results

    def get_status(self) -> dict:
        """Get overall autopilot status."""
        jobs = self.scheduler.get_jobs()
        return {
            "active_jobs": len([j for j in jobs if j.get("status") == "active"]),
            "total_jobs": len(jobs),
            "jobs": jobs,
            "recent_results": self._results_log[-10:],
            "last_run": self._results_log[-1]["timestamp"] if self._results_log else None,
        }

    def _generate_video(self, niche: str, style: str, language: str) -> dict:
        """Generate a faceless video."""
        return self.orchestrator.faceless_engine.generate_video(
            topic=niche,
            style=style,
            platform="tiktok",
            language=language,
            num_scenes=5,
        )

    def _generate_carousel(self, niche: str, style: str, language: str) -> dict:
        """Generate a carousel."""
        from services.carousel.assembler import CarouselAssembler
        assembler = CarouselAssembler()
        return assembler.create(
            topic=niche,
            num_slides=7,
            style=style,
            platform="tiktok",
            language=language,
        )
