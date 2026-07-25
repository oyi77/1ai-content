"""
Pinterest Scraper — search pins, download images, and post to Facebook.

Uses authenticated Pinterest cookies (_pinterest_sess + csrftoken) for
internal-API searches without full OAuth. Cookies set via env vars:

  PINTEREST_COOKIES  — raw cookie string (e.g., "_pinterest_sess=abc; csrftoken=xyz")
  PINTEREST_CSRF     — csrf token for the X-CSRFToken header
  PINTEREST_USERNAME — optional, for display purposes
"""

import json
import os
import random
import re
import tempfile
import time
from pathlib import Path
from typing import Optional

import httpx

# ── Config from env ─────────────────────────────────────────────
PINTEREST_COOKIES = os.getenv("PINTEREST_COOKIES", "")
PINTEREST_CSRF = os.getenv("PINTEREST_CSRF", "")
# Pinterest domain varies by geo-location; www may 403 while id works.
# Detect from the cookie string (_pinterest_sess domain), or fall back to id.pinterest.com
_cookie_domain = re.search(r"Domain=([^;]+)", PINTEREST_COOKIES)
if _cookie_domain:
    PINTEREST_DOMAIN = _cookie_domain.group(1).strip()
else:
    PINTEREST_DOMAIN = os.getenv("PINTEREST_DOMAIN", "id.pinterest.com")
# Strip leading dot if present (cookie domain format)
PINTEREST_DOMAIN = PINTEREST_DOMAIN.lstrip(".")

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "Accept-Language": "en-US,en;q=0.9",
    "X-Requested-With": "XMLHttpRequest",
    "Origin": f"https://{PINTEREST_DOMAIN}",
    "Referer": f"https://{PINTEREST_DOMAIN}/",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-Mode": "cors",
}


class PinterestScraper:
    """Search Pinterest and download images using cookie auth."""

    def __init__(
        self,
        cookie_str: str = "",
        csrf_token: str = "",
    ):
        self.cookie_str = cookie_str or PINTEREST_COOKIES
        self.csrf_token = csrf_token or PINTEREST_CSRF

        headers = {"Cookie": self.cookie_str, **_HEADERS}
        if self.csrf_token:
            headers["X-CSRFToken"] = self.csrf_token

        self.client = httpx.Client(
            headers=headers,
            timeout=30.0,
            follow_redirects=True,
        )

    # ── PUBLIC ──────────────────────────────────────────────────

    def search_pins(
        self,
        query: str,
        limit: int = 20,
    ) -> list[dict]:
        """Search pins by keyword.

        Returns list of:
          { title, image_url, pin_url, description, pin_id, domain }
        """
        params = {
            "q": query,
            "rs": "typed",
            "source_url": f"/search/pins/?q={query}",
        }

        # Pinterest resource API — returns JSON inside a "resource_response" wrapper
        url = f"https://{PINTEREST_DOMAIN}/resource/BaseSearchResource/get/"
        payload = {
            "source_url": f"/search/pins/?q={query}",
            "data": {
                "options": {
                    "query": query,
                    "page_size": min(limit, 250),
                    "bookmarks": None,
                },
                "context": {},
            },
            "module": "SearchUI",
        }

        try:
            resp = self.client.post(url, params=params, json=payload)
            resp.raise_for_status()
            data = resp.json()
        except Exception as exc:
            return [{"error": f"Search failed: {exc}"}]

        # Navigate the nested Pinterest response blob
        results = []
        resource_data = data.get("resource_response", {}).get("data")
        if isinstance(resource_data, list):
            # Alternate shape — results directly as a flat list
            raw_pins = resource_data
        else:
            # Normal shape — under data.results
            raw_pins = (resource_data or {}).get("results", [])
        if not raw_pins or not isinstance(raw_pins, list):
            return [{"error": "No pins found"}]

        for pin in raw_pins[:limit]:
            if not isinstance(pin, dict):
                continue

            pin_id = pin.get("id", "")
            title = (
                pin.get("title")
                or pin.get("grid_title")
                or pin.get("description", "")
            )
            description = pin.get("description", "")
            domain = pin.get("domain", "")
            link = pin.get("link", "")

            # Image URL — try highest quality first
            images = pin.get("images", {})
            image_url = ""
            for size in ("originals", "736x", "564x", "236x"):
                src = images.get(size, {}).get("url", "")
                if src:
                    image_url = src
                    break

            results.append({
                "pin_id": pin_id,
                "title": title or "",
                "description": description or "",
                "image_url": image_url,
                "pin_url": f"https://www.pinterest.com/pin/{pin_id}/" if pin_id else "",
                "domain": domain or "",
                "link": link or "",
            })

        return results

    def download_image(
        self,
        image_url: str,
        dest_dir: str = "",
    ) -> str:
        """Download a Pinterest image to a local temp file.

        Returns the local file path, or empty string on failure.
        """
        if not image_url:
            return ""

        try:
            resp = self.client.get(image_url)
            resp.raise_for_status()

            content = resp.content
            # Guess extension
            ctype = resp.headers.get("content-type", "image/jpeg")
            ext = ".jpg"
            if "png" in ctype:
                ext = ".png"
            elif "webp" in ctype:
                ext = ".webp"

            if dest_dir:
                Path(dest_dir).mkdir(parents=True, exist_ok=True)
                fpath = Path(dest_dir) / f"pin_{int(time.time())}_{random.randint(100,999)}{ext}"
                fpath.write_bytes(content)
                return str(fpath.resolve())
            else:
                with tempfile.NamedTemporaryFile(
                    suffix=ext, delete=False,
                ) as tmp:
                    tmp.write(content)
                    return tmp.name
        except Exception as exc:
            return ""

    def close(self):
        """Release HTTP client resources."""
        self.client.close()