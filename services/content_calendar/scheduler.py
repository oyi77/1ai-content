"""
Content Calendar — In-memory scheduling for multi-platform posts.

Handles post creation, scheduling with repeat patterns, due-date queries,
publishing lifecycle, and per-user statistics. All times are UTC.
"""

import uuid
from datetime import datetime, timedelta


class ContentCalendar:
    """Content calendar with scheduling and publishing status tracking."""

    VALID_REPEAT = {"none", "daily", "weekly"}
    VALID_STATUSES = {"scheduled", "published", "failed"}

    def __init__(self):
        # {user_id: {post_id: post_dict, ...}, ...}
        self._posts: dict[str, dict[str, dict]] = {}

    def add_post(
        self,
        user_id: str,
        platform: str,
        content: dict,
        scheduled_at: str,
        repeat: str = "none",
    ) -> dict:
        """
        Schedule a new post.

        Args:
            user_id: Owner of the post.
            platform: Target platform (e.g. 'instagram', 'tiktok').
            content: {title, description, media_path, caption, hashtags}.
            scheduled_at: ISO datetime string, e.g. '2026-06-25T11:00:00'.
            repeat: 'none', 'daily', or 'weekly'.

        Returns:
            {success, post_id, scheduled_at, platform}
        """
        if repeat not in self.VALID_REPEAT:
            return {"success": False, "error": f"Invalid repeat: {repeat}"}

        try:
            dt = datetime.fromisoformat(scheduled_at)
        except (ValueError, TypeError):
            return {"success": False, "error": f"Invalid datetime: {scheduled_at}"}

        post_id = str(uuid.uuid4())
        post = {
            "post_id": post_id,
            "user_id": user_id,
            "platform": platform,
            "content": content,
            "scheduled_at": dt.isoformat(),
            "repeat": repeat,
            "status": "scheduled",
            "publish_result": None,
            "created_at": datetime.utcnow().isoformat(),
        }

        self._posts.setdefault(user_id, {})[post_id] = post

        return {
            "success": True,
            "post_id": post_id,
            "scheduled_at": dt.isoformat(),
            "platform": platform,
        }

    def get_schedule(self, user_id: str, days: int = 30) -> dict:
        """
        Get all scheduled posts for a user within the next N days.

        Returns:
            {success, dates: {'YYYY-MM-DD': [{post_id, platform, title, scheduled_at, status}], ...}, total_posts}
        """
        if user_id not in self._posts:
            return {"success": True, "dates": {}, "total_posts": 0}

        now = datetime.utcnow()
        cutoff = now + timedelta(days=days)

        dates: dict[str, list[dict]] = {}
        total = 0

        for post in self._posts[user_id].values():
            dt = datetime.fromisoformat(post["scheduled_at"])
            if now <= dt <= cutoff:
                date_key = dt.strftime("%Y-%m-%d")
                entry = {
                    "post_id": post["post_id"],
                    "platform": post["platform"],
                    "title": post["content"].get("title", ""),
                    "scheduled_at": post["scheduled_at"],
                    "status": post["status"],
                }
                dates.setdefault(date_key, []).append(entry)
                total += 1

        # Sort entries within each date by scheduled_at
        for date_key in dates:
            dates[date_key].sort(key=lambda e: e["scheduled_at"])

        return {"success": True, "dates": dict(sorted(dates.items())), "total_posts": total}

    def remove_post(self, user_id: str, post_id: str) -> dict:
        """
        Remove/cancel a scheduled post.

        Returns:
            {success, message}
        """
        user_posts = self._posts.get(user_id)
        if not user_posts or post_id not in user_posts:
            return {"success": False, "message": f"Post {post_id} not found"}

        del user_posts[post_id]
        return {"success": True, "message": f"Post {post_id} removed"}

    def get_due_posts(self, current_time: str = "") -> list[dict]:
        """
        Get all posts that should be published now.

        Args:
            current_time: ISO datetime string. Defaults to utcnow().

        Returns:
            [{user_id, post_id, platform, content, scheduled_at}, ...]
        """
        if current_time:
            now = datetime.fromisoformat(current_time)
        else:
            now = datetime.utcnow()

        due = []
        for user_id, user_posts in self._posts.items():
            for post in user_posts.values():
                if post["status"] != "scheduled":
                    continue
                dt = datetime.fromisoformat(post["scheduled_at"])
                if dt <= now:
                    due.append({
                        "user_id": user_id,
                        "post_id": post["post_id"],
                        "platform": post["platform"],
                        "content": post["content"],
                        "scheduled_at": post["scheduled_at"],
                    })

        return due

    def mark_published(self, user_id: str, post_id: str, result: dict) -> None:
        """Mark a post as published with the result payload."""
        user_posts = self._posts.get(user_id)
        if not user_posts or post_id not in user_posts:
            return

        post = user_posts[post_id]
        post["status"] = "published"
        post["publish_result"] = result

        # Schedule next occurrence if repeating
        if post["repeat"] != "none":
            dt = datetime.fromisoformat(post["scheduled_at"])
            delta = timedelta(days=1) if post["repeat"] == "daily" else timedelta(weeks=1)
            next_dt = dt + delta

            new_post = {
                **post,
                "post_id": str(uuid.uuid4()),
                "scheduled_at": next_dt.isoformat(),
                "status": "scheduled",
                "publish_result": None,
                "created_at": datetime.utcnow().isoformat(),
            }
            user_posts[new_post["post_id"]] = new_post

    def get_stats(self, user_id: str) -> dict:
        """
        Get scheduling statistics for a user.

        Returns:
            {total_scheduled, published, pending, failed}
        """
        user_posts = self._posts.get(user_id, {})

        published = 0
        pending = 0
        failed = 0

        for post in user_posts.values():
            if post["status"] == "published":
                published += 1
            elif post["status"] == "failed":
                failed += 1
            else:
                pending += 1

        return {
            "total_scheduled": len(user_posts),
            "published": published,
            "pending": pending,
            "failed": failed,
        }
