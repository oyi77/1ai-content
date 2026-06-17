"""Unit tests for src/research/ebook_reference.py.

All network calls are mocked — no real HTTP requests in CI.
"""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest

from src.research.ebook_reference import (
    EbookRef,
    _search_google_books,
    _search_open_library,
    search_ebooks,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

GOOGLE_RESPONSE = {
    "items": [
        {
            "volumeInfo": {
                "title": "Deep Work",
                "authors": ["Cal Newport"],
                "description": "Rules for focused success in a distracted world.",
                "categories": ["Business"],
                "pageCount": 296,
                "publishedDate": "2016-01-05",
                "language": "en",
            }
        },
        {
            "volumeInfo": {
                "title": "Atomic Habits",
                "authors": ["James Clear"],
                "description": "Tiny changes, remarkable results.",
                "categories": ["Self-Help"],
                "pageCount": 320,
                "publishedDate": "2018-10-16",
                "language": "en",
            }
        },
    ]
}

OPEN_LIBRARY_RESPONSE = {
    "docs": [
        {
            "title": "The Lean Startup",
            "author_name": ["Eric Ries"],
            "subject": ["Entrepreneurship", "Business"],
            "first_publish_year": 2011,
            "language": ["eng"],
            "number_of_pages_median": 336,
        },
        {
            "title": "Deep Work",  # duplicate — should be skipped in combined search
            "author_name": ["Cal Newport"],
            "subject": ["Productivity"],
            "first_publish_year": 2016,
            "language": ["eng"],
            "number_of_pages_median": 296,
        },
    ]
}


def _make_mock_urlopen(payload: dict):
    """Return a context-manager mock that yields JSON bytes."""
    mock_resp = MagicMock()
    mock_resp.read.return_value = json.dumps(payload).encode("utf-8")
    mock_resp.__enter__ = lambda s: s
    mock_resp.__exit__ = MagicMock(return_value=False)
    return mock_resp


# ---------------------------------------------------------------------------
# EbookRef tests
# ---------------------------------------------------------------------------


class TestEbookRef:
    def test_to_dict_round_trip(self):
        ref = EbookRef(
            title="Test Book",
            authors=["Author One"],
            description="A description",
            categories=["Fiction"],
            page_count=200,
            published_year="2023",
            language="en",
            source="google_books",
        )
        d = ref.to_dict()
        assert d["title"] == "Test Book"
        assert d["authors"] == ["Author One"]
        assert d["page_count"] == 200
        assert d["source"] == "google_books"

    def test_defaults(self):
        ref = EbookRef(title="Minimal")
        assert ref.authors == []
        assert ref.categories == []
        assert ref.page_count == 0
        assert ref.description == ""
        assert ref.source == ""


# ---------------------------------------------------------------------------
# Google Books tests
# ---------------------------------------------------------------------------


class TestSearchGoogleBooks:
    @patch("urllib.request.urlopen")
    def test_returns_ebook_refs(self, mock_urlopen):
        mock_urlopen.return_value = _make_mock_urlopen(GOOGLE_RESPONSE)
        results = _search_google_books("productivity", "en", 5, 10)
        assert len(results) == 2
        assert results[0].title == "Deep Work"
        assert results[0].authors == ["Cal Newport"]
        assert results[0].published_year == "2016"
        assert results[0].source == "google_books"

    @patch("urllib.request.urlopen")
    def test_description_truncated_at_500(self, mock_urlopen):
        long_desc = "x" * 600
        data = {
            "items": [
                {"volumeInfo": {"title": "Long Desc Book", "description": long_desc}}
            ]
        }
        mock_urlopen.return_value = _make_mock_urlopen(data)
        results = _search_google_books("test", "en", 5, 10)
        assert len(results[0].description) <= 500

    @patch("urllib.request.urlopen")
    def test_skips_items_without_title(self, mock_urlopen):
        data = {
            "items": [
                {"volumeInfo": {"title": ""}},
                {"volumeInfo": {"title": "Good Book"}},
            ]
        }
        mock_urlopen.return_value = _make_mock_urlopen(data)
        results = _search_google_books("test", "en", 5, 10)
        assert len(results) == 1
        assert results[0].title == "Good Book"

    @patch("urllib.request.urlopen")
    def test_empty_items(self, mock_urlopen):
        mock_urlopen.return_value = _make_mock_urlopen({})
        results = _search_google_books("test", "en", 5, 10)
        assert results == []


# ---------------------------------------------------------------------------
# Open Library tests
# ---------------------------------------------------------------------------


class TestSearchOpenLibrary:
    @patch("urllib.request.urlopen")
    def test_returns_ebook_refs(self, mock_urlopen):
        mock_urlopen.return_value = _make_mock_urlopen(OPEN_LIBRARY_RESPONSE)
        results = _search_open_library("startup", "en", 5, 10)
        assert len(results) == 2
        assert results[0].title == "The Lean Startup"
        assert results[0].source == "open_library"
        assert results[0].published_year == "2011"

    @patch("urllib.request.urlopen")
    def test_categories_capped_at_5(self, mock_urlopen):
        data = {"docs": [{"title": "Big Book", "subject": [str(i) for i in range(10)]}]}
        mock_urlopen.return_value = _make_mock_urlopen(data)
        results = _search_open_library("test", "en", 5, 10)
        assert len(results[0].categories) <= 5

    @patch("urllib.request.urlopen")
    def test_skips_docs_without_title(self, mock_urlopen):
        data = {"docs": [{"title": ""}, {"title": "Good"}]}
        mock_urlopen.return_value = _make_mock_urlopen(data)
        results = _search_open_library("test", "en", 5, 10)
        assert len(results) == 1


# ---------------------------------------------------------------------------
# Combined search_ebooks tests
# ---------------------------------------------------------------------------


class TestSearchEbooks:
    @patch("urllib.request.urlopen")
    def test_returns_google_results_first(self, mock_urlopen):
        mock_urlopen.return_value = _make_mock_urlopen(GOOGLE_RESPONSE)
        results = search_ebooks("productivity", max_results=5)
        assert len(results) >= 1
        assert results[0].source == "google_books"

    @patch(
        "src.research.ebook_reference._search_google_books",
        side_effect=Exception("network"),
    )
    @patch("urllib.request.urlopen")
    def test_falls_back_to_open_library_on_google_failure(
        self, mock_urlopen, _mock_google
    ):
        mock_urlopen.return_value = _make_mock_urlopen(OPEN_LIBRARY_RESPONSE)
        results = search_ebooks("startup", max_results=5)
        assert len(results) >= 1
        assert all(r.source == "open_library" for r in results)

    @patch(
        "src.research.ebook_reference._search_google_books", side_effect=Exception("g")
    )
    @patch(
        "src.research.ebook_reference._search_open_library", side_effect=Exception("ol")
    )
    def test_returns_empty_list_on_both_failures(self, _ol, _g):
        results = search_ebooks("anything")
        assert results == []

    @patch("urllib.request.urlopen")
    def test_deduplicates_across_sources(self, mock_urlopen):
        # Google returns 1 result; OL returns same title + 1 new
        google_data = {
            "items": [{"volumeInfo": {"title": "Deep Work", "language": "en"}}]
        }
        ol_data = {
            "docs": [
                {"title": "Deep Work", "first_publish_year": 2016},
                {"title": "New Book", "first_publish_year": 2020},
            ]
        }
        responses = [_make_mock_urlopen(google_data), _make_mock_urlopen(ol_data)]
        mock_urlopen.side_effect = responses
        results = search_ebooks("focus", max_results=10)
        titles = [r.title for r in results]
        assert titles.count("Deep Work") == 1  # no duplicate

    def test_max_results_capped_at_40(self):
        with patch(
            "src.research.ebook_reference._search_google_books", return_value=[]
        ) as _g:
            with patch(
                "src.research.ebook_reference._search_open_library", return_value=[]
            ) as _ol:
                search_ebooks("test", max_results=999)
                # verify the internal cap reached google with ≤40
                call_kwargs = _g.call_args
                assert call_kwargs[0][2] <= 40  # max_results arg
