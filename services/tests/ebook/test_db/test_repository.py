import sqlite3

import pytest
from datetime import datetime


@pytest.fixture
def test_db_path(tmp_path):
    return tmp_path / "test.db"


@pytest.fixture
def db_with_tables(test_db_path):
    """Create a SQLite DB with ebook tables at test_db_path."""
    from services.ebook.db.schema import create_tables

    conn = sqlite3.connect(str(test_db_path))
    create_tables(conn)
    conn.close()
    return test_db_path


def test_create_and_get_project(db_with_tables):
    from services.ebook.db.repository import ProjectRepository

    repo = ProjectRepository(db_with_tables)
    project_id = repo.create_project(
        title="Test Ebook",
        idea="How to start a blog",
        product_mode="lead_magnet",
        target_language="en",
        chapter_count=5,
    )
    project = repo.get_project(project_id)
    assert project is not None
    assert project["title"] == "Test Ebook"
    assert project["idea"] == "How to start a blog"
    assert project["status"] == "draft"


def test_list_projects_order(db_with_tables):
    from services.ebook.db.repository import ProjectRepository

    repo = ProjectRepository(db_with_tables)
    id1 = repo.create_project(
        title="First", idea="First idea", product_mode="lead_magnet"
    )
    id2 = repo.create_project(
        title="Second", idea="Second idea", product_mode="paid_ebook"
    )
    projects = repo.list_projects()
    assert len(projects) == 2
    project_titles = [p["title"] for p in projects]
    assert "First" in project_titles
    assert "Second" in project_titles
    assert id2 > id1


def test_update_project_status(db_with_tables):
    from services.ebook.db.repository import ProjectRepository

    repo = ProjectRepository(db_with_tables)
    project_id = repo.create_project(
        title="Test",
        idea="Test idea",
        product_mode="lead_magnet",
    )
    repo.update_project_status(project_id, "completed")
    project = repo.get_project(project_id)
    assert project["status"] == "completed"
