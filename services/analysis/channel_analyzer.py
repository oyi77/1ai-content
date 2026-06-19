#!/usr/bin/env python3
"""
Channel Analyzer — YouTube/TikTok channel analysis and content strategy.

Analyzes:
- Channel performance (views, subscribers, engagement)
- Video content (titles, thumbnails, descriptions)
- Competitor benchmarking
- Content gap analysis
- Strategy recommendations

Uses yt-dlp for data extraction + LLM for analysis.
"""

import json
import subprocess
import os
import re
from pathlib import Path
from typing import Optional
from collections import Counter
from datetime import datetime


class ChannelAnalyzer:
    """Analyze YouTube/TikTok channels and generate content strategies."""

    def __init__(self, ytdlp_path: str = "yt-dlp"):
        self.ytdlp = ytdlp_path

    # ── DATA EXTRACTION ───────────────────────────────────────────

    def get_channel_info(self, channel_url: str) -> dict:
        """Get channel metadata (name, subscribers, description)."""
        cmd = [
            self.ytdlp, "--dump-json", "--playlist-items", "0",
            "--no-download", channel_url
        ]
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            if result.returncode == 0 and result.stdout.strip():
                return json.loads(result.stdout.strip().split("\n")[0])
        except Exception as e:
            pass

        # Fallback: extract from channel page
        cmd = [self.ytdlp, "--dump-json", "--no-download", f"{channel_url}/videos"]
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
            if result.returncode == 0:
                lines = result.stdout.strip().split("\n")
                if lines and lines[0]:
                    return json.loads(lines[0])
        except Exception:
            pass

        return {"error": "Could not fetch channel info"}

    def get_channel_videos(self, channel_url: str, limit: int = 50) -> list[dict]:
        """Get list of videos from channel with metadata."""
        cmd = [
            self.ytdlp, "--flat-playlist", "--dump-json",
            "--playlist-items", f"1:{limit}",
            "--no-download", f"{channel_url}/videos"
        ]
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
            if result.returncode == 0:
                videos = []
                for line in result.stdout.strip().split("\n"):
                    if line.strip():
                        try:
                            v = json.loads(line)
                            videos.append({
                                "id": v.get("id", ""),
                                "title": v.get("title", ""),
                                "url": v.get("url", ""),
                                "duration": v.get("duration", 0),
                                "view_count": v.get("view_count", 0),
                                "like_count": v.get("like_count", 0),
                                "upload_date": v.get("upload_date", ""),
                                "description": v.get("description", "")[:200],
                                "thumbnail": v.get("thumbnail", ""),
                            })
                        except json.JSONDecodeError:
                            continue
                return videos
        except Exception:
            pass
        return []

    def get_video_transcript(self, video_url: str) -> str:
        """Get video transcript/subtitles."""
        cmd = [
            self.ytdlp, "--write-auto-sub", "--sub-lang", "en",
            "--skip-download", "--sub-format", "vtt",
            "-o", "/tmp/transcript_%(id)s",
            video_url
        ]
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            # Find the generated subtitle file
            import glob
            sub_files = glob.glob("/tmp/transcript_*.vtt")
            if sub_files:
                with open(sub_files[0], "r") as f:
                    content = f.read()
                # Clean VTT format
                lines = []
                for line in content.split("\n"):
                    if line.strip() and not line.startswith("WEBVTT") and "-->" not in line and not line.strip().isdigit():
                        lines.append(line.strip())
                # Remove duplicates
                seen = set()
                clean_lines = []
                for line in lines:
                    if line not in seen:
                        seen.add(line)
                        clean_lines.append(line)
                # Cleanup
                for f in sub_files:
                    os.remove(f)
                return " ".join(clean_lines)
        except Exception:
            pass
        return ""

    # ── ANALYSIS ───────────────────────────────────────────────────

    def analyze_performance(self, videos: list[dict]) -> dict:
        """Analyze channel performance metrics."""
        if not videos:
            return {"error": "No videos to analyze"}

        views = [v.get("view_count", 0) or 0 for v in videos]
        likes = [v.get("like_count", 0) or 0 for v in videos]
        durations = [v.get("duration", 0) or 0 for v in videos]

        total_views = sum(views)
        avg_views = total_views / len(views) if views else 0
        max_views = max(views) if views else 0
        min_views = min(views) if views else 0

        # Find best/worst performers
        sorted_by_views = sorted(videos, key=lambda v: v.get("view_count", 0) or 0, reverse=True)
        top_5 = sorted_by_views[:5]
        bottom_5 = sorted_by_views[-5:]

        # Engagement rate
        total_likes = sum(likes)
        engagement_rate = (total_likes / total_views * 100) if total_views > 0 else 0

        # Duration analysis
        avg_duration = sum(durations) / len(durations) if durations else 0

        # Upload frequency
        dates = [v.get("upload_date", "") for v in videos if v.get("upload_date")]
        upload_frequency = "unknown"
        if len(dates) >= 2:
            dates_sorted = sorted(dates)
            days_between = []
            for i in range(1, len(dates_sorted)):
                try:
                    d1 = datetime.strptime(dates_sorted[i-1], "%Y%m%d")
                    d2 = datetime.strptime(dates_sorted[i], "%Y%m%d")
                    days_between.append((d2 - d1).days)
                except ValueError:
                    continue
            if days_between:
                avg_days = sum(days_between) / len(days_between)
                if avg_days <= 1:
                    upload_frequency = "daily"
                elif avg_days <= 3:
                    upload_frequency = "every 2-3 days"
                elif avg_days <= 7:
                    upload_frequency = "weekly"
                else:
                    upload_frequency = f"every {avg_days:.0f} days"

        return {
            "total_videos": len(videos),
            "total_views": total_views,
            "avg_views": int(avg_views),
            "max_views": max_views,
            "min_views": min_views,
            "total_likes": total_likes,
            "engagement_rate": round(engagement_rate, 2),
            "avg_duration_seconds": int(avg_duration),
            "upload_frequency": upload_frequency,
            "top_5_videos": [{"title": v["title"], "views": v.get("view_count", 0)} for v in top_5],
            "bottom_5_videos": [{"title": v["title"], "views": v.get("view_count", 0)} for v in bottom_5],
        }

    def analyze_content(self, videos: list[dict]) -> dict:
        """Analyze content patterns (titles, topics, formats)."""
        if not videos:
            return {"error": "No videos to analyze"}

        # Title analysis
        titles = [v.get("title", "") for v in videos]
        words = []
        for title in titles:
            words.extend(title.lower().split())
        word_freq = Counter(words).most_common(20)

        # Title length analysis
        title_lengths = [len(t) for t in titles]
        avg_title_length = sum(title_lengths) / len(title_lengths) if title_lengths else 0

        # Find common patterns
        patterns = {
            "how_to": sum(1 for t in titles if "how to" in t.lower()),
            "numbered": sum(1 for t in titles if re.search(r'\d+', t)),
            "question": sum(1 for t in titles if "?" in t),
            "exclamation": sum(1 for t in titles if "!" in t),
            "emoji": sum(1 for t in titles if any(ord(c) > 127 for c in t)),
        }

        # Duration patterns
        durations = [v.get("duration", 0) or 0 for v in videos]
        short_vids = sum(1 for d in durations if d < 60)
        medium_vids = sum(1 for d in durations if 60 <= d < 300)
        long_vids = sum(1 for d in durations if d >= 300)

        return {
            "total_titles": len(titles),
            "avg_title_length": int(avg_title_length),
            "top_words": word_freq,
            "title_patterns": patterns,
            "duration_distribution": {
                "short (<1min)": short_vids,
                "medium (1-5min)": medium_vids,
                "long (5min+)": long_vids,
            },
            "sample_titles": titles[:10],
        }

    def analyze_thumbnails(self, videos: list[dict]) -> dict:
        """Analyze thumbnail patterns."""
        thumbnails = [v.get("thumbnail", "") for v in videos if v.get("thumbnail")]

        return {
            "total_thumbnails": len(thumbnails),
            "sample_urls": thumbnails[:5],
            "note": "Thumbnail visual analysis requires Vision AI (Gemini)"
        }

    def generate_strategy(self, performance: dict, content: dict, niche: str = "") -> dict:
        """Generate content strategy recommendations based on analysis."""
        recommendations = []

        # View-based recommendations
        avg_views = performance.get("avg_views", 0)
        if avg_views < 1000:
            recommendations.append({
                "priority": "HIGH",
                "area": "Visibility",
                "suggestion": "Focus on SEO: use trending keywords in titles, add hashtags"
            })
        if avg_views > 10000:
            recommendations.append({
                "priority": "MEDIUM",
                "area": "Growth",
                "suggestion": "You have traction! Consider posting more frequently"
            })

        # Engagement recommendations
        engagement = performance.get("engagement_rate", 0)
        if engagement < 2:
            recommendations.append({
                "priority": "HIGH",
                "area": "Engagement",
                "suggestion": "Low engagement! Add CTAs (like, subscribe, comment) in videos"
            })
        if engagement > 5:
            recommendations.append({
                "priority": "LOW",
                "area": "Retention",
                "suggestion": "Great engagement! Focus on consistency"
            })

        # Duration recommendations
        avg_duration = performance.get("avg_duration_seconds", 0)
        if avg_duration < 60:
            recommendations.append({
                "priority": "MEDIUM",
                "area": "Content Depth",
                "suggestion": "Consider longer videos (3-10min) for better ad revenue"
            })
        if avg_duration > 600:
            recommendations.append({
                "priority": "MEDIUM",
                "area": "Retention",
                "suggestion": "Long videos risk viewer drop. Consider breaking into series"
            })

        # Upload frequency
        freq = performance.get("upload_frequency", "unknown")
        if freq == "weekly" or freq.startswith("every"):
            recommendations.append({
                "priority": "MEDIUM",
                "area": "Consistency",
                "suggestion": f"Current frequency: {freq}. Aim for 3-5 videos/week for growth"
            })

        # Content patterns
        patterns = content.get("title_patterns", {})
        if patterns.get("how_to", 0) == 0:
            recommendations.append({
                "priority": "MEDIUM",
                "area": "Content Types",
                "suggestion": "Add 'How To' format — high search intent, evergreen"
            })
        if patterns.get("numbered", 0) == 0:
            recommendations.append({
                "priority": "LOW",
                "area": "Title Optimization",
                "suggestion": "Use numbered titles (Top 5, 10 Tips) — higher CTR"
            })

        # Top performing content
        top = performance.get("top_5_videos", [])
        if top:
            recommendations.append({
                "priority": "HIGH",
                "area": "Double Down",
                "suggestion": f"Create more content like: '{top[0]['title']}' ({top[0]['views']:,} views)"
            })

        return {
            "niche": niche,
            "recommendations": recommendations,
            "content_calendar_suggestion": {
                "monday": "Educational/How-to content",
                "tuesday": "Trending topic response",
                "wednesday": "Behind the scenes / vlog",
                "thursday": "Listicle / Top N",
                "friday": "Entertainment / challenge",
                "weekend": "Compilation / best of",
            },
        }

    # ── FULL ANALYSIS ──────────────────────────────────────────────

    def analyze_channel(self, channel_url: str, niche: str = "", limit: int = 50) -> dict:
        """Full channel analysis pipeline."""
        print(f"🔍 Analyzing channel: {channel_url}")

        # Step 1: Get channel info
        print("  📊 Fetching channel info...")
        channel_info = self.get_channel_info(channel_url)

        # Step 2: Get videos
        print(f"  🎬 Fetching top {limit} videos...")
        videos = self.get_channel_videos(channel_url, limit)
        print(f"  Found {len(videos)} videos")

        if not videos:
            return {
                "success": False,
                "error": "No videos found",
                "channel_info": channel_info,
            }

        # Step 3: Analyze performance
        print("  📈 Analyzing performance...")
        performance = self.analyze_performance(videos)

        # Step 4: Analyze content
        print("  📝 Analyzing content patterns...")
        content = self.analyze_content(videos)

        # Step 5: Generate strategy
        print("  🎯 Generating strategy...")
        strategy = self.generate_strategy(performance, content, niche)

        return {
            "success": True,
            "channel_url": channel_url,
            "channel_info": {
                "name": channel_info.get("channel", channel_info.get("uploader", "Unknown")),
                "subscribers": channel_info.get("channel_follower_count", 0),
                "description": (channel_info.get("description", "") or "")[:300],
            },
            "performance": performance,
            "content_analysis": content,
            "strategy": strategy,
        }

    def compare_channels(self, channel_urls: list[str], niche: str = "") -> dict:
        """Compare multiple channels side by side."""
        analyses = []
        for url in channel_urls:
            result = self.analyze_channel(url, niche, limit=30)
            analyses.append(result)

        # Find best performer
        best = max(analyses, key=lambda a: a.get("performance", {}).get("avg_views", 0))

        return {
            "success": True,
            "channels": analyses,
            "best_performer": best.get("channel_info", {}).get("name", "Unknown"),
            "comparison_summary": {
                "highest_avg_views": best.get("performance", {}).get("avg_views", 0),
                "total_videos_analyzed": sum(a.get("performance", {}).get("total_videos", 0) for a in analyses),
            },
        }


# CLI entry point
if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python channel_analyzer.py <channel_url> [niche]")
        sys.exit(1)

    channel = sys.argv[1]
    niche = sys.argv[2] if len(sys.argv) > 2 else ""

    analyzer = ChannelAnalyzer()
    result = analyzer.analyze_channel(channel, niche)
    print(json.dumps(result, indent=2, default=str))
