#!/usr/bin/env python3
"""
Trend Scanner — Multi-platform trending content discovery with 24h caching.

Scans:
- YouTube trending (via YouTube Data API or yt-dlp search)
- Google Trends (via RSS feed)
- Reddit hot posts (via old.reddit.com JSON API)
- TikTok trending (via web scraping fallback)

Caches results for 24 hours to avoid hitting rate limits.
"""

import json
import os
import subprocess
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta
from pathlib import Path

import httpx

_REDDIT_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

# Cache directory
_CACHE_DIR = Path("/tmp/trend_cache")


class TrendScanner:
    """Scan trending content across YouTube, Google Trends, and Reddit with 24h caching."""

    def __init__(self, youtube_api_key: str = ""):
        self.youtube_api_key = youtube_api_key or os.getenv("YOUTUBE_API_KEY", "")
        _CACHE_DIR.mkdir(parents=True, exist_ok=True)

    # ── CACHE ──────────────────────────────────────────────

    def _get_cache(self, key: str) -> dict | None:
        """Get cached result if less than 24h old."""
        cache_file = _CACHE_DIR / f"{key}.json"
        if not cache_file.exists():
            return None
        try:
            data = json.loads(cache_file.read_text())
            cached_at = datetime.fromisoformat(data.get("cached_at", "2000-01-01"))
            if datetime.now() - cached_at > timedelta(hours=24):
                return None
            return data.get("results")
        except Exception:
            return None

    def _set_cache(self, key: str, results: list) -> None:
        """Cache results with timestamp."""
        cache_file = _CACHE_DIR / f"{key}.json"
        cache_file.write_text(json.dumps({
            "cached_at": datetime.now().isoformat(),
            "count": len(results),
            "results": results,
        }, ensure_ascii=False, indent=2))

    # ── YOUTUBE TRENDING ──────────────────────────────────

    def scan_youtube_trending(self, niche: str = "", region: str = "ID", max_results: int = 20) -> list[dict]:
        """Fetch YouTube trending videos.

        Tries YouTube Data API first, falls back to yt-dlp search.
        Caches results for 24h.
        """
        cache_key = f"youtube_{region}_{niche}"
        cached = self._get_cache(cache_key)
        if cached is not None:
            return cached[:max_results]

        videos = []

        # Method 1: YouTube Data API (if key available)
        if self.youtube_api_key:
            videos = self._youtube_api_trending(region, max_results)

        # Method 2: yt-dlp search for trending keywords
        if not videos:
            videos = self._yt_dlp_trending(region, max_results)

        # Method 3: Scrape trending page via httpx
        if not videos:
            videos = self._scrape_youtube_trending(region, max_results)

        # Filter by niche
        if niche and videos:
            keywords = [kw.strip().lower() for kw in niche.split(",") if kw.strip()]
            videos = [
                v for v in videos
                if any(kw in v.get("title", "").lower() for kw in keywords)
            ]

        if videos:
            self._set_cache(cache_key, videos)

        return videos[:max_results]

    def _youtube_api_trending(self, region: str, max_results: int) -> list[dict]:
        """Fetch trending via YouTube Data API v3."""
        try:
            url = "https://www.googleapis.com/youtube/v3/videos"
            params = {
                "part": "snippet,statistics,contentDetails",
                "chart": "mostPopular",
                "regionCode": region,
                "maxResults": min(max_results, 50),
                "key": self.youtube_api_key,
            }
            resp = httpx.get(url, params=params, timeout=30)
            resp.raise_for_status()
            data = resp.json()

            videos = []
            for item in data.get("items", []):
                snippet = item.get("snippet", {})
                stats = item.get("statistics", {})
                videos.append({
                    "title": snippet.get("title", ""),
                    "channel": snippet.get("channelTitle", ""),
                    "views": int(stats.get("viewCount", 0)),
                    "likes": int(stats.get("likeCount", 0)),
                    "url": f"https://youtube.com/watch?v={item['id']}",
                    "description": (snippet.get("description", "") or "")[:300],
                    "thumbnail": snippet.get("thumbnails", {}).get("high", {}).get("url", ""),
                    "published_at": snippet.get("publishedAt", ""),
                    "source": "youtube_api",
                })
            return videos
        except Exception as e:
            print(f"⚠️ YouTube API trending failed: {e}")
            return []

    def _yt_dlp_trending(self, region: str, max_results: int) -> list[dict]:
        """Fetch trending via yt-dlp search for popular keywords."""
        try:
            # Use yt-dlp to search for recently popular content
            search_terms = [
                "trending today",
                "viral video today",
                "most popular this week",
            ]
            all_videos = []
            for term in search_terms:
                cmd = [
                    "yt-dlp", "--flat-playlist", "--dump-json",
                    f"ytsearch{max_results}:{term}",
                    "--no-download",
                    "--ignore-errors",
                ]
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
                if result.returncode == 0:
                    for line in result.stdout.strip().split("\n"):
                        if not line.strip():
                            continue
                        try:
                            v = json.loads(line)
                            all_videos.append({
                                "title": v.get("title", ""),
                                "channel": v.get("channel", v.get("uploader", "")),
                                "views": v.get("view_count", 0) or 0,
                                "url": v.get("url", v.get("webpage_url", "")),
                                "description": (v.get("description", "") or "")[:300],
                                "duration": v.get("duration", 0),
                                "source": "yt_dlp_search",
                            })
                        except json.JSONDecodeError:
                            continue

            # Deduplicate by title
            seen = set()
            unique = []
            for v in all_videos:
                key = v["title"][:50].lower()
                if key not in seen:
                    seen.add(key)
                    unique.append(v)

            return unique
        except Exception as e:
            print(f"⚠️ yt-dlp trending search failed: {e}")
            return []

    def _scrape_youtube_trending(self, region: str, max_results: int) -> list[dict]:
        """Scrape YouTube trending page as last resort."""
        try:
            # Try YouTube trending RSS/Atom feed
            url = f"https://www.youtube.com/feeds/videos.xml?chart=mostPopular&region={region}"
            resp = httpx.get(url, timeout=15, follow_redirects=True)
            if resp.status_code != 200:
                return []

            root = ET.fromstring(resp.text)
            ns = {"atom": "http://www.w3.org/2005/Atom", "media": "http://search.yahoo.com/mrss/"}
            videos = []
            for entry in root.findall("atom:entry", ns):
                title = entry.find("atom:title", ns)
                video_id = entry.find("atom:id", ns)
                author = entry.find("atom:author/atom:name", ns)
                published = entry.find("atom:published", ns)
                desc = entry.find("media:group/media:description", ns)

                vid = (video_id.text or "").split(":")[-1] if video_id is not None else ""
                videos.append({
                    "title": title.text if title is not None else "",
                    "channel": author.text if author is not None else "",
                    "url": f"https://youtube.com/watch?v={vid}" if vid else "",
                    "description": (desc.text or "")[:300] if desc is not None else "",
                    "published_at": published.text if published is not None else "",
                    "source": "youtube_rss",
                })

            return videos[:max_results]
        except Exception as e:
            print(f"⚠️ YouTube RSS trending failed: {e}")
            return []

    # ── GOOGLE TRENDS ─────────────────────────────────────

    def scan_google_trends(self, niche: str = "", region: str = "ID") -> list[dict]:
        """Fetch Google Trends via RSS feed with 24h cache."""
        cache_key = f"google_{region}_{niche}"
        cached = self._get_cache(cache_key)
        if cached is not None:
            return cached

        try:
            url = f"https://trends.google.com/trending/rss?geo={region}"
            resp = httpx.get(url, timeout=30, follow_redirects=True)
            resp.raise_for_status()

            root = ET.fromstring(resp.text)
            topics = []

            for item in root.findall(".//item"):
                title_el = item.find("title")
                title = title_el.text if title_el is not None and title_el.text else ""

                traffic_el = item.find("{http://www.google.com/trends/2010}approx_traffic")
                traffic = traffic_el.text if traffic_el is not None and traffic_el.text else ""

                desc_el = item.find("description")
                description = desc_el.text if desc_el is not None and desc_el.text else ""

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
                    "source": "google_trends",
                })

            if niche:
                keywords = [kw.strip().lower() for kw in niche.split(",") if kw.strip()]
                topics = [
                    t for t in topics
                    if any(kw in t["title"].lower() or kw in t.get("description", "").lower() for kw in keywords)
                ]

            if topics:
                self._set_cache(cache_key, topics)

            return topics

        except Exception as e:
            print(f"⚠️ Google Trends scan failed: {e}")
            return []

    # ── REDDIT TRENDING ───────────────────────────────────

    def scan_reddit_trending(self, subreddit: str = "all", limit: int = 20) -> list[dict]:
        """Fetch hot posts from Reddit with 24h cache."""
        cache_key = f"reddit_{subreddit}"
        cached = self._get_cache(cache_key)
        if cached is not None:
            return cached[:limit]

        posts = []

        # Method 1: old.reddit.com
        try:
            url = f"https://old.reddit.com/r/{subreddit}/hot.json?limit={limit}"
            headers = {"User-Agent": _REDDIT_UA}
            resp = httpx.get(url, headers=headers, timeout=30, follow_redirects=True)
            resp.raise_for_status()
            data = resp.json()

            for child in data.get("data", {}).get("children", []):
                d = child.get("data", {})
                posts.append({
                    "title": d.get("title", ""),
                    "score": d.get("score", 0),
                    "comments": d.get("num_comments", 0),
                    "subreddit": d.get("subreddit", subreddit),
                    "url": d.get("url", ""),
                    "source": "reddit",
                })
        except Exception as e:
            print(f"⚠️ Reddit old.reddit.com failed: {e}")

        # Method 2: www.reddit.com with different UA
        if not posts:
            try:
                url = f"https://www.reddit.com/r/{subreddit}/hot.json?limit={limit}&raw_json=1"
                headers = {"User-Agent": "android:com.example.app:v1.0.0 (by /u/testuser)"}
                resp = httpx.get(url, headers=headers, timeout=30, follow_redirects=True)
                if resp.status_code == 200:
                    data = resp.json()
                    for child in data.get("data", {}).get("children", []):
                        d = child.get("data", {})
                        posts.append({
                            "title": d.get("title", ""),
                            "score": d.get("score", 0),
                            "comments": d.get("num_comments", 0),
                            "subreddit": d.get("subreddit", subreddit),
                            "url": d.get("url", ""),
                            "source": "reddit",
                        })
            except Exception as e:
                print(f"⚠️ Reddit www fallback failed: {e}")

        if posts:
            self._set_cache(cache_key, posts)

        return posts[:limit]

    # ── TIKTOK TRENDING (via hashtags) ────────────────────

    def scan_tiktok_trending(self, region: str = "ID", max_results: int = 20) -> list[dict]:
        """Scan TikTok trending hashtags via web scraping."""
        cache_key = f"tiktok_{region}"
        cached = self._get_cache(cache_key)
        if cached is not None:
            return cached[:max_results]

        try:
            # Use TikTok's public trending page
            url = "https://www.tiktok.com/discover?lang=en"
            headers = {
                "User-Agent": _REDDIT_UA,
                "Accept": "text/html,application/xhtml+xml",
            }
            resp = httpx.get(url, headers=headers, timeout=15, follow_redirects=True)

            # Try to extract trending hashtags from the page
            # This is a best-effort approach
            topics = []
            import re
            hashtag_pattern = re.compile(r'"name":"([^"]+)".*?"viewCount":(\d+)')
            matches = hashtag_pattern.findall(resp.text)
            for name, views in matches[:max_results]:
                if name.startswith("#") or name.replace(" ", "").isalnum():
                    topics.append({
                        "title": name,
                        "views": int(views) if views.isdigit() else 0,
                        "url": f"https://www.tiktok.com/tag/{name.replace('#', '').replace(' ', '')}",
                        "source": "tiktok",
                    })

            if topics:
                self._set_cache(cache_key, topics)

            return topics
        except Exception as e:
            print(f"⚠️ TikTok trending scan failed: {e}")
            return []

    # ── PARALLEL SCAN ALL ──────────────────────────────────

    def scan_all(self, niche: str = "", region: str = "ID") -> dict:
        """Run all scanners in parallel with 24h caching."""
        results: dict = {
            "youtube": [], "google": [], "reddit": [], "tiktok": [],
            "total_topics": 0, "cached_at": None,
        }

        with ThreadPoolExecutor(max_workers=4) as executor:
            futures = {
                executor.submit(self.scan_youtube_trending, niche, region): "youtube",
                executor.submit(self.scan_google_trends, niche, region): "google",
                executor.submit(self.scan_reddit_trending, "all", 20): "reddit",
                executor.submit(self.scan_tiktok_trending, region): "tiktok",
            }
            for future in as_completed(futures):
                key = futures[future]
                try:
                    results[key] = future.result()
                except Exception as e:
                    print(f"⚠️ {key} scan failed: {e}")
                    results[key] = []

        results["total_topics"] = sum(len(v) for v in results.values() if isinstance(v, list))
        results["cached_at"] = datetime.now().isoformat()
        return results

    def get_cache_status(self) -> dict:
        """Check what's cached and when it expires."""
        status = {}
        for f in _CACHE_DIR.glob("*.json"):
            try:
                data = json.loads(f.read_text())
                cached_at = datetime.fromisoformat(data["cached_at"])
                expires_at = cached_at + timedelta(hours=24)
                status[f.stem] = {
                    "count": data.get("count", 0),
                    "cached_at": data["cached_at"],
                    "expires_at": expires_at.isoformat(),
                    "is_fresh": datetime.now() < expires_at,
                }
            except Exception:
                pass
        return status


# CLI entry point
if __name__ == "__main__":
    import sys

    niche = sys.argv[1] if len(sys.argv) > 1 else ""
    region = sys.argv[2] if len(sys.argv) > 2 else "ID"

    scanner = TrendScanner()
    result = scanner.scan_all(niche, region)
    print(json.dumps(result, indent=2, default=str))
