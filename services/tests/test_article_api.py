"""API tests for the article router (/text/article).

ArticleEngine is stubbed via ``di._instances`` so tests cover routing /
validation / passthrough without running the generation pipeline.
"""
import pytest

import services.di as di


class _StubArticle:
    def generate(self, **kwargs):
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


def test_generate_missing_topic_returns_422(client):
    resp = client.post("/text/article", json={})
    assert resp.status_code == 422


def test_generate_success_passthrough(client, stub_article):
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


def test_generate_defaults_forwarded(client, stub_article):
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
