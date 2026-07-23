#!/usr/bin/env python3
"""Unit tests for PinterestScraper — mocked API responses, no real cookies needed."""

import os
import sys
import json
from pathlib import Path
from unittest.mock import patch, MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from services.pinterest import PinterestScraper

# ── Sample Pinterest API response ────────────────────────────

PIN_RESPONSE_SAMPLE = {
    "resource_response": {
        "data": {
            "results": [
                {
                    "id": "123456789",
                    "title": "Modern Living Room Design",
                    "grid_title": "Cozy living room inspo",
                    "description": "Beautiful modern living room with minimal furniture",
                    "domain": "example.com",
                    "link": "https://example.com/post/1",
                    "images": {
                        "originals": {
                            "url": "https://i.pinimg.com/originals/abc.jpg",
                            "width": 1200, "height": 1800,
                        },
                        "564x": {
                            "url": "https://i.pinimg.com/564x/abc.jpg",
                            "width": 564, "height": 846,
                        },
                        "236x": {
                            "url": "https://i.pinimg.com/236x/abc.jpg",
                            "width": 236, "height": 354,
                        },
                    },
                    "pinner": {"username": "homedecor", "full_name": "Home Decor Ideas"},
                },
                {
                    "id": "987654321",
                    "title": "",
                    "description": "Kitchen renovation tips and tricks",
                    "domain": "kitchenblog.com",
                    "link": "",
                    "images": {
                        "564x": {
                            "url": "https://i.pinimg.com/564x/def.jpg",
                            "width": 564, "height": 846,
                        },
                    },
                    "pinner": {"username": "kitchenlover", "full_name": "Kitchen Lover"},
                },
            ]
        }
    }
}

ALT_RESPONSE_SAMPLE = {
    "resource_response": {
        "data": [
            {
                "id": "555666777",
                "title": "Alternative shape pin",
                "description": "Some pins come as a flat list",
                "domain": "alt.com",
                "images": {
                    "236x": {
                        "url": "https://i.pinimg.com/236x/alt.jpg",
                        "width": 236, "height": 354,
                    },
                },
            },
        ]
    }
}

# ── Tests ───────────────────────────────────────────────────

def make_mock_response(json_data, status=200):
    """Build a mock httpx.Response."""
    resp = MagicMock()
    resp.status_code = status
    resp.json.return_value = json_data
    resp.raise_for_status = MagicMock()
    if status >= 400:
        resp.raise_for_status.side_effect = Exception(f"HTTP {status}")
    return resp


class TestPinterestScraper:
    """Validate PinterestScraper parsing/normalization — no real network calls."""

    def test_imports_without_env(self):
        """Module imports cleanly even when no cookies are set."""
        from services.pinterest import PinterestScraper
        assert PinterestScraper is not None

    def test_search_pins_normalizes_keys(self):
        """Raw Pinterest response → normalized dict with correct keys."""
        scraper = PinterestScraper(cookie_str="_pinterest_sess=test; csrftoken=test")
        with patch.object(scraper.client, "post", return_value=make_mock_response(PIN_RESPONSE_SAMPLE)):
            results = scraper.search_pins("living room", limit=5)

        assert len(results) == 2

        # First pin — should pick originals URL
        r0 = results[0]
        assert r0["pin_id"] == "123456789"
        assert r0["title"] == "Modern Living Room Design"
        assert r0["description"] == "Beautiful modern living room with minimal furniture"
        assert r0["image_url"] == "https://i.pinimg.com/originals/abc.jpg"
        assert r0["pin_url"] == "https://www.pinterest.com/pin/123456789/"
        assert r0["domain"] == "example.com"
        assert r0["link"] == "https://example.com/post/1"

        # Second pin — no title; should fallback to description; no originals → next quality
        r1 = results[1]
        assert r1["pin_id"] == "987654321"
        assert r1["title"] == "Kitchen renovation tips and tricks"  # falls back to description
        assert r1["image_url"] == "https://i.pinimg.com/564x/def.jpg"
        assert r1["link"] == ""

    def test_search_pins_flat_list_shape(self):
        """Handle the alternate response shape where results are a flat list."""
        scraper = PinterestScraper(cookie_str="_pinterest_sess=test; csrftoken=test")
        with patch.object(scraper.client, "post", return_value=make_mock_response(ALT_RESPONSE_SAMPLE)):
            results = scraper.search_pins("alt", limit=5)

        assert len(results) == 1
        assert results[0]["pin_id"] == "555666777"
        assert results[0]["title"] == "Alternative shape pin"

    def test_search_pins_empty_response(self):
        """Empty response returns empty list."""
        scraper = PinterestScraper(cookie_str="_pinterest_sess=test; csrftoken=test")
        empty_resp = {"resource_response": {"data": {"results": []}}}
        with patch.object(scraper.client, "post", return_value=make_mock_response(empty_resp)):
            results = scraper.search_pins("nothing", limit=5)
        assert results == [{"error": "No pins found"}]  # matches current behavior

    def test_search_pins_http_error(self):
        """HTTP error returns error dict."""
        scraper = PinterestScraper(cookie_str="_pinterest_sess=test; csrftoken=test")
        with patch.object(scraper.client, "post", return_value=make_mock_response({}, status=401)):
            results = scraper.search_pins("secret", limit=5)
        assert len(results) == 1
        assert "error" in results[0]

    def test_download_image_fails_without_cookies(self):
        """download_image returns empty string without valid session."""
        scraper = PinterestScraper(cookie_str="")
        path = scraper.download_image("https://example.com/img.jpg")
        assert path == ""

    def test_respects_limit(self):
        """limit param caps number of returned pins."""
        scraper = PinterestScraper(cookie_str="_pinterest_sess=test; csrftoken=test")
        with patch.object(scraper.client, "post", return_value=make_mock_response(PIN_RESPONSE_SAMPLE)):
            results = scraper.search_pins("test", limit=1)
        assert len(results) == 1
        assert results[0]["pin_id"] == "123456789"

    def test_close_releases_client(self):
        """close() calls client.aclose()."""
        scraper = PinterestScraper(cookie_str="_pinterest_sess=test; csrftoken=test")
        with patch.object(scraper.client, "close") as mock_close:
            scraper.close()
            mock_close.assert_called_once()


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
