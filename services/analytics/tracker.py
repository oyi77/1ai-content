#!/usr/bin/env python3
"""
Analytics Tracker — Post-publish content performance tracking.

Stores published posts and their engagement metrics in memory,
generates aggregated reports by time period and platform.
"""

import uuid
from datetime import datetime, timedelta


class AnalyticsTracker:
    """Track content performance after publishing."""

    def __init__(self):
        self._posts: dict[str, dict] = {}

    def track_post(self, user_id: str, platform: str, post_url: str, content: dict) -> dict:
        """Store a published post for tracking.

        Args:
            user_id: Owner of the post.
            platform: Publishing platform (tiktok, youtube, instagram, etc.).
            post_url: URL of the published post.
            content: {title, description, hashtags, published_at}.

        Returns:
            {success, tracking_id}
        """
        tracking_id = uuid.uuid4().hex[:12]
        self._posts[tracking_id] = {
            "user_id": user_id,
            "platform": platform,
            "url": post_url,
            "title": content.get("title", ""),
            "description": content.get("description", ""),
            "hashtags": content.get("hashtags", []),
            "published_at": content.get("published_at", datetime.utcnow().isoformat()),
            "metrics": {
                "views": 0,
                "likes": 0,
                "comments": 0,
                "shares": 0,
                "engagement_rate": 0.0,
            },
        }
        return {"success": True, "tracking_id": tracking_id}

    def update_metrics(self, tracking_id: str, metrics: dict) -> dict:
        """Update metrics for a tracked post.

        Args:
            tracking_id: ID returned by track_post.
            metrics: {views, likes, comments, shares, engagement_rate}.
                     engagement_rate is recalculated automatically if omitted.

        Returns:
            {success, tracking_id, metrics}
        """
        post = self._posts.get(tracking_id)
        if not post:
            return {"success": False, "error": f"Tracking ID {tracking_id} not found"}

        for key in ("views", "likes", "comments", "shares"):
            if key in metrics:
                post["metrics"][key] = metrics[key]

        views = post["metrics"]["views"]
        if views > 0:
            post["metrics"]["engagement_rate"] = round(
                (post["metrics"]["likes"] + post["metrics"]["comments"] + post["metrics"]["shares"])
                / views
                * 100,
                2,
            )
        elif "engagement_rate" in metrics:
            post["metrics"]["engagement_rate"] = metrics["engagement_rate"]

        return {"success": True, "tracking_id": tracking_id, "metrics": dict(post["metrics"])}

    def get_report(self, user_id: str, days: int = 30) -> dict:
        """Generate analytics report for a user.

        Args:
            user_id: Owner to report on.
            days: Look-back window in days (default 30).

        Returns:
            {success, period_days, total_posts, total_views, total_likes,
             total_engagement, avg_engagement_rate, top_posts, by_platform}
        """
        cutoff = datetime.utcnow() - timedelta(days=days)
        user_posts = []
        for tid, post in self._posts.items():
            if post["user_id"] != user_id:
                continue
            try:
                pub = datetime.fromisoformat(post["published_at"])
            except (ValueError, TypeError):
                pub = datetime.utcnow()
            if pub >= cutoff:
                user_posts.append(post)

        total_views = sum(p["metrics"]["views"] for p in user_posts)
        total_likes = sum(p["metrics"]["likes"] for p in user_posts)
        total_comments = sum(p["metrics"]["comments"] for p in user_posts)
        total_shares = sum(p["metrics"]["shares"] for p in user_posts)
        total_engagement = total_likes + total_comments + total_shares
        avg_engagement_rate = round(total_engagement / total_views * 100, 2) if total_views > 0 else 0.0

        top_posts = sorted(user_posts, key=lambda p: p["metrics"]["engagement_rate"], reverse=True)[:5]
        top_posts_out = [
            {
                "title": p["title"],
                "platform": p["platform"],
                "views": p["metrics"]["views"],
                "engagement_rate": p["metrics"]["engagement_rate"],
            }
            for p in top_posts
        ]

        by_platform: dict[str, dict] = {}
        for p in user_posts:
            plat = p["platform"]
            if plat not in by_platform:
                by_platform[plat] = {"posts": 0, "views": 0, "engagement": 0}
            by_platform[plat]["posts"] += 1
            by_platform[plat]["views"] += p["metrics"]["views"]
            by_platform[plat]["engagement"] += (
                p["metrics"]["likes"] + p["metrics"]["comments"] + p["metrics"]["shares"]
            )

        return {
            "success": True,
            "period_days": days,
            "total_posts": len(user_posts),
            "total_views": total_views,
            "total_likes": total_likes,
            "total_engagement": total_engagement,
            "avg_engagement_rate": avg_engagement_rate,
            "top_posts": top_posts_out,
            "by_platform": by_platform,
        }

    def get_post_analytics(self, tracking_id: str) -> dict:
        """Get analytics for a specific post.

        Args:
            tracking_id: ID returned by track_post.

        Returns:
            {success, post: {title, platform, url, published_at, metrics}}
        """
        post = self._posts.get(tracking_id)
        if not post:
            return {"success": False, "error": f"Tracking ID {tracking_id} not found"}

        return {
            "success": True,
            "post": {
                "title": post["title"],
                "platform": post["platform"],
                "url": post["url"],
                "published_at": post["published_at"],
                "metrics": dict(post["metrics"]),
            },
        }
