"""SQLite side-store for generated articles.

Articles are generated on demand (``POST /text/article``) and kept in a
small local SQLite DB so they can be listed and re-read by the SPA pages
(``GET /text/articles`` / ``GET /text/articles/{slug}``). Pure stdlib —
no ORM, no migration machinery. The DB path comes from the
``ARTICLES_DB_PATH`` env var and defaults to ``services/data/article.sqlite``
next to the ebook projects DB (see ``services/data/AGENTS.md``).
"""
from __future__ import annotations

import os
import re
import sqlite3
from pathlib import Path
from typing import Any, Optional

_DEFAULT_DB = Path(__file__).resolve().parents[1] / "data" / "article.sqlite"

_SCHEMA = """
CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    meta_description TEXT NOT NULL DEFAULT '',
    language TEXT NOT NULL DEFAULT 'en',
    format TEXT NOT NULL DEFAULT 'html',
    word_count INTEGER NOT NULL DEFAULT 0,
    llm TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
"""

_SLUG_RE = re.compile(r"[^a-z0-9]+")


def _slugify(title: str) -> str:
    """``Hello World!`` -> ``hello-world``; falls back to ``article``."""
    slug = _SLUG_RE.sub("-", title.lower()).strip("-")
    return slug or "article"


class ArticleStore:
    """Thin sqlite3 persistence for generated articles."""

    def __init__(self, db_path: Optional[str] = None) -> None:
        self.db_path = Path(db_path or os.getenv("ARTICLES_DB_PATH", str(_DEFAULT_DB)))
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_schema()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        return conn

    def _init_schema(self) -> None:
        with self._connect() as conn:
            conn.execute(_SCHEMA)

    def _unique_slug(self, conn: sqlite3.Connection, base: str) -> str:
        slug = base
        n = 2
        while conn.execute("SELECT 1 FROM articles WHERE slug = ?", (slug,)).fetchone():
            slug = f"{base}-{n}"
            n += 1
        return slug

    def save(self, article: dict[str, Any]) -> str:
        """Insert a generated article; returns its unique slug."""
        base = _slugify(str(article.get("title") or ""))
        with self._connect() as conn:
            slug = self._unique_slug(conn, base)
            conn.execute(
                """INSERT INTO articles
                   (slug, title, content, meta_description, language, format,
                    word_count, llm)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    slug,
                    str(article.get("title") or ""),
                    str(article.get("content") or ""),
                    str(article.get("meta_description") or ""),
                    str(article.get("language") or "en"),
                    str(article.get("format") or "html"),
                    int(article.get("word_count") or 0),
                    str(article.get("llm") or ""),
                ),
            )
        return slug

    def list(self, limit: int = 50) -> list[dict[str, Any]]:
        """Metadata-only rows for the articles index, newest first."""
        with self._connect() as conn:
            rows = conn.execute(
                """SELECT slug, title, meta_description, language, format,
                          word_count, created_at
                   FROM articles
                   ORDER BY created_at DESC, id DESC
                   LIMIT ?""",
                (int(limit),),
            ).fetchall()
        return [dict(r) for r in rows]

    def get(self, slug: str) -> Optional[dict[str, Any]]:
        """Full record for one article, or None if the slug is unknown."""
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM articles WHERE slug = ?", (slug,)
            ).fetchone()
        return dict(row) if row else None


_store: Optional[ArticleStore] = None


def get_article_store() -> ArticleStore:
    """Lazy module singleton, mirroring the ``services.di`` getters."""
    global _store
    if _store is None:
        _store = ArticleStore()
    return _store
