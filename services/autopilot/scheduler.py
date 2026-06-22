#!/usr/bin/env python3
"""
AutoPilot Scheduler — In-memory job scheduler for automated content publishing.

Manages scheduled jobs that generate and publish faceless videos
at configured posting times across multiple platforms.

Usage:
    from services.autopilot.scheduler import AutoPilotScheduler
    scheduler = AutoPilotScheduler()
    result = scheduler.create_job("My Channel", {
        "niche": "tech tips",
        "platforms": ["tiktok", "instagram"],
        "videos_per_day": 3,
        "posting_times": ["11:00", "15:00", "19:00"],
        "language": "id",
        "style": "educational",
        "auto_publish": True,
    })
"""

import uuid
from datetime import datetime


class AutoPilotScheduler:
    """In-memory scheduler for autopilot content jobs."""

    def __init__(self):
        self.jobs: dict[str, dict] = {}

    def create_job(self, name: str, config: dict) -> dict:
        """
        Create a new autopilot job.

        Args:
            name: Human-readable job name.
            config: Job configuration with keys:
                niche, platforms, videos_per_day, posting_times,
                language, style, auto_publish.

        Returns:
            {success, job_id, name, next_run}
        """
        job_id = str(uuid.uuid4())[:8]
        now = datetime.now()

        next_run = self._compute_next_run(config.get("posting_times", []))

        self.jobs[job_id] = {
            "job_id": job_id,
            "name": name,
            "config": config,
            "status": "active",
            "next_run": next_run,
            "last_run": None,
            "created_at": now.isoformat(),
        }

        return {
            "success": True,
            "job_id": job_id,
            "name": name,
            "next_run": next_run,
        }

    def get_jobs(self) -> list[dict]:
        """Return all jobs with their status."""
        return list(self.jobs.values())

    def get_job(self, job_id: str) -> dict:
        """Return a specific job by ID."""
        job = self.jobs.get(job_id)
        if not job:
            return {"success": False, "error": f"Job {job_id} not found"}
        return job

    def stop_job(self, job_id: str) -> dict:
        """Stop an active job."""
        if job_id not in self.jobs:
            return {"success": False, "error": f"Job {job_id} not found"}
        self.jobs[job_id]["status"] = "stopped"
        self.jobs[job_id]["next_run"] = None
        return {"success": True, "job_id": job_id, "status": "stopped"}

    def check_and_run(self) -> list[dict]:
        """
        Check all active jobs against current time.

        Returns list of jobs that should run now, based on
        posting_times matching the current hour:minute.
        """
        now = datetime.now()
        current_time = now.strftime("%H:%M")
        ready = []

        for job_id, job in self.jobs.items():
            if job["status"] != "active":
                continue

            posting_times = job["config"].get("posting_times", [])
            if current_time in posting_times:
                ready.append({
                    "job_id": job_id,
                    "name": job["name"],
                    "action": "generate_and_publish",
                    "config": job["config"],
                })

        return ready

    def mark_run(self, job_id: str) -> None:
        """
        Mark a job as run and compute next_run.

        Advances next_run to the next upcoming posting_time.
        """
        if job_id not in self.jobs:
            return

        now = datetime.now()
        self.jobs[job_id]["last_run"] = now.isoformat()
        self.jobs[job_id]["next_run"] = self._compute_next_run(
            self.jobs[job_id]["config"].get("posting_times", [])
        )

    # ── INTERNAL ────────────────────────────────────────────

    def _compute_next_run(self, posting_times: list[str]) -> str | None:
        """Find the next upcoming posting time from now."""
        if not posting_times:
            return None

        now = datetime.now()
        current_minutes = now.hour * 60 + now.minute

        # Sort times and find next one today
        for time_str in sorted(posting_times):
            h, m = time_str.split(":")
            target_minutes = int(h) * 60 + int(m)
            if target_minutes > current_minutes:
                return f"{now.strftime('%Y-%m-%d')} {time_str}"

        # All times passed today → first time tomorrow
        from datetime import timedelta
        tomorrow = now + timedelta(days=1)
        return f"{tomorrow.strftime('%Y-%m-%d')} {sorted(posting_times)[0]}"
