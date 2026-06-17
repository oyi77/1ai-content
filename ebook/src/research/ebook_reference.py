"""Ebook market reference lookup using free public APIs (no key required).

Sources:
- Google Books API  https://books.googleapis.com/books/v1/volumes
- Open Library API  https://openlibrary.org/search.json
"""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from typing import Any
from src.logger import get_logger

logger = get_logger(__name__)


@dataclass
class EbookRef:
    title: str
    authors: list[str] = field(default_factory=list)
    description: str = ""
    categories: list[str] = field(default_factory=list)
    page_count: int = 0
    published_year: str = ""
    language: str = ""
    source: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "title": self.title,
            "authors": self.authors,
            "description": self.description,
            "categories": self.categories,
            "page_count": self.page_count,
            "published_year": self.published_year,
            "language": self.language,
            "source": self.source,
        }


def search_ebooks(
    query: str,
    language: str = "en",
    max_results: int = 10,
    timeout: int = 10,
) -> list[EbookRef]:
    """Search for ebooks matching *query* using Google Books + Open Library fallback.

    Args:
        query:       Search keywords (topic, title, or genre).
        language:    BCP-47 language code to filter results (e.g. ``"en"``, ``"id"``).
                     Pass ``""`` to disable language filtering.
        max_results: Maximum number of results to return (capped at 40).
        timeout:     HTTP request timeout in seconds.

    Returns:
        List of :class:`EbookRef` objects, deduplicated by normalised title.
        Returns an empty list on network failure — never raises.
    """
    max_results = min(max_results, 40)
    results: list[EbookRef] = []

    try:
        results = _search_google_books(query, language, max_results, timeout)
    except Exception as e:
        logger.warning("Google Books API call failed", error=str(e))

    if len(results) < max_results:
        needed = max_results - len(results)
        try:
            ol_results = _search_open_library(query, language, needed, timeout)
            # deduplicate: skip titles already present (case-insensitive)
            existing_titles = {r.title.lower() for r in results}
            for ref in ol_results:
                if ref.title.lower() not in existing_titles:
                    results.append(ref)
                    existing_titles.add(ref.title.lower())
                    if len(results) >= max_results:
                        break
        except Exception as e:
            logger.warning("Open Library API call failed", error=str(e))

    return results[:max_results]


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------


def _fetch_json(url: str, timeout: int) -> Any:
    req = urllib.request.Request(url, headers={"User-Agent": "1ai-ebook-research/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _search_google_books(
    query: str, language: str, max_results: int, timeout: int
) -> list[EbookRef]:
    params: dict[str, Any] = {
        "q": query,
        "maxResults": min(max_results, 40),
        "printType": "books",
        "orderBy": "relevance",
    }
    if language:
        params["langRestrict"] = language

    url = "https://www.googleapis.com/books/v1/volumes?" + urllib.parse.urlencode(
        params
    )
    data = _fetch_json(url, timeout)

    refs: list[EbookRef] = []
    for item in data.get("items", []):
        info = item.get("volumeInfo", {})
        title = info.get("title", "").strip()
        if not title:
            continue

        published = info.get("publishedDate", "")
        year = published[:4] if published else ""

        refs.append(
            EbookRef(
                title=title,
                authors=info.get("authors", []),
                description=(info.get("description") or "")[:500],
                categories=info.get("categories", []),
                page_count=info.get("pageCount", 0) or 0,
                published_year=year,
                language=info.get("language", ""),
                source="google_books",
            )
        )
    return refs


def _search_open_library(
    query: str, language: str, max_results: int, timeout: int
) -> list[EbookRef]:
    params: dict[str, Any] = {
        "q": query,
        "limit": min(max_results, 100),
        "fields": "title,author_name,subject,first_publish_year,language,number_of_pages_median",
    }
    if language:
        params["language"] = language

    url = "https://openlibrary.org/search.json?" + urllib.parse.urlencode(params)
    data = _fetch_json(url, timeout)

    refs: list[EbookRef] = []
    for doc in data.get("docs", []):
        title = (doc.get("title") or "").strip()
        if not title:
            continue

        year = str(doc.get("first_publish_year", "") or "")
        lang_codes: list[str] = doc.get("language", [])
        lang = lang_codes[0] if lang_codes else ""

        refs.append(
            EbookRef(
                title=title,
                authors=doc.get("author_name", []),
                description="",
                categories=doc.get("subject", [])[:5],
                page_count=doc.get("number_of_pages_median", 0) or 0,
                published_year=year,
                language=lang,
                source="open_library",
            )
        )
    return refs
