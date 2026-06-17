import pytest
from src.pipeline.intake import ProjectIntake


def test_valid_project_creates_project(test_db_path):
    intake = ProjectIntake(test_db_path)
    project = intake.create_project(
        idea="How to start a successful blog from scratch",
        product_mode="lead_magnet",
        chapter_count=5,
    )
    assert project is not None
    assert "id" in project
    assert project["status"] == "draft"
    assert project["product_mode"] == "lead_magnet"


def test_reject_too_short_idea(test_db_path):
    intake = ProjectIntake(test_db_path)
    with pytest.raises(ValueError, match="at least 10 characters"):
        intake.create_project(idea="Hi", product_mode="lead_magnet")


def test_reject_too_long_idea(test_db_path):
    intake = ProjectIntake(test_db_path)
    with pytest.raises(ValueError, match="not exceed 500 characters"):
        intake.create_project(idea="x" * 501, product_mode="lead_magnet")


def test_invalid_product_mode(test_db_path):
    intake = ProjectIntake(test_db_path)
    with pytest.raises(ValueError, match="one of:"):
        intake.create_project(
            idea="Test idea for a great ebook", product_mode="invalid"
        )


def test_default_values_applied(test_db_path):
    intake = ProjectIntake(test_db_path)
    project = intake.create_project(idea="Test idea only")
    assert project["product_mode"] == "lead_magnet"
    assert project["chapter_count"] == 5
    assert project["target_language"] == "en"


def test_idea_normalization(test_db_path):
    intake = ProjectIntake(test_db_path)
    project = intake.create_project(
        idea="  How to start a blog  ", product_mode="LEAD_MAGNET"
    )
    assert "How to start a blog" in project["idea"]
    assert project["product_mode"] == "lead_magnet"
