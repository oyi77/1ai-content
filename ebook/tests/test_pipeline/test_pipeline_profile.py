import pytest
from src.pipeline.pipeline_profile import PipelineProfile, PROFILES, get_profile


def test_default_profiles_exist():
    assert "lead_magnet" in PROFILES
    assert "paid_ebook" in PROFILES
    assert "novel" in PROFILES


def test_novel_profile_is_fiction():
    assert PROFILES["novel"].is_fiction is True


def test_novel_profile_has_strategy_fields():
    novel = PROFILES["novel"]
    assert "protagonist" in novel.strategy_extra_fields
    assert "antagonist" in novel.strategy_extra_fields
    assert "central_conflict" in novel.strategy_extra_fields


def test_get_profile_known_mode():
    profile = get_profile("novel")
    assert profile.is_fiction is True


def test_get_profile_unknown_mode():
    profile = get_profile("unknown_mode")
    assert profile.product_mode == "unknown_mode"
    assert profile.is_fiction is False


def test_non_fiction_profiles_not_fiction():
    for mode in ["lead_magnet", "paid_ebook", "bonus_content", "authority"]:
        assert PROFILES[mode].is_fiction is False
