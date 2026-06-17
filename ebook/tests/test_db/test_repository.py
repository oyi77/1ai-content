import pytest
from datetime import datetime


@pytest.fixture
def test_db_path(tmp_path):
    return tmp_path / "test.db"


def test_create_and_get_project(test_db_path):
    from src.db.repository import ProjectRepository

    repo = ProjectRepository(test_db_path)
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


def test_list_projects_order(test_db_path):
    from src.db.repository import ProjectRepository

    repo = ProjectRepository(test_db_path)
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


def test_update_project_status(test_db_path):
    from src.db.repository import ProjectRepository

    repo = ProjectRepository(test_db_path)
    project_id = repo.create_project(
        title="Test",
        idea="Test idea",
        product_mode="lead_magnet",
    )
    repo.update_project_status(project_id, "completed")
    project = repo.get_project(project_id)
    assert project["status"] == "completed"
