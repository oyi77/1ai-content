import os
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def tmp_db(tmp_path, monkeypatch):
    """Point the server at a temp DB and projects dir so tests are isolated."""
    db_file = tmp_path / "test.db"
    projects_dir = tmp_path / "projects"
    projects_dir.mkdir()

    # Set EBOOK_API_KEY before importing server module
    monkeypatch.setenv("EBOOK_API_KEY", "test-secure-key-12345")

    # Patch module-level paths in server before importing app
    import src.api.server as server_mod

    monkeypatch.setattr(server_mod, "DB_PATH", db_file)
    monkeypatch.setattr(server_mod, "PROJECTS_DIR", projects_dir)
    # Clear progress state between tests
    server_mod._generation_progress.clear()
    return db_file, projects_dir


@pytest.fixture()
def client(tmp_db):
    from src.api.server import app

    return TestClient(app)


@pytest.fixture()
def authed_headers(monkeypatch):
    test_key = "test-secure-key-12345"
    monkeypatch.setenv("EBOOK_API_KEY", test_key)
    import src.api.server as server_mod

    server_mod.API_KEY = test_key
    return {"X-API-Key": test_key}


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_health(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"


def test_list_projects_empty(client):
    resp = client.get("/api/projects")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_create_project_requires_auth(client):
    resp = client.post(
        "/api/projects",
        json={"title": "Test", "idea": "An idea about Python"},
    )
    # No key → FastAPI returns 422 (missing header) or 401 (wrong key)
    assert resp.status_code in (401, 422)


def test_create_project(client, authed_headers):
    resp = client.post(
        "/api/projects",
        json={
            "title": "My Ebook",
            "idea": "A book about AI and machine learning",
            "chapter_count": 10,
            "target_language": "en",
        },
        headers=authed_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "id" in data
    assert data["title"] == "My Ebook"


def test_get_project(client, authed_headers):
    # Create first
    create_resp = client.post(
        "/api/projects",
        json={
            "title": "Get Test",
            "idea": "Testing retrieval of project data",
            "chapter_count": 5,
            "target_language": "en",
        },
        headers=authed_headers,
    )
    assert create_resp.status_code == 200
    project_id = create_resp.json()["id"]

    # Retrieve
    resp = client.get(f"/api/projects/{project_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == project_id
    assert data["title"] == "Get Test"


def test_export_endpoint(client, authed_headers):
    # Create a project
    create_resp = client.post(
        "/api/projects",
        json={
            "title": "Export Test",
            "idea": "Export data for adforge integration",
            "chapter_count": 8,
            "target_language": "en",
        },
        headers=authed_headers,
    )
    assert create_resp.status_code == 200
    project_id = create_resp.json()["id"]

    resp = client.get(f"/api/projects/{project_id}/export")
    assert resp.status_code == 200
    data = resp.json()

    # Check all required keys are present
    required_keys = [
        "project_id",
        "title",
        "description",
        "audience",
        "tone",
        "keywords",
        "ad_hooks",
        "suggested_price",
        "word_count",
        "cover_image_base64",
        "product_mode",
    ]
    for key in required_keys:
        assert key in data, f"Missing key: {key}"

    assert data["project_id"] == project_id
    assert data["title"] == "Export Test"
    assert isinstance(data["keywords"], list)
    assert isinstance(data["ad_hooks"], list)


def test_download_not_found(client, authed_headers):
    resp = client.get(
        "/api/projects/999/download/docx",
        headers=authed_headers,
    )
    assert resp.status_code == 404


def test_api_key_required_on_startup(monkeypatch):
    """Verify that server fails to start without EBOOK_API_KEY env var."""
    # Remove EBOOK_API_KEY from environment
    monkeypatch.delenv("EBOOK_API_KEY", raising=False)

    # Reload the server module to trigger the validation check
    import sys

    if "src.api.server" in sys.modules:
        del sys.modules["src.api.server"]

    # Attempting to import should raise RuntimeError
    with pytest.raises(
        RuntimeError, match="EBOOK_API_KEY environment variable must be set"
    ):
        import src.api.server  # noqa: F401


def test_api_key_set_allows_startup(monkeypatch):
    """Verify that server starts successfully when EBOOK_API_KEY is set."""
    # Set a valid API key
    monkeypatch.setenv("EBOOK_API_KEY", "test-secure-key-12345")

    # Reload the server module
    import sys

    if "src.api.server" in sys.modules:
        del sys.modules["src.api.server"]

    # Should import without error
    import src.api.server as server_mod

    assert server_mod.API_KEY == "test-secure-key-12345"
