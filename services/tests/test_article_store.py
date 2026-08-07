"""Unit tests for the article side-store (services/article/store.py)."""
import sqlite3

import pytest

from services.article.store import ArticleStore, _slugify


@pytest.fixture
def store(tmp_path):
    return ArticleStore(str(tmp_path / "articles.sqlite"))


def test_slugify_normalizes_title():
    assert _slugify("Hello World!") == "hello-world"
    assert _slugify("Cara Belajar Coding") == "cara-belajar-coding"
    assert _slugify("  spaced  out  ") == "spaced-out"
    assert _slugify("") == "article"
    assert _slugify("!!!") == "article"


def test_save_returns_deduped_slug(store):
    first = store.save(
        {"title": "My Post", "content": "<p>x</p>", "format": "html", "word_count": 10}
    )
    second = store.save(
        {"title": "My Post", "content": "<p>y</p>", "format": "html", "word_count": 20}
    )
    assert first == "my-post"
    assert second == "my-post-2"
    assert store.get("my-post")["content"] == "<p>x</p>"
    assert store.get("my-post-2")["content"] == "<p>y</p>"


def test_save_schema_and_created_at(store):
    store.save({"title": "Fresh", "content": "c", "format": "markdown", "word_count": 5})
    row = store.get("fresh")
    assert row["title"] == "Fresh"
    assert row["format"] == "markdown"
    assert row["created_at"]  # default datetime string present


def test_list_returns_newest_first_metadata_only(store):
    for i, title in enumerate(["First", "Second", "Third"], start=1):
        store.save(
            {
                "title": title,
                "content": f"<p>{title}</p>",
                "format": "html",
                "word_count": i * 10,
            }
        )
    items = store.list()
    assert [a["slug"] for a in items] == ["third", "second", "first"]
    for item in items:
        assert "content" not in item
        assert item["title"]


def test_list_limit(store):
    for i in range(5):
        store.save({"title": f"Post {i}", "content": "c", "format": "html", "word_count": 1})
    assert len(store.list(limit=2)) == 2


def test_get_missing_returns_none(store):
    assert store.get("nope") is None