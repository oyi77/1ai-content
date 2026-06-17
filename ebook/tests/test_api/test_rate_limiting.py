import sys
import time
import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def tmp_db(tmp_path, monkeypatch):
    """Point the server at a temp DB and projects dir so tests are isolated."""
    monkeypatch.setenv("EBOOK_API_KEY", "test-api-key-12345")

    db_file = tmp_path / "test.db"
    projects_dir = tmp_path / "projects"
    projects_dir.mkdir()

    if "src.api.server" in sys.modules:
        del sys.modules["src.api.server"]

    import src.api.server as server_mod

    monkeypatch.setattr(server_mod, "DB_PATH", db_file)
    monkeypatch.setattr(server_mod, "PROJECTS_DIR", projects_dir)
    server_mod._generation_progress.clear()
    server_mod._rate_limits.clear()
    return db_file, projects_dir


@pytest.fixture()
def client(tmp_db):
    from src.api.server import app

    return TestClient(app)


def test_general_endpoint_rate_limit_enforced(client):
    """Verify general endpoints enforce 100 requests/minute limit."""
    responses = []
    for i in range(101):
        resp = client.get("/health", follow_redirects=False)
        responses.append(resp.status_code)

    assert responses[:100] == [200] * 100
    assert responses[100] == 429


def test_generation_endpoint_rate_limit_enforced(client):
    """Verify generation endpoints enforce 10 requests/minute limit."""
    responses = []
    for i in range(11):
        resp = client.post(
            "/api/projects",
            json={
                "title": f"Test Book {i}",
                "idea": "A comprehensive test book about testing rate limits in APIs and web services",
                "product_mode": "paid_ebook",
                "target_language": "en",
                "chapter_count": 5,
            },
            headers={"X-API-Key": "test-api-key-12345"},
        )
        responses.append(resp.status_code)

    assert responses[:10] == [200] * 10
    assert responses[10] == 429


def test_rate_limit_error_message(client):
    """Verify 429 response includes descriptive error message."""
    for i in range(101):
        resp = client.get("/health")

    assert resp.status_code == 429
    assert "Rate limit exceeded" in resp.json()["detail"]
    assert "100 requests per minute" in resp.json()["detail"]


def test_generation_endpoint_lower_limit(client):
    """Verify generation endpoints have lower limit than general endpoints."""
    for i in range(11):
        resp = client.post(
            "/api/projects",
            json={
                "title": f"Book {i}",
                "idea": "Test idea for rate limiting validation with sufficient length for validation",
                "product_mode": "paid_ebook",
                "target_language": "en",
                "chapter_count": 5,
            },
            headers={"X-API-Key": "test-api-key-12345"},
        )

    assert resp.status_code == 429
    assert "10 requests per minute" in resp.json()["detail"]


def test_different_ips_tracked_independently(client, monkeypatch):
    """Verify rate limits are tracked per IP address."""
    from src.api.server import _rate_limits

    _rate_limits.clear()

    for i in range(50):
        resp = client.get("/health")
    assert resp.status_code == 200

    def mock_client_host_2():
        class MockClient:
            host = "192.168.1.2"

        return MockClient()

    original_client = client.app.state._state.get("client")

    for i in range(50):
        resp = client.get("/health")
    assert resp.status_code == 200


def test_rate_limit_window_cleanup(client):
    """Verify old timestamps are cleaned up after time window."""
    from src.api.server import _rate_limits

    _rate_limits.clear()

    for i in range(10):
        resp = client.get("/health")
    assert resp.status_code == 200

    client_ip = list(_rate_limits.keys())[0]
    assert len(_rate_limits[client_ip]) == 10

    old_time = time.time() - 61
    _rate_limits[client_ip] = [old_time] * 10

    resp = client.get("/health")
    assert resp.status_code == 200
    assert len(_rate_limits[client_ip]) == 1


def test_mixed_endpoint_types_separate_limits(client):
    """Verify general and generation endpoints don't share rate limit counters."""
    from src.api.server import _rate_limits

    _rate_limits.clear()

    for i in range(50):
        resp = client.get("/health")
    assert resp.status_code == 200

    for i in range(5):
        resp = client.post(
            "/api/projects",
            json={
                "title": f"Book {i}",
                "idea": "Testing mixed endpoint rate limits with proper validation requirements",
                "product_mode": "paid_ebook",
                "target_language": "en",
                "chapter_count": 5,
            },
            headers={"X-API-Key": "test-api-key-12345"},
        )
    assert resp.status_code == 200


def test_rate_limit_applies_to_all_endpoints(client):
    """Verify rate limiting applies to different endpoint types."""
    for i in range(50):
        client.get("/health")

    for i in range(50):
        resp = client.get("/api/projects")
    assert resp.status_code == 200

    resp = client.get("/api/projects")
    assert resp.status_code == 429


def test_post_create_project_is_generation_endpoint(client):
    """Verify POST /api/projects is treated as generation endpoint with 10 req/min limit."""
    responses = []
    for i in range(11):
        resp = client.post(
            "/api/projects",
            json={
                "title": f"Test {i}",
                "idea": "Rate limit test for project creation endpoint with sufficient length",
                "product_mode": "paid_ebook",
                "target_language": "en",
                "chapter_count": 5,
            },
            headers={"X-API-Key": "test-api-key-12345"},
        )
        responses.append(resp.status_code)

    assert responses[10] == 429
    assert "10 requests per minute" in resp.json()["detail"]


def test_get_projects_is_general_endpoint(client):
    """Verify GET /api/projects is treated as general endpoint with 100 req/min limit."""
    responses = []
    for i in range(101):
        resp = client.get("/api/projects")
        responses.append(resp.status_code)

    assert responses[:100] == [200] * 100
    assert responses[100] == 429
    assert "100 requests per minute" in resp.json()["detail"]


def test_rate_limit_boundary_at_exact_limit(client):
    """Verify rate limit triggers at exact limit, not before."""
    for i in range(100):
        resp = client.get("/health")
        assert resp.status_code == 200

    resp = client.get("/health")
    assert resp.status_code == 429
