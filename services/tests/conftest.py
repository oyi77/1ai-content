"""Shared fixtures for 1ai-content Python service tests."""
import os

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault(
    "OMNIROUTE_BASE_URL", "http://localhost:20128/v1"
)
os.environ.setdefault(
    "OMNIROUTE_API_KEY", "sk-test-key"
)

# Import the app after setting env vars to respect defaults
from services.api import app  # noqa: E402


@pytest.fixture
def client() -> TestClient:
    """FastAPI test client against the real app."""
    return TestClient(app)
