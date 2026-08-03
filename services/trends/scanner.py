#!/usr/bin/env python3
"""
Trend Scanner — Background-scanned, cached trending content.

Architecture:
- Background cron runs every 10 minutes → writes to cache
- API serves cached data instantly (no waiting)
- Admin can force rescan via /trending/scan
- All users get cached data via /trending/cached

Cache: /tmp/trend_cache/latest.json — single consolidated file
"""

import json
import os
import subprocess
import threading
import time
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta
from pathlib import Path

import httpx

_REDDIT_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
_CACHE_DIR = Path("/tmp/trend_cache")
_CACHE_FILE = _CACHE_DIR / "latest.json"
_SCAN_INTERVAL = 600  # 10 minutes


class TrendScanner:
    """Trending content scanner with background caching."""

    def __init__(self, youtube_api_key: str = ""):
        self.youtube_api_key = youtube_api_key or os.getenv("YOUTUBE_API_KEY", "")
        _CACHE_DIR.mkdir(parents=True, exist_ok=True)
        self._bg_thread: threading.Thread | None = None
        self._last_scan: float = 0

    # ── PUBLIC API ────────────────────────────────────────

    def get_cached(self) -> dict:
        """Return cached results instantly. Returns empty if no cache."""
        if _CACHE_FILE.exists():
            try:
                data = json.loads(_CACHE_FILE.read_text())
                return data
            except Exception:
                pass
        return self._empty_result()

    def scan_now(self, niche: str = "", region: str = "ID") -> dict:
        """Force a fresh scan and update cache."""
        result = self._do_scan(niche, region)
        self._write_cache(result)
        self._last_scan = time.time()
        return result

    def scan_all(self, niche: str = "", region: str = "ID") -> dict:
        """Alias of scan_now — full scan of all sources (youtube/google/reddit/tiktok)."""
        return self.scan_now(niche, region)

    def start_background_scan(self) -> None:
        """Start background scanner thread (called once at startup)."""
        if self._bg_thread and self._bg_thread.is_alive():
            return

        def _loop():
            while True:
                try:
                    print(f"[TrendScanner] Background scan starting at {datetime.now().isoformat()}")
                    result = self._do_scan()
                    self._write_cache(result)
                    self._last_scan = time.time()
                    total = result.get("total_topics", 0)
                    print(f"[TrendScanner] Scan complete: {total} topics cached")
                except Exception as e:
                    print(f"[TrendScanner] Background scan error: {e}")
                time.sleep(_SCAN_INTERVAL)

        self._bg_thread = threading.Thread(target=_loop, daemon=True, name="trend-scanner")
        self._bg_thread.start()
        print(f"[TrendScanner] Background scanner started (interval: {_SCAN_INTERVAL}s)")

    def get_status(self) -> dict:
        """Get scanner status and cache info."""
        cache_info = {}
        if _CACHE_FILE.exists():
            try:
                data = json.loads(_CACHE_FILE.read_text())
                cache_info = {
                    "cached_at": data.get("cached_at"),
                    "total_topics": data.get("total_topics", 0),
                    "sources": {
                        "youtube": len(data.get("youtube", [])),
                        "google": len(data.get("google", [])),
                        "reddit": len(data.get("reddit", [])),
                        "tiktok": len(data.get("tiktok", [])),
                    },
                }
            except Exception:
                cache_info = {"error": "corrupted cache"}

        return {
            "background_active": self._bg_thread is not None and self._bg_thread.is_alive(),
            "last_scan": datetime.fromtimestamp(self._last_scan).isoformat() if self._last_scan else None,
            "scan_interval_seconds": _SCAN_INTERVAL,
            "cache": cache_info,
        }

    # ── INTERNAL SCAN ─────────────────────────────────────

    def _do_scan(self, niche: str = "", region: str = "ID") -> dict:
        """Run all scanners in parallel."""
        results: dict = {
            "youtube": [], "google": [], "reddit": [], "tiktok": [],
            "total_topics": 0, "cached_at": None, "scanned_at": datetime.now().isoformat(),
        }

        with ThreadPoolExecutor(max_workers=4) as executor:
            futures = {
                executor.submit(self._scan_youtube, niche, region): "youtube",
                executor.submit(self._scan_google, niche, region): "google",
                executor.submit(self._scan_reddit): "reddit",
                executor.submit(self._scan_tiktok): "tiktok",
            }
            for future in as_completed(futures):
                key = futures[future]
                try:
                    results[key] = future.result()
                except Exception as e:
                    print(f"[TrendScanner] {key} failed: {e}")
                    results[key] = []

        results["total_topics"] = sum(len(v) for v in results.values() if isinstance(v, list))
        return results

    def _write_cache(self, data: dict) -> None:
        """Write consolidated cache file."""
        data["cached_at"] = datetime.now().isoformat()
        _CACHE_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2))

    def _empty_result(self) -> dict:
        return {"youtube": [], "google": [], "reddit": [], "tiktok": [], "total_topics": 0, "cached_at": None}

    # ── SCANNERS ──────────────────────────────────────────

    def _scan_youtube(self, niche: str, region: str) -> list[dict]:
        """YouTube trending via yt-dlp search."""
        try:
            terms = ["trending today", "viral video today", "most popular this week"]
            all_videos = []
            for term in terms:
                cmd = ["yt-dlp", "--flat-playlist", "--dump-json", f"ytsearch10:{term}", "--no-download", "--ignore-errors"]
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
                                "duration": v.get("duration", 0),
                                "source": "youtube",
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

            # Filter by niche if provided
            if niche:
                keywords = [kw.strip().lower() for kw in niche.split(",") if kw.strip()]
                unique = [v for v in unique if any(kw in v["title"].lower() for kw in keywords)]

            return unique[:20]
        except Exception as e:
            print(f"[TrendScanner] YouTube failed: {e}")
            return []

    def _scan_google(self, niche: str, region: str) -> list[dict]:
        """Google Trends via RSS."""
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

                topics.append({
                    "title": title,
                    "traffic": traffic,
                    "description": description[:300],
                    "source": "google_trends",
                })

            if niche:
                keywords = [kw.strip().lower() for kw in niche.split(",") if kw.strip()]
                topics = [t for t in topics if any(kw in t["title"].lower() for kw in keywords)]

            return topics
        except Exception as e:
            print(f"[TrendScanner] Google Trends failed: {e}")
            return []

    def _scan_reddit(self) -> list[dict]:
        """Reddit hot posts."""
        for ua in [_REDDIT_UA, "android:com.example.app:v1.0.0 (by /u/testuser)"]:
            try:
                url = "https://old.reddit.com/r/all/hot.json?limit=20"
                resp = httpx.get(url, headers={"User-Agent": ua}, timeout=30, follow_redirects=True)
                if resp.status_code == 200:
                    data = resp.json()
                    return [{
                        "title": d.get("title", ""),
                        "score": d.get("score", 0),
                        "comments": d.get("num_comments", 0),
                        "subreddit": d.get("subreddit", ""),
                        "url": d.get("url", ""),
                        "source": "reddit",
                    } for d in (c.get("data", {}) for c in data.get("data", {}).get("children", []))]
            except Exception:
                continue
        return []

    def _scan_tiktok(self) -> list[dict]:
        """TikTok trending (best effort)."""
        try:
            url = "https://www.tiktok.com/discover?lang=en"
            resp = httpx.get(url, headers={"User-Agent": _REDDIT_UA}, timeout=15, follow_redirects=True)
            import re
            pattern = re.compile(r'"name":"([^"]+)".*?"viewCount":(\d+)')
            matches = pattern.findall(resp.text)
            return [{
                "title": name,
                "views": int(views) if views.isdigit() else 0,
                "url": f"https://www.tiktok.com/tag/{name.replace('#', '').replace(' ', '')}",
                "source": "tiktok",
            } for name, views in matches[:20]]
        except Exception:
            return []


# Singleton
_scanner: TrendScanner | None = None


def get_scanner() -> TrendScanner:
    global _scanner
    if _scanner is None:
        _scanner = TrendScanner()
    return _scanner


def start_background_scanner() -> None:
    """Start the background scanner (call once at API startup)."""
    get_scanner().start_background_scan()


# CLI
if __name__ == "__main__":
    import sys
    scanner = TrendScanner()
    if "--bg" in sys.argv:
        scanner.start_background_scan()
        while True:
            time.sleep(60)
    else:
        result = scanner.scan_now()
        print(json.dumps(result, indent=2, default=str))
