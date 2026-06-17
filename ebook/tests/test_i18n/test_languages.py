import pytest
from src.i18n.languages import SUPPORTED_LANGUAGES, language_instruction, is_rtl


def test_supported_languages_count():
    assert len(SUPPORTED_LANGUAGES) >= 45


def test_new_languages_included():
    expected = [
        "vi",
        "th",
        "it",
        "nl",
        "pl",
        "bn",
        "sw",
        "tl",
        "sv",
        "ko",
        "ms",
        "uk",
        "el",
    ]
    for code in expected:
        assert code in SUPPORTED_LANGUAGES, f"Language '{code}' missing from registry"


def test_all_entries_have_required_fields():
    for code, meta in SUPPORTED_LANGUAGES.items():
        assert "name" in meta, f"{code}: missing 'name'"
        assert "rtl" in meta, f"{code}: missing 'rtl'"
        assert "font_hint" in meta, f"{code}: missing 'font_hint'"
        assert isinstance(meta["rtl"], bool), f"{code}: 'rtl' must be bool"


def test_indonesian_included():
    assert "id" in SUPPORTED_LANGUAGES
    assert "Indonesian" in SUPPORTED_LANGUAGES["id"]["name"]


def test_rtl_languages():
    for code in ["ar", "he", "fa", "ur"]:
        assert is_rtl(code) is True, f"{code} should be RTL"


def test_non_rtl_languages():
    for code in ["en", "id", "es", "fr", "de"]:
        assert is_rtl(code) is False, f"{code} should not be RTL"


def test_language_instruction_english():
    instr = language_instruction("en")
    assert "English" in instr


def test_language_instruction_indonesian():
    instr = language_instruction("id")
    assert "Indonesian" in instr


def test_language_instruction_unknown():
    instr = language_instruction("xx")
    assert "xx" in instr


def test_is_rtl_unknown_code():
    assert is_rtl("xx") is False
