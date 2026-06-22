#!/usr/bin/env python3
"""
Stock Footage Engine — Search and download royalty-free videos from Pexels and Openverse.

Supports:
- Pexels API (requires API key, better quality)
- Openverse API (no key needed, fallback)
- Portrait (9:16) and landscape (16:9) orientation
- Parallel downloads via ThreadPoolExecutor
- Automatic keyword fallback for zero-result queries

Usage:
    engine = StockEngine()
    results = engine.search_videos("nature sunset", orientation="portrait")
    engine.download_video(results[0]["url"], "output.mp4")
"""

import os
import re
import httpx
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Optional


class StockEngine:
    """Search and download royalty-free stock footage from Pexels and Openverse."""

    PEXELS_SEARCH_URL = "https://api.pexels.com/videos/search"
    OPENVERSE_SEARCH_URL = "https://api.openverse.org/v1/videos/"

    # Broader fallback keywords for common themes
    FALLBACK_MAP: dict[str, list[str]] = {
        "rain": ["rain", "weather", "nature"],
        "cafe": ["cafe", "coffee", "restaurant"],
        "cozy": ["cozy", "warm", "indoor"],
        "city": ["city", "urban", "skyline"],
        "ocean": ["ocean", "sea", "beach"],
        "forest": ["forest", "nature", "trees"],
        "sunset": ["sunset", "sky", "nature"],
        "night": ["night", "city night", "dark"],
        "money": ["money", "business", "office"],
        "tech": ["technology", "computer", "digital"],
    }

    def __init__(self, pexels_api_key: str = ""):
        self.pexels_api_key = pexels_api_key or os.getenv("PEXELS_API_KEY", "")
        self._client = httpx.Client(timeout=30.0)

    def search_videos(
        self,
        query: str,
        source: str = "all",
        count: int = 3,
        orientation: str = "portrait",
    ) -> list[dict]:
        """
        Search for stock videos.

        Args:
            query: Search term (e.g., "nature sunset")
            source: 'pexels', 'openverse', or 'all' (pexels first, fallback openverse)
            count: Number of results to return
            orientation: 'portrait' (9:16) or 'landscape' (16:9)

        Returns:
            List of dicts with keys: source, url, preview_url, width, height, duration, author, license
        """
        results: list[dict] = []

        if source in ("pexels", "all") and self.pexels_api_key:
            results = self._search_pexels(query, count, orientation)

        if not results and source in ("openverse", "all"):
            results = self._search_openverse(query, count, orientation)

        # Fallback: try broader keywords if still no results
        if not results:
            for kw in self._fallback_keywords(query):
                if source in ("pexels", "all") and self.pexels_api_key:
                    results = self._search_pexels(kw, count, orientation)
                if results:
                    break
                if source in ("openverse", "all"):
                    results = self._search_openverse(kw, count, orientation)
                if results:
                    break

        return results

    def _search_pexels(self, query: str, count: int, orientation: str) -> list[dict]:
        """Search Pexels API for videos."""
        try:
            pexels_orient = "portrait" if orientation == "portrait" else "landscape"
            resp = self._client.get(
                self.PEXELS_SEARCH_URL,
                headers={"Authorization": self.pexels_api_key},
                params={
                    "query": query,
                    "per_page": count,
                    "orientation": pexels_orient,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            results = []
            for item in data.get("videos", []):
                # Pick the best video file (highest quality available)
                video_files = sorted(
                    item.get("video_files", []),
                    key=lambda f: f.get("height", 0),
                    reverse=True,
                )
                best = video_files[0] if video_files else {}
                preview_pics = item.get("video_pictures", [])
                preview_url = preview_pics[0]["picture"] if preview_pics else ""

                results.append(
                    {
                        "source": "pexels",
                        "url": best.get("link", ""),
                        "preview_url": preview_url,
                        "width": best.get("width", 0),
                        "height": best.get("height", 0),
                        "duration": item.get("duration", 0),
                        "author": item.get("user", {}).get("name", "Unknown"),
                        "license": "Pexels License (free for commercial use)",
                    }
                )
            return results
        except Exception as e:
            print(f"[StockEngine] Pexels search failed for '{query}': {e}")
            return []

    def _search_openverse(self, query: str, count: int, orientation: str) -> list[dict]:
        """Search Openverse API for videos (no key needed)."""
        try:
            resp = self._client.get(
                self.OPENVERSE_SEARCH_URL,
                params={
                    "q": query,
                    "page_size": count,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            results = []
            for item in data.get("results", []):
                width = item.get("width", 0) or 0
                height = item.get("height", 0) or 0

                # Filter by orientation if dimensions are known
                if width > 0 and height > 0:
                    is_portrait = height > width
                    if orientation == "portrait" and not is_portrait:
                        continue
                    if orientation == "landscape" and is_portrait:
                        continue

                results.append(
                    {
                        "source": "openverse",
                        "url": item.get("url", ""),
                        "preview_url": item.get("thumbnail", ""),
                        "width": width,
                        "height": height,
                        "duration": item.get("duration") or 0,
                        "author": item.get("creator", "Unknown"),
                        "license": item.get("license", "Unknown"),
                    }
                )
            return results
        except Exception as e:
            print(f"[StockEngine] Openverse search failed for '{query}': {e}")
            return []

    def download_video(self, url: str, output_path: str) -> bool:
        """
        Download a video file to the given path.

        Args:
            url: Direct video URL
            output_path: Destination file path

        Returns:
            True on success, False on failure
        """
        if not url:
            return False
        try:
            Path(output_path).parent.mkdir(parents=True, exist_ok=True)
            with self._client.stream("GET", url, follow_redirects=True) as resp:
                resp.raise_for_status()
                with open(output_path, "wb") as f:
                    for chunk in resp.iter_bytes(chunk_size=65536):
                        f.write(chunk)
            return True
        except Exception as e:
            print(f"[StockEngine] Download failed for {url}: {e}")
            return False

    def search_and_download(
        self,
        queries: list[str],
        output_dir: str,
        count_per_query: int = 2,
        orientation: str = "portrait",
    ) -> list[dict]:
        """
        Search for videos matching each query and download them in parallel.

        Args:
            queries: List of search terms
            output_dir: Directory to save downloaded videos
            count_per_query: Number of videos per query
            orientation: 'portrait' (9:16) or 'landscape' (16:9)

        Returns:
            List of dicts with keys: query, path, source, duration
        """
        Path(output_dir).mkdir(parents=True, exist_ok=True)

        # Collect all (query, video_result) pairs to download
        download_jobs: list[tuple[str, dict]] = []
        for query in queries:
            results = self.search_videos(query, count=count_per_query, orientation=orientation)
            for i, vid in enumerate(results):
                download_jobs.append((query, vid))

        # Download in parallel
        downloaded: list[dict] = []

        def _do_download(job: tuple[str, dict]) -> Optional[dict]:
            query, vid = job
            if not vid.get("url"):
                return None
            # Sanitize filename from query
            safe_name = re.sub(r"[^a-z0-9]+", "_", query.lower()).strip("_")
            idx = len([d for d in downloaded if d.get("query") == query])
            ext = ".mp4"
            filename = f"{safe_name}_{vid['source']}_{idx}{ext}"
            path = str(Path(output_dir) / filename)

            if self.download_video(vid["url"], path):
                return {
                    "query": query,
                    "path": path,
                    "source": vid["source"],
                    "duration": vid.get("duration", 0),
                }
            return None

        # Use threads for parallel downloads — one per job
        max_workers = min(4, len(download_jobs)) if download_jobs else 1
        with ThreadPoolExecutor(max_workers=max_workers) as pool:
            futures = {pool.submit(_do_download, job): job for job in download_jobs}
            for future in as_completed(futures):
                result = future.result()
                if result:
                    downloaded.append(result)

        return downloaded

    def _fallback_keywords(self, query: str) -> list[str]:
        """
        Generate fallback keywords when a query returns no results.

        Tries to extract broader terms from the query, then uses the
        fallback map for common themes.

        Examples:
            'cozy cafe rain' -> ['cafe', 'rain', 'coffee', 'nature']
            'cyberpunk city neon' -> ['city', 'technology', 'urban']
        """
        words = re.split(r"\s+", query.lower().strip())
        fallbacks: list[str] = []

        # Match query words against the fallback map
        for word in words:
            if word in self.FALLBACK_MAP:
                fallbacks.extend(self.FALLBACK_MAP[word])

        # If no matches, just take individual words (skip very short ones)
        if not fallbacks:
            fallbacks = [w for w in words if len(w) > 2]

        # Deduplicate preserving order
        seen: set[str] = set()
        unique: list[str] = []
        for kw in fallbacks:
            if kw not in seen:
                seen.add(kw)
                unique.append(kw)

        return unique[:5]


# CLI entry point
if __name__ == "__main__":
    import sys
    import json

    if len(sys.argv) < 2:
        print("Usage: python stock_engine.py <query> [count] [orientation]")
        print("  count: number of results (default 3)")
        print("  orientation: 'portrait' or 'landscape' (default portrait)")
        sys.exit(1)

    query = sys.argv[1]
    count = int(sys.argv[2]) if len(sys.argv) > 2 else 3
    orient = sys.argv[3] if len(sys.argv) > 3 else "portrait"

    engine = StockEngine()
    results = engine.search_videos(query, count=count, orientation=orient)
    print(json.dumps(results, indent=2))

    if results and "--download" in sys.argv:
        out_dir = "videos/stock"
        downloaded = engine.search_and_download([query], out_dir, count_per_query=count, orientation=orient)
        print(f"\nDownloaded {len(downloaded)} videos to {out_dir}/")
        print(json.dumps(downloaded, indent=2))
