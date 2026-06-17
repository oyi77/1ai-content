import json
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from src.pipeline.marketing_kit import MarketingKitGenerator


def _make_outline(word_count: int, mode: str = "") -> dict:
    return {"chapters": [{"title": "Chapter 1", "estimated_word_count": word_count}]}


def _make_strategy(product_mode: str) -> dict:
    return {
        "product_mode": product_mode,
        "audience": "Test audience",
        "tone": "conversational",
        "promise": "Test promise",
    }


# --- Pricing tests (no AI needed) ---


def test_pricing_lead_magnet(temp_project_dir):
    gen = MarketingKitGenerator(ai_client=MagicMock(), projects_dir=temp_project_dir)
    price = gen._compute_price("lead_magnet", 5000)
    assert price == "Free"


def test_pricing_paid_ebook_short(temp_project_dir):
    gen = MarketingKitGenerator(ai_client=MagicMock(), projects_dir=temp_project_dir)
    price = gen._compute_price("paid_ebook", 8000)
    assert price == "$7.99"


def test_pricing_paid_ebook_medium(temp_project_dir):
    gen = MarketingKitGenerator(ai_client=MagicMock(), projects_dir=temp_project_dir)
    price = gen._compute_price("paid_ebook", 20000)
    assert price == "$14.99"


def test_pricing_paid_ebook_long(temp_project_dir):
    gen = MarketingKitGenerator(ai_client=MagicMock(), projects_dir=temp_project_dir)
    price = gen._compute_price("paid_ebook", 30000)
    assert price == "$19.99"


def test_pricing_novel_short(temp_project_dir):
    gen = MarketingKitGenerator(ai_client=MagicMock(), projects_dir=temp_project_dir)
    price = gen._compute_price("novel", 20000)
    assert price == "$2.99"


def test_pricing_authority(temp_project_dir):
    gen = MarketingKitGenerator(ai_client=MagicMock(), projects_dir=temp_project_dir)
    price = gen._compute_price("authority", 15000)
    assert price == "$24.99"


# --- Integration tests ---


def test_generate_saves_file(
    mock_ai_client, sample_strategy, sample_outline, temp_project_dir
):
    mock_ai_client.generate_structured.return_value = {
        "book_description": "A great book about blogging.",
        "keywords": ["blog", "content", "SEO", "writing", "marketing"],
        "ad_hooks": ["Hook 1", "Hook 2", "Hook 3"],
        "social_posts": {
            "facebook": "Check out this book!",
            "instagram": "New ebook alert!",
            "tiktok": "Must-read ebook",
        },
        "audience_persona": "A motivated small business owner.",
    }

    gen = MarketingKitGenerator(ai_client=mock_ai_client, projects_dir=temp_project_dir)
    kit = gen.generate(
        project_id=42,
        title="Test Ebook",
        strategy=sample_strategy,
        outline=sample_outline,
    )

    kit_file = temp_project_dir / "42" / "marketing_kit.json"
    assert kit_file.exists(), "marketing_kit.json was not saved"

    with open(kit_file) as f:
        saved = json.load(f)

    required_keys = {
        "book_description",
        "keywords",
        "ad_hooks",
        "social_posts",
        "suggested_price",
        "audience_persona",
    }
    assert (
        required_keys <= saved.keys()
    ), f"Missing keys: {required_keys - saved.keys()}"


def test_graceful_degradation(sample_strategy, sample_outline, temp_project_dir):
    failing_client = MagicMock()
    failing_client.generate_structured.side_effect = Exception("AI service unavailable")

    strategy = dict(sample_strategy)
    strategy["product_mode"] = "paid_ebook"

    gen = MarketingKitGenerator(ai_client=failing_client, projects_dir=temp_project_dir)
    kit = gen.generate(
        project_id=99,
        title="Fallback Ebook",
        strategy=strategy,
        outline=sample_outline,
    )

    assert isinstance(kit, dict), "generate() must return a dict even on AI failure"
    assert (
        "suggested_price" in kit
    ), "suggested_price must be present even on AI failure"
    assert kit["suggested_price"] != "", "suggested_price must be non-empty"

    kit_file = temp_project_dir / "99" / "marketing_kit.json"
    assert kit_file.exists(), "marketing_kit.json must be saved even on AI failure"
