# Analytics Service
"""
Post-publish content performance tracking.

Tracks published posts across platforms and generates
aggregated analytics reports with engagement metrics.

Usage:
    from services.analytics.tracker import AnalyticsTracker
    tracker = AnalyticsTracker()
    tracker.track_post("user1", "tiktok", "https://...", content)
    report = tracker.get_report("user1", days=30)
"""
