import os
import sys
import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def tmp_db(tmp_path, monkeypatch):
    """Point the server at a temp DB and projects dir so tests are isolated."""
    monkeypatch.setenv("EBOOK_API_KEY", "dev-key-change-me")

    db_file = tmp_path / "test.db"
    projects_dir = tmp_path / "projects"
    projects_dir.mkdir()

    if "src.api.server" in sys.modules:
        del sys.modules["src.api.server"]

    import src.api.server as server_mod

    monkeypatch.setattr(server_mod, "DB_PATH", db_file)
    monkeypatch.setattr(server_mod, "PROJECTS_DIR", projects_dir)
    server_mod._generation_progress.clear()
    return db_file, projects_dir


@pytest.fixture()
def client(tmp_db):
    from src.api.server import app

    return TestClient(app)


def test_security_header_x_content_type_options(client):
    """Verify X-Content-Type-Options header is present and set to nosniff."""
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.headers.get("X-Content-Type-Options") == "nosniff"


def test_security_header_x_frame_options(client):
    """Verify X-Frame-Options header is present and set to DENY."""
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.headers.get("X-Frame-Options") == "DENY"


def test_security_header_x_xss_protection(client):
    """Verify X-XSS-Protection header is present and set to 1; mode=block."""
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.headers.get("X-XSS-Protection") == "1; mode=block"


def test_security_header_strict_transport_security(client):
    """Verify Strict-Transport-Security header is present."""
    resp = client.get("/health")
    assert resp.status_code == 200
    hsts = resp.headers.get("Strict-Transport-Security")
    assert hsts is not None
    assert "max-age=31536000" in hsts
    assert "includeSubDomains" in hsts


def test_security_header_content_security_policy(client):
    """Verify Content-Security-Policy header is present with restrictive policy."""
    resp = client.get("/health")
    assert resp.status_code == 200
    csp = resp.headers.get("Content-Security-Policy")
    assert csp is not None
    assert "default-src 'self'" in csp
    assert "script-src 'self'" in csp
    assert "style-src 'self'" in csp


def test_cors_preflight_request(client):
    """Verify CORS preflight request is handled correctly."""
    resp = client.options(
        "/health",
        headers={
            "Origin": "http://localhost:8501",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert resp.status_code == 200
    assert "access-control-allow-origin" in resp.headers


def test_cors_allows_localhost_8501(client):
    """Verify CORS allows requests from localhost:8501."""
    resp = client.get(
        "/health",
        headers={"Origin": "http://localhost:8501"},
    )
    assert resp.status_code == 200
    assert resp.headers.get("access-control-allow-origin") == "http://localhost:8501"


def test_security_headers_on_api_endpoint(client):
    """Verify security headers are present on API endpoints."""
    resp = client.get("/api/projects")
    assert resp.status_code == 200
    assert resp.headers.get("X-Content-Type-Options") == "nosniff"
    assert resp.headers.get("X-Frame-Options") == "DENY"
    assert resp.headers.get("X-XSS-Protection") == "1; mode=block"
    assert resp.headers.get("Strict-Transport-Security") is not None
    assert resp.headers.get("Content-Security-Policy") is not None
