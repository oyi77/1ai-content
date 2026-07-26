"""Health and smoke tests for the FastAPI application."""
from fastapi import status


def test_app_health(client):
    """GET /health returns 200 with status."""
    resp = client.get("/health")
    assert resp.status_code == status.HTTP_200_OK
    data = resp.json()
    assert data.get("status") == "ok"


def test_app_docs(client):
    """OpenAPI docs are served at /docs."""
    resp = client.get("/docs")
    assert resp.status_code == status.HTTP_200_OK
    assert b"swagger" in resp.content.lower() or b"openapi" in resp.content.lower()


def test_openapi_schema(client):
    """OpenAPI schema is valid JSON with paths."""
    resp = client.get("/openapi.json")
    assert resp.status_code == status.HTTP_200_OK
    schema = resp.json()
    assert "paths" in schema
    assert len(schema["paths"]) > 0
