from unittest.mock import MagicMock, patch

import pytest


@pytest.fixture
def mock_ai_client():
    client = MagicMock()
    client.generate_structured = MagicMock(
        return_value={
            "audience": "Small business owners",
            "pain_points": ["no time", "no expertise"],
            "promise": "save 10hrs/week",
            "positioning": "practical guide",
            "tone": "conversational",
            "goal": "email signup",
        }
    )
    return client


def test_generate_strategy_returns_all_fields(mock_ai_client):
    from src.pipeline.strategy_planner import StrategyPlanner

    planner = StrategyPlanner(mock_ai_client)
    project_brief = {
        "id": 1,
        "idea": "How to start a blog",
        "product_mode": "lead_magnet",
        "target_language": "en",
    }
    strategy = planner.generate(project_brief)

    assert "audience" in strategy
    assert "pain_points" in strategy
    assert "promise" in strategy
    assert "positioning" in strategy
    assert "tone" in strategy
    assert "goal" in strategy


def test_strategy_differs_by_product_mode():
    from src.ai_client import OmnirouteClient
    from src.pipeline.strategy_planner import StrategyPlanner

    strategies = {}
    for mode in ["lead_magnet", "paid_ebook"]:
        client = OmnirouteClient(base_url="http://test/v1")
        with patch.object(client.client, "chat") as mock:
            mock.completions.create.return_value = MagicMock(
                choices=[
                    MagicMock(
                        message=MagicMock(
                            content='{"audience": "test", "pain_points": [], "promise": "test", "positioning": "test", "tone": "'
                            + mode
                            + '", "goal": "test"}'
                        )
                    )
                ]
            )
            planner = StrategyPlanner(client)
            result = planner.generate(
                {"id": 1, "idea": "test", "product_mode": mode, "target_language": "en"}
            )
            strategies[mode] = result["tone"]

    assert strategies["lead_magnet"] != strategies["paid_ebook"]


def test_strategy_saved_to_project_directory(test_db_path, temp_project_dir):
    from src.ai_client import OmnirouteClient
    from src.pipeline.strategy_planner import StrategyPlanner
    from src.db.repository import ProjectRepository

    repo = ProjectRepository(test_db_path)
    project_id = repo.create_project(
        title="Test", idea="Test idea", product_mode="lead_magnet"
    )

    client = OmnirouteClient(base_url="http://test/v1")
    with patch.object(client.client, "chat") as mock:
        mock.completions.create.return_value = MagicMock(
            choices=[
                MagicMock(
                    message=MagicMock(
                        content='{"audience": "test", "pain_points": [], "promise": "test", "positioning": "test", "tone": "test", "goal": "test"}'
                    )
                )
            ]
        )
        planner = StrategyPlanner(client, projects_dir=temp_project_dir)
        planner.generate(
            {
                "id": project_id,
                "idea": "Test",
                "product_mode": "lead_magnet",
                "target_language": "en",
            }
        )

        import json

        strategy_file = temp_project_dir / str(project_id) / "strategy.json"
        assert strategy_file.exists()
