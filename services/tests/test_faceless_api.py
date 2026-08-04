"""API tests for the faceless router (/faceless/generate|product|batch).

FacelessEngine is stubbed via ``di._instances`` so tests cover routing /
validation / passthrough without running the heavy generation pipeline.
"""
import pytest

import services.di as di


class _StubFaceless:
    def generate_video(self, **kwargs):
        return {
            "success": True,
            "video_path": "/tmp/f.mp4",
            "job_id": "job-gen-1",
            "title": kwargs.get("topic"),
            "scenes_count": kwargs.get("num_scenes"),
            "platform": kwargs.get("platform"),
            "resolution": "1080x1920",
            "file_size_mb": 4.2,
            "script": "script",
            "kwargs": kwargs,
        }

    def generate_product_video(self, **kwargs):
        return {
            "success": True,
            "video_path": "/tmp/fp.mp4",
            "job_id": "job-prod-1",
            "title": kwargs.get("product_name"),
            "product": kwargs.get("product_name"),
            "scenes_count": 6,
            "platform": kwargs.get("platform"),
            "file_size_mb": 3.1,
            "seo": {"title": kwargs.get("product_name")},
            "kwargs": kwargs,
        }

    def batch_generate(self, **kwargs):
        return {
            "success": True,
            "total": 1,
            "succeeded": 1,
            "failed": 0,
            "results": [{"job_id": "job-batch-1"}],
            "kwargs": kwargs,
        }


@pytest.fixture
def stub_faceless(monkeypatch):
    stub = _StubFaceless()
    monkeypatch.setitem(di._instances, "faceless", stub)
    return stub


def test_generate_missing_topic_returns_422(client):
    resp = client.post("/faceless/generate", json={})
    assert resp.status_code == 422


def test_generate_success_passthrough(client, stub_faceless):
    resp = client.post(
        "/faceless/generate",
        json={
            "topic": "cara belajar coding",
            "style": "educational",
            "platform": "youtube",
            "language": "id",
            "num_scenes": 8,
            "use_ab_split": False,
            "add_captions": True,
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["title"] == "cara belajar coding"
    assert body["kwargs"]["platform"] == "youtube"
    assert body["kwargs"]["num_scenes"] == 8
    assert body["kwargs"]["use_ab_split"] is False
    assert body["kwargs"]["bgm_path"] is None


def test_generate_defaults_forwarded(client, stub_faceless):
    resp = client.post("/faceless/generate", json={"topic": "t"})
    assert resp.status_code == 200
    kwargs = resp.json()["kwargs"]
    assert kwargs["style"] == "educational"
    assert kwargs["platform"] == "tiktok"
    assert kwargs["language"] == "id"
    assert kwargs["num_scenes"] == 6
    assert kwargs["use_ab_split"] is True
    assert kwargs["add_captions"] is True


def test_product_missing_fields_returns_422(client):
    for payload in ({}, {"product_name": "x"}):
        resp = client.post("/faceless/product", json=payload)
        assert resp.status_code == 422


def test_product_success_passthrough(client, stub_faceless):
    resp = client.post(
        "/faceless/product",
        json={
            "product_name": "Kopi Nusantara",
            "product_desc": "Kopi robusta asli",
            "price": "Rp 25.000",
            "style": "pain_point",
            "platform": "tiktok",
            "language": "id",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["title"] == "Kopi Nusantara"
    assert body["kwargs"]["product_desc"] == "Kopi robusta asli"
    assert body["kwargs"]["price"] == "Rp 25.000"
    assert body["kwargs"]["style"] == "pain_point"


def test_batch_missing_clone_plan_returns_422(client):
    resp = client.post("/faceless/batch", json={})
    assert resp.status_code == 422


def test_batch_success_passthrough(client, stub_faceless):
    resp = client.post(
        "/faceless/batch",
        json={
            "clone_plan": {"videos": [{"topic": "a"}, {"topic": "b"}]},
            "platform": "tiktok",
            "language": "id",
            "max_videos": 2,
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["succeeded"] == 1
    assert body["kwargs"]["clone_plan"]["videos"] == [{"topic": "a"}, {"topic": "b"}]
    assert body["kwargs"]["max_videos"] == 2
