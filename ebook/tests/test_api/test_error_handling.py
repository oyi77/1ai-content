import sqlite3
import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest


@pytest.fixture(autouse=True)
def setup_api_key(monkeypatch):
    monkeypatch.setenv("EBOOK_API_KEY", "test-key-for-error-handling")


def test_get_available_models_missing_db(monkeypatch):
    """Test that missing DB file returns fallback list."""
    from src.api.server import _get_available_models, _OMNIROUTE_DB

    fake_db = Path("/tmp/nonexistent_omniroute.db")
    monkeypatch.setattr("src.api.server._OMNIROUTE_DB", fake_db)

    models = _get_available_models()

    assert isinstance(models, list)
    assert len(models) > 0
    assert "auto/free-chat" in models


def test_get_available_models_corrupted_db(monkeypatch, tmp_path):
    """Test that corrupted DB file logs error and returns fallback list."""
    from src.api.server import _get_available_models

    corrupted_db = tmp_path / "corrupted.db"
    corrupted_db.write_text("NOT A VALID SQLITE DATABASE")

    monkeypatch.setattr("src.api.server._OMNIROUTE_DB", corrupted_db)

    models = _get_available_models()

    assert isinstance(models, list)
    assert len(models) > 0
    assert "auto/free-chat" in models


def test_get_available_models_permission_denied(monkeypatch, tmp_path):
    """Test that permission denied logs error and returns fallback list."""
    from src.api.server import _get_available_models

    restricted_db = tmp_path / "restricted.db"
    restricted_db.touch()
    restricted_db.chmod(0o000)

    monkeypatch.setattr("src.api.server._OMNIROUTE_DB", restricted_db)

    try:
        models = _get_available_models()

        assert isinstance(models, list)
        assert len(models) > 0
        assert "auto/free-chat" in models
    finally:
        restricted_db.chmod(0o644)


def test_get_available_models_successful_read(monkeypatch, tmp_path):
    """Test successful read from valid OmniRoute DB."""
    from src.api.server import _get_available_models

    test_db = tmp_path / "test_omniroute.db"
    conn = sqlite3.connect(str(test_db))
    conn.execute("CREATE TABLE combos (name TEXT)")
    conn.execute("INSERT INTO combos (name) VALUES ('custom/model-1')")
    conn.execute("INSERT INTO combos (name) VALUES ('custom/model-2')")
    conn.commit()
    conn.close()

    monkeypatch.setattr("src.api.server._OMNIROUTE_DB", test_db)

    models = _get_available_models()

    assert models == ["custom/model-1", "custom/model-2"]


def test_get_available_models_empty_db(monkeypatch, tmp_path):
    """Test that empty DB returns fallback list."""
    from src.api.server import _get_available_models

    empty_db = tmp_path / "empty_omniroute.db"
    conn = sqlite3.connect(str(empty_db))
    conn.execute("CREATE TABLE combos (name TEXT)")
    conn.commit()
    conn.close()

    monkeypatch.setattr("src.api.server._OMNIROUTE_DB", empty_db)

    models = _get_available_models()

    assert isinstance(models, list)
    assert len(models) > 0
    assert "auto/free-chat" in models


def test_get_available_models_logs_errors(monkeypatch, tmp_path, caplog):
    """Test that errors are properly logged with context."""
    from src.api.server import _get_available_models

    corrupted_db = tmp_path / "corrupted.db"
    corrupted_db.write_text("INVALID")

    monkeypatch.setattr("src.api.server._OMNIROUTE_DB", corrupted_db)

    with caplog.at_level("WARNING"):
        models = _get_available_models()

    assert len(caplog.records) > 0
    log_record = caplog.records[0]
    assert (
        "Failed to read OmniRoute DB" in log_record.message
        or "Failed to read OmniRoute DB" in str(log_record)
    )

    assert isinstance(models, list)
    assert len(models) > 0
