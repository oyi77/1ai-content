import sqlite3
from contextlib import contextmanager
from pathlib import Path

import pytest


@pytest.fixture
def test_db_path(tmp_path):
    return tmp_path / "test.db"


@pytest.fixture
def db_manager(test_db_path):
    from services.ebook.db.database import DatabaseManager

    return DatabaseManager(test_db_path)


def test_database_context_manager(test_db_path):
    """Connection is returned and a simple query works."""
    from services.ebook.db.database import DatabaseManager

    dm = DatabaseManager(test_db_path)
    with dm.get_connection() as conn:
        assert conn is not None
        cursor = conn.cursor()
        cursor.execute("SELECT 1")
        assert cursor.fetchone() is not None


def test_database_creates_tables(test_db_path):
    """Tables can be created and discovered via schema introspection."""
    from services.ebook.db.database import DatabaseManager
    from services.ebook.db.schema import create_tables

    dm = DatabaseManager(test_db_path)
    with dm.get_connection() as conn:
        create_tables(conn)
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = [row[0] for row in cursor.fetchall()]
        assert "projects" in tables
        assert "jobs" in tables
