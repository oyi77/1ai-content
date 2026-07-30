import pytest


@pytest.fixture
def test_db_path(tmp_path):
    return tmp_path / "test.db"


@pytest.fixture
def db_with_tables(test_db_path):
    """Create a SQLite DB with ebook tables at test_db_path."""
    from services.ebook.db.database import get_engine, create_tables

    engine = get_engine(str(test_db_path))
    create_tables(engine)
    engine.dispose()
    return test_db_path


def test_update_project_blocks_malicious_id_field(db_with_tables):
    from services.ebook.db.repository import ProjectRepository

    repo = ProjectRepository(db_with_tables)
    project_id = repo.create_project(
        title="Test Project",
        idea="Test idea",
        product_mode="lead_magnet",
    )

    with pytest.raises(ValueError, match="Invalid field.*id"):
        repo.update_project(project_id, **{"id": 999})


def test_update_project_blocks_sql_injection_attempt(db_with_tables):
    from services.ebook.db.repository import ProjectRepository

    repo = ProjectRepository(db_with_tables)
    project_id = repo.create_project(
        title="Test Project",
        idea="Test idea",
        product_mode="lead_magnet",
    )

    with pytest.raises(ValueError, match="Invalid field"):
        repo.update_project(project_id, **{"status' OR '1'='1": "malicious"})


def test_update_project_blocks_python_attribute_access(db_with_tables):
    from services.ebook.db.repository import ProjectRepository

    repo = ProjectRepository(db_with_tables)
    project_id = repo.create_project(
        title="Test Project",
        idea="Test idea",
        product_mode="lead_magnet",
    )

    with pytest.raises(ValueError, match="Invalid field.*__class__"):
        repo.update_project(project_id, __class__="malicious")


def test_update_project_allows_valid_fields(db_with_tables):
    from services.ebook.db.repository import ProjectRepository

    repo = ProjectRepository(db_with_tables)
    project_id = repo.create_project(
        title="Original Title",
        idea="Original idea",
        product_mode="lead_magnet",
        chapter_count=5,
    )

    repo.update_project(
        project_id,
        title="Updated Title",
        idea="Updated idea",
        status="completed",
        chapter_count=10,
    )

    project = repo.get_project(project_id)
    assert project["title"] == "Updated Title"
    assert project["idea"] == "Updated idea"
    assert project["status"] == "completed"
    assert project["chapter_count"] == 10


def test_update_project_blocks_mixed_valid_invalid_fields(db_with_tables):
    from services.ebook.db.repository import ProjectRepository

    repo = ProjectRepository(db_with_tables)
    project_id = repo.create_project(
        title="Test Project",
        idea="Test idea",
        product_mode="lead_magnet",
    )

    with pytest.raises(ValueError, match="Invalid field.*id"):
        repo.update_project(project_id, title="Valid", id=999)

    project = repo.get_project(project_id)
    assert project["title"] == "Test Project"


def test_update_project_blocks_protected_columns(db_with_tables):
    from services.ebook.db.repository import ProjectRepository

    repo = ProjectRepository(db_with_tables)
    project_id = repo.create_project(
        title="Test Project",
        idea="Test idea",
        product_mode="lead_magnet",
    )

    with pytest.raises(ValueError, match="Invalid field.*product_mode"):
        repo.update_project(project_id, product_mode="paid_ebook")

    with pytest.raises(ValueError, match="Invalid field.*created_at"):
        repo.update_project(project_id, created_at="2020-01-01")

    with pytest.raises(ValueError, match="Invalid field.*updated_at"):
        repo.update_project(project_id, updated_at="2020-01-01")
