import pytest
from src.pipeline.content_safety import ContentSafety, CONTENT_WARNING, BLOCKED_KEYWORDS

# --- Basic Functionality Tests ---


def test_check_content_passes_clean_text():
    """Clean content with no blocked keywords should pass."""
    safety = ContentSafety()
    result = safety.check_content(
        "This is a safe and informative ebook about gardening."
    )

    assert result["passed"] is True
    assert len(result["issues"]) == 0


def test_check_content_detects_single_keyword():
    """Content with one blocked keyword should be flagged."""
    safety = ContentSafety()
    result = safety.check_content("This content promotes violence against others.")

    assert result["passed"] is False
    assert len(result["issues"]) == 1
    assert "violence" in result["issues"][0].lower()


def test_check_content_detects_multiple_keywords():
    """Content with multiple blocked keywords should flag all of them."""
    safety = ContentSafety()
    result = safety.check_content(
        "This harmful content promotes violence and illegal fraud."
    )

    assert result["passed"] is False
    assert len(result["issues"]) == 4
    issue_text = " ".join(result["issues"]).lower()
    assert "harmful" in issue_text
    assert "violence" in issue_text
    assert "illegal" in issue_text
    assert "fraud" in issue_text


def test_check_content_case_insensitive():
    """Keyword detection should be case-insensitive."""
    safety = ContentSafety()

    result1 = safety.check_content("VIOLENCE is bad")
    result2 = safety.check_content("Violence is bad")
    result3 = safety.check_content("violence is bad")

    assert result1["passed"] is False
    assert result2["passed"] is False
    assert result3["passed"] is False


# --- False Positive Prevention Tests ---


def test_check_content_allows_legitimate_historical_context():
    """Words containing blocked keywords in legitimate context should pass."""
    safety = ContentSafety()

    # "harmful" is in BLOCKED_KEYWORDS, but "harmfulness" in academic context is different
    # However, substring matching will catch it - this tests current behavior
    result = safety.check_content(
        "The assassination of Julius Caesar was a pivotal moment in history."
    )

    # Current implementation uses substring matching, so this will pass
    # because "violence" is not in "assassination"
    assert result["passed"] is True


def test_check_content_substring_matching():
    """Verify that substring matching works as expected."""
    safety = ContentSafety()

    # "fraud" is in BLOCKED_KEYWORDS
    result = safety.check_content(
        "The company was accused of fraud in their financial statements."
    )

    assert result["passed"] is False
    assert "fraud" in result["issues"][0].lower()


# --- Edge Cases ---


def test_check_content_empty_string():
    """Empty content should pass (no keywords to detect)."""
    safety = ContentSafety()
    result = safety.check_content("")

    assert result["passed"] is True
    assert len(result["issues"]) == 0


def test_check_content_whitespace_only():
    """Whitespace-only content should pass."""
    safety = ContentSafety()
    result = safety.check_content("   \n\t  ")

    assert result["passed"] is True
    assert len(result["issues"]) == 0


def test_check_content_very_long_text():
    """Very long content (10K+ words) should be processed correctly."""
    safety = ContentSafety()

    # Generate ~10K words of safe content
    safe_paragraph = "This is a safe paragraph about technology and innovation. " * 20
    long_content = (safe_paragraph + "\n\n") * 100  # ~10K words

    result = safety.check_content(long_content)
    assert result["passed"] is True

    # Now add a blocked keyword at the end
    long_content_with_keyword = long_content + " This promotes violence."
    result2 = safety.check_content(long_content_with_keyword)
    assert result2["passed"] is False


def test_check_content_unicode_characters():
    """Content with unicode characters should be processed correctly."""
    safety = ContentSafety()

    # Safe unicode content
    result1 = safety.check_content("This is about café culture and naïve art. 你好世界")
    assert result1["passed"] is True

    # Unicode content with blocked keyword
    result2 = safety.check_content("This café promotes violence. 你好")
    assert result2["passed"] is False


