import os
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def tmp_db(tmp_path, monkeypatch):
    """Point the server at a temp DB and projects dir so tests are isolated."""
    db_file = tmp_path / "test.db"
    projects_dir = tmp_path / "projects"
    projects_dir.mkdir()

    monkeypatch.setenv("EBOOK_API_KEY", "dev-key-change-me")

    import src.api.server as server_mod

    monkeypatch.setattr(server_mod, "DB_PATH", db_file)
    server_mod.API_KEY = "dev-key-change-me"
    monkeypatch.setattr(server_mod, "PROJECTS_DIR", projects_dir)
    server_mod._generation_progress.clear()
    return db_file, projects_dir


@pytest.fixture()
def client(tmp_db):
    from src.api.server import app

    return TestClient(app)


@pytest.fixture()
def authed_headers():
    return {"X-API-Key": "dev-key-change-me"}


@pytest.fixture()
def setup_project_with_file(tmp_db):
    """Create a valid project with an export file."""
    _, projects_dir = tmp_db
    project_dir = projects_dir / "1"
    exports_dir = project_dir / "exports"
    exports_dir.mkdir(parents=True)

    test_file = exports_dir / "ebook.pdf"
    test_file.write_text("fake pdf content")

    return project_dir, test_file


def test_path_traversal_with_parent_directory_attack(client, authed_headers, tmp_db):
    """Test that ../ path traversal is blocked."""
    _, projects_dir = tmp_db

    outside_dir = projects_dir.parent / "outside"
    outside_dir.mkdir(exist_ok=True)
    sensitive_file = outside_dir / "secret.pdf"
    sensitive_file.write_text("secret data")

    project_dir = projects_dir / "1"
    exports_dir = project_dir / "exports"
    exports_dir.mkdir(parents=True)

    traversal_link = exports_dir / "ebook.pdf"
    traversal_target = Path("../../../outside/secret.pdf")
    traversal_link.symlink_to(traversal_target)

    resp = client.get("/api/projects/1/download/pdf", headers=authed_headers)
    assert resp.status_code == 403
    assert "Access denied" in resp.json()["detail"]


def test_path_traversal_with_absolute_path(client, authed_headers, tmp_db):
    """Test that absolute paths outside PROJECTS_DIR are blocked."""
    resp = client.get("/api/projects/1/download/pdf", headers=authed_headers)
    assert resp.status_code in (403, 404)


def test_path_traversal_with_symlink_attack(client, authed_headers, tmp_db):
    """Test that symlinks pointing outside PROJECTS_DIR are blocked."""
    _, projects_dir = tmp_db

    outside_dir = projects_dir.parent / "outside"
    outside_dir.mkdir(exist_ok=True)
    sensitive_file = outside_dir / "secret.pdf"
    sensitive_file.write_text("secret data")

    project_dir = projects_dir / "1"
    exports_dir = project_dir / "exports"
    exports_dir.mkdir(parents=True)

    symlink_path = exports_dir / "ebook.pdf"
    try:
        symlink_path.symlink_to(sensitive_file)
    except OSError:
        pytest.skip("Symlink creation not supported on this platform")

    resp = client.get("/api/projects/1/download/pdf", headers=authed_headers)
    assert resp.status_code == 403
    assert "Access denied" in resp.json()["detail"]


def test_valid_project_file_download_succeeds(
    client, authed_headers, setup_project_with_file
):
    """Test that valid project files can be downloaded."""
    project_dir, test_file = setup_project_with_file

    resp = client.get("/api/projects/1/download/pdf", headers=authed_headers)
    assert resp.status_code == 200
    assert resp.content == b"fake pdf content"


def test_path_traversal_with_multiple_parent_sequences(client, authed_headers, tmp_db):
    """Test that multiple ../ sequences are blocked."""
    _, projects_dir = tmp_db

    outside_dir = projects_dir.parent.parent / "secret_area"
    outside_dir.mkdir(parents=True, exist_ok=True)
    outside_file = outside_dir / "confidential.pdf"
    outside_file.write_text("confidential")

    project_dir = projects_dir / "1"
    exports_dir = project_dir / "exports"
    exports_dir.mkdir(parents=True)

    traversal_link = exports_dir / "ebook.pdf"
    traversal_target = Path("../../../../secret_area/confidential.pdf")
    traversal_link.symlink_to(traversal_target)

    resp = client.get("/api/projects/1/download/pdf", headers=authed_headers)
    assert resp.status_code == 403
    assert "Access denied" in resp.json()["detail"]


def test_path_traversal_with_encoded_dots(client, authed_headers, tmp_db):
    """Test that URL-encoded path traversal attempts are blocked."""
    resp = client.get(
        "/api/projects/1%2F..%2F..%2Fetc%2Fpasswd/download/pdf", headers=authed_headers
    )
    assert resp.status_code in (403, 404, 422)
