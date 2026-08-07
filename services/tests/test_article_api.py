"""API tests for the article router (/text/article, /text/articles).

ArticleEngine is stubbed via ``di._instances`` so tests cover routing /
validation / passthrough / persistence without running the generation
pipeline. The article side-store is isolated per test via
``article_store`` (tmp_path + module singleton swap).
"""
import pytest

import services.di as di
from services.article import store as article_store_module


class _StubArticle:
    def generate(self, **kwargs):
        if kwargs.get("topic") == "boom":
            return {"success": False, "error": "topic is required"}
        return {
            "success": True,
            "title": kwargs.get("topic"),
            "content": "<article><h1>t</h1></article>",
            "meta_description": "meta",
            "word_count": 5,
            "language": kwargs.get("language"),
            "format": kwargs.get("format"),
            "kwargs": kwargs,
        }


@pytest.fixture
def stub_article(monkeypatch):
    stub = _StubArticle()
    monkeypatch.setitem(di._instances, "article", stub)
    return stub


@pytest.fixture
def article_store(tmp_path, monkeypatch):
    """Isolated ArticleStore at a temp path, swapped into the singleton."""
    store = article_store_module.ArticleStore(str(tmp_path / "articles.sqlite"))
    monkeypatch.setattr(article_store_module, "_store", store)
    return store


def test_generate_missing_topic_returns_422(client):
    resp = client.post("/text/article", json={})
    assert resp.status_code == 422


def test_generate_success_passthrough(client, stub_article, article_store):
    resp = client.post(
        "/text/article",
        json={
            "topic": "cara belajar coding",
            "keywords": ["python", "ai"],
            "audience": "developers",
            "length_words": 1200,
            "language": "id",
            "tone": "friendly",
            "format": "markdown",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["title"] == "cara belajar coding"
    assert body["kwargs"]["topic"] == "cara belajar coding"
    assert body["kwargs"]["keywords"] == ["python", "ai"]
    assert body["kwargs"]["audience"] == "developers"
    assert body["kwargs"]["length_words"] == 1200
    assert body["kwargs"]["language"] == "id"
    assert body["kwargs"]["tone"] == "friendly"
    assert body["kwargs"]["format"] == "markdown"


def test_generate_defaults_forwarded(client, stub_article, article_store):
    resp = client.post("/text/article", json={"topic": "t"})
    assert resp.status_code == 200
    kwargs = resp.json()["kwargs"]
    assert kwargs["topic"] == "t"
    assert kwargs["keywords"] is None
    assert kwargs["audience"] == "general"
    assert kwargs["length_words"] == 800
    assert kwargs["language"] == "en"
    assert kwargs["tone"] == "informative"
    assert kwargs["format"] == "html"


def test_generate_persists_article(client, stub_article, article_store):
    resp = client.post("/text/article", json={"topic": "Hello World"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["slug"] == "hello-world"
    saved = article_store.get("hello-world")
    assert saved is not None
    assert saved["title"] == "Hello World"
    assert saved["content"] == "<article><h1>t</h1></article>"
    assert saved["word_count"] == 5
    assert saved["format"] == "html"


def test_generate_failure_not_persisted(client, stub_article, article_store):
    resp = client.post("/text/article", json={"topic": "boom"})
    assert resp.status_code == 200
    assert resp.json()["success"] is False
    assert "slug" not in resp.json()
    assert article_store.list() == []


def test_list_articles_returns_metadata_only(client, stub_article, article_store):
    client.post("/text/article", json={"topic": "First Post"})
    client.post("/text/article", json={"topic": "Second Post"})
    resp = client.get("/text/articles")
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert [a["slug"] for a in body["articles"]] == ["second-post", "first-post"]
    for item in body["articles"]:
        assert "content" not in item
        assert item["title"]


def test_get_article_by_slug(client, stub_article, article_store):
    client.post("/text/article", json={"topic": "Deep Dive"})
    resp = client.get("/text/articles/deep-dive")
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["article"]["title"] == "Deep Dive"
    assert body["article"]["content"] == "<article><h1>t</h1></article>"
    assert body["article"]["slug"] == "deep-dive"


def test_get_article_missing_slug_404(client, article_store):
    resp = client.get("/text/articles/does-not-exist")
    assert resp.status_code == 404
    assert "not found" in resp.json()["detail"]
