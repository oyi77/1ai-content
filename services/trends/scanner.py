#!/usr/bin/env python3
"""
Trend Scanner — Multi-platform trending content discovery.

Scans:
- YouTube trending videos (via yt-dlp)
- Google Trends (via RSS feed)
- Reddit hot posts (via JSON API)

Uses ThreadPoolExecutor for parallel scanning across platforms.
"""
import json
import subprocess
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed

import httpx

_REDDIT_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"


class TrendScanner:
    """Scan trending content across YouTube, Google Trends, and Reddit."""

    def __init__(self):
        pass

    # ── YOUTUBE TRENDING ─────────────────────────────────────────

    def scan_youtube_trending(self, niche: str = "", region: str = "ID", max_results: int = 20) -> list[dict]:
        """Fetch YouTube trending videos via yt-dlp flat-playlist dump.

        Args:
            niche: Optional keyword filter (case-insensitive substring match on title).
            region: Country code (currently informational — YouTube trending is global).
            max_results: Maximum videos to return.

        Returns:
            List of {title, views, channel, duration, url, description}.
        """
        try:
            cmd = [
                "yt-dlp", "--flat-playlist", "--dump-json",
                "--playlist-items", f"1:{max_results * 2}",  # over-fetch for filtering
                "--no-download",
                "https://www.youtube.com/feed/trending",
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
            if result.returncode != 0:
                print(f"⚠️ yt-dlp trending failed: {result.stderr[:200]}")
                return []

            videos = []
            for line in result.stdout.strip().split("\n"):
                if not line.strip():
                    continue
                try:
                    v = json.loads(line)
                    videos.append({
                        "title": v.get("title", ""),
                        "views": v.get("view_count", 0),
                        "channel": v.get("channel", v.get("uploader", "")),
                        "duration": v.get("duration", 0),
                        "url": v.get("url", v.get("webpage_url", "")),
                        "description": (v.get("description", "") or "")[:300],
                    })
                except json.JSONDecodeError:
                    continue

            # Filter by niche if provided
            if niche:
                keywords = [kw.strip().lower() for kw in niche.split(",") if kw.strip()]
                videos = [
                    v for v in videos
                    if any(kw in v["title"].lower() for kw in keywords)
                ]

            return videos[:max_results]

        except Exception as e:
            print(f"⚠️ YouTube trending scan failed: {e}")
            return []

    # ── GOOGLE TRENDS ────────────────────────────────────────────

    def scan_google_trends(self, niche: str = "", region: str = "ID") -> list[dict]:
        """Fetch Google Trends via RSS feed.

        Args:
            niche: Optional keyword filter (case-insensitive substring match on title).
            region: Country geo code for Google Trends (e.g. 'ID', 'US', 'GB').

        Returns:
            List of {title, traffic, description, news_items}.
        """
        try:
            url = f"https://trends.google.com/trending/rss?geo={region}"
            resp = httpx.get(url, timeout=30, follow_redirects=True)
            resp.raise_for_status()

            root = ET.fromstring(resp.text)
            topics = []

            for item in root.findall(".//item"):
                title_el = item.find("title")
                title = title_el.text if title_el is not None and title_el.text else ""

                # Traffic approx-estimate count is in <ht:approx_traffic>
                traffic_el = item.find("{http://www.google.com/trends/2010}approx_traffic")
                traffic = traffic_el.text if traffic_el is not None and traffic_el.text else ""

                # Description / snippet
                desc_el = item.find("description")
                description = desc_el.text if desc_el is not None and desc_el.text else ""

                # News items nested inside <ht:news_item>
                news_items = []
                for news in item.findall("{http://www.google.com/trends/2010}news_item"):
                    news_title = news.find("{http://www.google.com/trends/2010}news_item_title")
                    news_url = news.find("{http://www.google.com/trends/2010}news_item_url")
                    if news_title is not None and news_title.text:
                        news_items.append({
                            "title": news_title.text,
                            "url": news_url.text if news_url is not None else "",
                        })

                topics.append({
                    "title": title,
                    "traffic": traffic,
                    "description": description[:300],
                    "news_items": news_items,
                })

            # Filter by niche if provided
            if niche:
                keywords = [kw.strip().lower() for kw in niche.split(",") if kw.strip()]
                topics = [
                    t for t in topics
                    if any(
                        kw in t["title"].lower() or kw in t["description"].lower()
                        for kw in keywords
                    )
                ]

            return topics

        except Exception as e:
            print(f"⚠️ Google Trends scan failed: {e}")
            return []

    # ── REDDIT TRENDING ──────────────────────────────────────────

    def scan_reddit_trending(self, subreddit: str = "all", limit: int = 20) -> list[dict]:
        """Fetch hot posts from a subreddit via Reddit JSON API.

        Args:
            subreddit: Subreddit name (without r/ prefix).
            limit: Number of posts to fetch.

        Returns:
            List of {title, score, comments, subreddit, url}.
        """
        try:
            url = f"https://www.reddit.com/r/{subreddit}/hot.json?limit={limit}"
            headers = {"User-Agent": _REDDIT_UA}
            resp = httpx.get(url, headers=headers, timeout=30, follow_redirects=True)
            resp.raise_for_status()
            data = resp.json()

            posts = []
            for child in data.get("data", {}).get("children", []):
                d = child.get("data", {})
                posts.append({
                    "title": d.get("title", ""),
                    "score": d.get("score", 0),
                    "comments": d.get("num_comments", 0),
                    "subreddit": d.get("subreddit", subreddit),
                    "url": d.get("url", ""),
                })

            return posts

        except Exception as e:
            print(f"⚠️ Reddit trending scan failed: {e}")
            return []

    # ── PARALLEL SCAN ALL ────────────────────────────────────────

    def scan_all(self, niche: str = "", region: str = "ID") -> dict:
        """Run all three scanners in parallel via ThreadPoolExecutor.

        Args:
            niche: Optional keyword filter passed to each scanner.
            region: Region code for YouTube and Google Trends.

        Returns:
            {youtube: [...], google: [...], reddit: [...], total_topics: N}
        """
        results: dict = {"youtube": [], "google": [], "reddit": [], "total_topics": 0}

        with ThreadPoolExecutor(max_workers=3) as executor:
            futures = {
                executor.submit(self.scan_youtube_trending, niche, region): "youtube",
                executor.submit(self.scan_google_trends, niche, region): "google",
                executor.submit(self.scan_reddit_trending, "all", 20): "reddit",
            }
            for future in as_completed(futures):
                key = futures[future]
                try:
                    results[key] = future.result()
                except Exception as e:
                    print(f"⚠️ {key} scan failed: {e}")
                    results[key] = []

        results["total_topics"] = (
            len(results["youtube"]) + len(results["google"]) + len(results["reddit"])
        )
        return results


# CLI entry point
if __name__ == "__main__":
    import sys

    niche = sys.argv[1] if len(sys.argv) > 1 else ""
    region = sys.argv[2] if len(sys.argv) > 2 else "ID"

    scanner = TrendScanner()
    result = scanner.scan_all(niche, region)
    print(json.dumps(result, indent=2, default=str))
