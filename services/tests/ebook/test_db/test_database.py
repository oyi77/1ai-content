import pytest


@pytest.fixture
def test_db_path(tmp_path):
    return tmp_path / "test.db"


def test_database_engine_and_tables(test_db_path):
    """Engine is created and tables can be created."""
    from services.ebook.db.database import get_engine, create_tables

    engine = get_engine(str(test_db_path))
    assert engine is not None

    create_tables(engine)

    # Verify tables exist via SQLAlchemy inspector
    from sqlalchemy import inspect

    inspector = inspect(engine)
    table_names = inspector.get_table_names()
    assert "ebook_projects" in table_names
    assert "ebook_jobs" in table_names
    assert "ebook_project_metadata" in table_names
    assert "ebook_integration_logs" in table_names
