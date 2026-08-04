"""API tests for the podcast router (POST /audio/podcast).

PodcastEngine is stubbed via ``di._instances`` so tests cover routing /
validation / passthrough without running TTS or ffmpeg.
"""
import pytest

import services.di as di


class _StubPodcast:
    def generate(self, **kwargs):
        return {
            "success": True,
            "audio_path": "/tmp/podcast_episode.mp3",
            "title": kwargs.get("title"),
            "segments": len(kwargs.get("segments") or []),
            "language": kwargs.get("language"),
            "output_dir": kwargs.get("output_dir"),
            "kwargs": kwargs,
        }


@pytest.fixture
def stub_podcast(monkeypatch):
    stub = _StubPodcast()
    monkeypatch.setitem(di._instances, "podcast", stub)
    return stub


def test_generate_missing_segments_returns_422(client):
    resp = client.post("/audio/podcast", json={})
    assert resp.status_code == 422


def test_generate_success_passthrough(client, stub_podcast):
    resp = client.post(
        "/audio/podcast",
        json={
            "title": "Ngobrol AI",
            "segments": [
                {"speaker": "host", "text": "Halo semuanya", "voice": "id-ID-ArdiNeural", "rate": "+10%"},
                {"speaker": "guest", "text": "Halo, terima kasih sudah diundang"},
            ],
            "music_style": "lofi",
            "language": "id",
            "output_dir": "/tmp/podcast_out",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["title"] == "Ngobrol AI"
    assert body["segments"] == 2
    kwargs = body["kwargs"]
    assert len(kwargs["segments"]) == 2
    assert kwargs["segments"][0] == {
        "speaker": "host",
        "text": "Halo semuanya",
        "voice": "id-ID-ArdiNeural",
        "rate": "+10%",
    }
    assert kwargs["segments"][1]["speaker"] == "guest"
    assert kwargs["music_style"] == "lofi"
    assert kwargs["language"] == "id"
    assert kwargs["output_dir"] == "/tmp/podcast_out"


def test_generate_defaults_forwarded(client, stub_podcast):
    resp = client.post(
        "/audio/podcast",
        json={"segments": [{"text": "Segmen satu"}]},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["title"] == "Podcast Episode"
    kwargs = body["kwargs"]
    assert kwargs["music_style"] is None
    assert kwargs["language"] == "id"
    assert kwargs["output_dir"] is None
    assert kwargs["segments"] == [{"speaker": "narrator", "text": "Segmen satu", "voice": None, "rate": None}]


def test_engine_has_no_module_level_di_import():
    """services.di / get_tts / get_music must only be imported lazily inside methods."""
    import services.podcast.engine as engine_mod

    assert not hasattr(engine_mod, "get_tts")
    assert not hasattr(engine_mod, "get_music")
    assert "services.di" not in vars(engine_mod)
