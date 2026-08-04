"""API tests for the newsletter router (/text/newsletter)."""
import pytest

import services.di as di


class _StubNewsletter:
    def generate(self, **kwargs):
        return {
            "success": True,
            "subject": "stub subject",
            "html": "<html><body>stub</body></html>",
            "plain_text": "stub",
            "sections": ["stub"],
            "word_count": 1,
            "language": kwargs.get("language"),
            "llm": False,
            "kwargs": kwargs,
        }


@pytest.fixture
def stub_newsletter(monkeypatch):
    stub = _StubNewsletter()
    monkeypatch.setitem(di._instances, "newsletter", stub)
    return stub


def test_generate_missing_topic_returns_422(client):
    resp = client.post("/text/newsletter", json={})
    assert resp.status_code == 422


def test_generate_success_passthrough(client, stub_newsletter):
    resp = client.post(
        "/text/newsletter",
        json={
            "topic": "AI marketing",
            "audience": "founders",
            "sections": 5,
            "tone": "casual",
            "language": "id",
            "brand_name": "TestCo",
            "cta_url": "https://example.com/signup",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["kwargs"]["topic"] == "AI marketing"
    assert body["kwargs"]["audience"] == "founders"
    assert body["kwargs"]["sections"] == 5
    assert body["kwargs"]["tone"] == "casual"
    assert body["kwargs"]["language"] == "id"
    assert body["kwargs"]["brand_name"] == "TestCo"
    assert body["kwargs"]["cta_url"] == "https://example.com/signup"


def test_generate_defaults_forwarded(client, stub_newsletter):
    resp = client.post("/text/newsletter", json={"topic": "gardening"})
    assert resp.status_code == 200
    kwargs = resp.json()["kwargs"]
    assert kwargs["topic"] == "gardening"
    assert kwargs["audience"] == "general"
    assert kwargs["sections"] == 3
    assert kwargs["tone"] == "professional"
    assert kwargs["language"] == "en"
    assert kwargs["brand_name"] == "1AI Content"
    assert kwargs["cta_url"] is None