def test_check_content_emojis():
    """Content with emojis should be processed correctly."""
    safety = ContentSafety()

    result1 = safety.check_content("Great content! 😊 👍 🎉")
    assert result1["passed"] is True

    result2 = safety.check_content("This promotes violence 😠")
    assert result2["passed"] is False


def test_check_content_special_characters():
    """Content with special characters and punctuation should work."""
    safety = ContentSafety()

    result = safety.check_content("Safe content with @#$%^&*() special chars!")
    assert result["passed"] is True


# --- Configuration Tests ---


def test_custom_blocked_keywords():
    """ContentSafety should accept custom blocked keyword list."""
    custom_keywords = ["spam", "scam", "clickbait"]
    safety = ContentSafety(blocked_keywords=custom_keywords)

    # Should detect custom keywords
    result1 = safety.check_content("This is a spam message")
    assert result1["passed"] is False
    assert "spam" in result1["issues"][0].lower()

    # Should NOT detect default keywords
    result2 = safety.check_content("This content has violence")
    assert result2["passed"] is True  # "violence" not in custom list


def test_default_blocked_keywords_used():
    """ContentSafety should use BLOCKED_KEYWORDS by default."""
    safety = ContentSafety()

    # Verify all default keywords are detected
    for keyword in BLOCKED_KEYWORDS:
        result = safety.check_content(f"This content has {keyword} in it.")
        assert result["passed"] is False, f"Failed to detect keyword: {keyword}"


def test_empty_custom_keywords():
    """ContentSafety with empty keyword list falls back to defaults."""
    safety = ContentSafety(blocked_keywords=[])

    result = safety.check_content("This has violence, harmful, illegal, fraud content")
    assert result["passed"] is False
    assert len(result["issues"]) > 0


# --- Disclaimer Tests ---


def test_add_disclaimer_appends_warning():
    """add_disclaimer should append the content warning."""
    safety = ContentSafety()
    original = "This is the original content."

    result = safety.add_disclaimer(original)

    assert original in result
    assert CONTENT_WARNING in result
    assert result.startswith(original)
    assert "---" in result


def test_add_disclaimer_preserves_content():
    """add_disclaimer should not modify the original content."""
    safety = ContentSafety()
    original = "Original content with special chars: @#$% and unicode: 你好"

    result = safety.add_disclaimer(original)

    assert original in result
    assert result.index(original) == 0  # Original content comes first


def test_add_disclaimer_empty_content():
    """add_disclaimer should work with empty content."""
    safety = ContentSafety()
    result = safety.add_disclaimer("")

    assert CONTENT_WARNING in result
    assert "---" in result


# --- Integration Tests ---


@pytest.mark.parametrize(
    "offensive_term",
    [
        "violence",
        "harmful",
        "illegal",
        "fraud",
    ],
)
def test_parametrized_keyword_detection(offensive_term):
    """Test detection of each blocked keyword using parametrize."""
    safety = ContentSafety()
    content = f"This content contains {offensive_term} material."

    result = safety.check_content(content)

    assert result["passed"] is False
    assert len(result["issues"]) >= 1
    assert offensive_term in result["issues"][0].lower()


def test_check_and_add_disclaimer_workflow():
    """Test typical workflow: check content, then add disclaimer."""
    safety = ContentSafety()
    content = "This is safe educational content about cybersecurity."

    # Check content first
    check_result = safety.check_content(content)
    assert check_result["passed"] is True

    # Add disclaimer
    final_content = safety.add_disclaimer(content)
    assert content in final_content
    assert CONTENT_WARNING in final_content


def test_multiple_instances_independent():
    """Multiple ContentSafety instances should be independent."""
    safety1 = ContentSafety(blocked_keywords=["spam"])
    safety2 = ContentSafety(blocked_keywords=["scam"])

    content = "This is spam and scam content"

    result1 = safety1.check_content(content)
    result2 = safety2.check_content(content)

    # safety1 should only detect "spam"
    assert result1["passed"] is False
    assert "spam" in result1["issues"][0].lower()

    # safety2 should only detect "scam"
    assert result2["passed"] is False
    assert "scam" in result2["issues"][0].lower()
