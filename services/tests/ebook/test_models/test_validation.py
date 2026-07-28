import pytest
from pydantic import ValidationError

from services.ebook.models.validation import ProjectInput


class TestProjectInputValidation:

    def test_valid_input_minimal(self):
        data = {
            "idea": "A comprehensive guide to Python programming for beginners",
            "chapter_count": 10,
            "target_language": "en",
        }
        project = ProjectInput(**data)
        assert (
            project.idea == "A comprehensive guide to Python programming for beginners"
        )
        assert project.chapter_count == 10
        assert project.target_language == "en"
        assert project.product_mode == "paid_ebook"
        assert project.quality_level == "standard"

    def test_valid_input_full(self):
        data = {
            "idea": "Learn advanced machine learning techniques with practical examples",
            "chapter_count": 15,
            "target_language": "en",
            "product_mode": "textbook",
            "quality_level": "premium",
            "title": "Advanced ML Handbook",
        }
        project = ProjectInput(**data)
        assert (
            project.idea
            == "Learn advanced machine learning techniques with practical examples"
        )
        assert project.chapter_count == 15
        assert project.target_language == "en"
        assert project.product_mode == "textbook"
        assert project.quality_level == "premium"
        assert project.title == "Advanced ML Handbook"

    def test_idea_too_short(self):
        data = {
            "idea": "Short",
            "chapter_count": 10,
            "target_language": "en",
        }
        with pytest.raises(ValidationError) as exc_info:
            ProjectInput(**data)
        assert "at least 10 characters" in str(exc_info.value).lower()

    def test_idea_too_long(self):
        data = {
            "idea": "x" * 5001,
            "chapter_count": 10,
            "target_language": "en",
        }
        with pytest.raises(ValidationError) as exc_info:
            ProjectInput(**data)
        assert "5000" in str(exc_info.value)

    def test_idea_empty_string(self):
        data = {
            "idea": "",
            "chapter_count": 10,
            "target_language": "en",
        }
        with pytest.raises(ValidationError) as exc_info:
            ProjectInput(**data)
        assert "at least 10 characters" in str(exc_info.value).lower()

    def test_idea_whitespace_only(self):
        data = {
            "idea": "          ",
            "chapter_count": 10,
            "target_language": "en",
        }
        with pytest.raises(ValidationError) as exc_info:
            ProjectInput(**data)
        assert "at least 10 characters" in str(exc_info.value).lower()

    def test_idea_strips_whitespace(self):
        data = {
            "idea": "   A guide to web development with modern frameworks   ",
            "chapter_count": 10,
            "target_language": "en",
        }
        project = ProjectInput(**data)
        assert project.idea == "A guide to web development with modern frameworks"

    def test_idea_boundary_min_valid(self):
        data = {
            "idea": "1234567890",
            "chapter_count": 10,
            "target_language": "en",
        }
        project = ProjectInput(**data)
        assert len(project.idea) == 10

    def test_idea_boundary_max_valid(self):
        data = {
            "idea": "x" * 5000,
            "chapter_count": 10,
            "target_language": "en",
        }
        project = ProjectInput(**data)
        assert len(project.idea) == 5000

    def test_chapter_count_too_low(self):
        data = {
            "idea": "A comprehensive guide to Python programming",
            "chapter_count": 2,
            "target_language": "en",
        }
        with pytest.raises(ValidationError) as exc_info:
            ProjectInput(**data)
        assert "greater than or equal to 3" in str(exc_info.value).lower()

    def test_chapter_count_too_high(self):
        data = {
            "idea": "A comprehensive guide to Python programming",
            "chapter_count": 51,
            "target_language": "en",
        }
        with pytest.raises(ValidationError) as exc_info:
            ProjectInput(**data)
        assert "50" in str(exc_info.value)

    def test_chapter_count_boundary_min_valid(self):
        data = {
            "idea": "A comprehensive guide to Python programming",
            "chapter_count": 3,
            "target_language": "en",
        }
        project = ProjectInput(**data)
        assert project.chapter_count == 3

    def test_chapter_count_boundary_max_valid(self):
        data = {
            "idea": "A comprehensive guide to Python programming",
            "chapter_count": 50,
            "target_language": "en",
        }
        project = ProjectInput(**data)
        assert project.chapter_count == 50

    def test_invalid_language_code(self):
        data = {
            "idea": "A comprehensive guide to Python programming",
            "chapter_count": 10,
            "target_language": "xxx",
        }
        with pytest.raises(ValidationError) as exc_info:
            ProjectInput(**data)
        assert "unsupported language" in str(exc_info.value).lower()

    def test_language_code_case_insensitive(self):
        data = {
            "idea": "A comprehensive guide to Python programming",
            "chapter_count": 10,
            "target_language": "EN",
        }
        project = ProjectInput(**data)
        assert project.target_language == "en"

    def test_language_code_strips_whitespace(self):
        data = {
            "idea": "A comprehensive guide to Python programming",
            "chapter_count": 10,
            "target_language": "  es  ",
        }
        project = ProjectInput(**data)
        assert project.target_language == "es"

    def test_invalid_product_mode(self):
        data = {
            "idea": "A comprehensive guide to Python programming",
            "chapter_count": 10,
            "target_language": "en",
            "product_mode": "invalid_mode",
        }
        with pytest.raises(ValidationError) as exc_info:
            ProjectInput(**data)
        assert "invalid product mode" in str(exc_info.value).lower()

    def test_valid_product_modes(self):
        valid_modes = [
            "lead_magnet",
            "paid_ebook",
            "novel",
            "textbook",
            "academic_paper",
        ]
        for mode in valid_modes:
            data = {
                "idea": "A comprehensive guide to Python programming",
                "chapter_count": 10,
                "target_language": "en",
                "product_mode": mode,
            }
            project = ProjectInput(**data)
            assert project.product_mode == mode

    def test_invalid_quality_level(self):
        data = {
            "idea": "A comprehensive guide to Python programming",
            "chapter_count": 10,
            "target_language": "en",
            "quality_level": "ultra_premium",
        }
        with pytest.raises(ValidationError) as exc_info:
            ProjectInput(**data)
        assert "invalid quality level" in str(exc_info.value).lower()

    def test_valid_quality_levels(self):
        valid_levels = ["fast", "thorough", "draft", "standard", "premium"]
        for level in valid_levels:
            data = {
                "idea": "A comprehensive guide to Python programming",
                "chapter_count": 10,
                "target_language": "en",
                "quality_level": level,
            }
            project = ProjectInput(**data)
            assert project.quality_level == level

    def test_xss_attack_script_tag(self):
        data = {
            "idea": "<script>alert('xss')</script> A guide to web security",
            "chapter_count": 10,
            "target_language": "en",
        }
        with pytest.raises(ValidationError) as exc_info:
            ProjectInput(**data)
        assert "malicious" in str(exc_info.value).lower()

    def test_xss_attack_javascript_protocol(self):
        data = {
            "idea": "javascript:alert('xss') - A guide to web development",
            "chapter_count": 10,
            "target_language": "en",
        }
        with pytest.raises(ValidationError) as exc_info:
            ProjectInput(**data)
        assert "malicious" in str(exc_info.value).lower()

    def test_xss_attack_onerror_attribute(self):
        data = {
            "idea": "<img src=x onerror=alert('xss')> Web development guide",
            "chapter_count": 10,
            "target_language": "en",
        }
        with pytest.raises(ValidationError) as exc_info:
            ProjectInput(**data)
        assert "malicious" in str(exc_info.value).lower()

    def test_xss_attack_onload_attribute(self):
        data = {
            "idea": "<body onload=alert('xss')> Complete web guide for beginners",
            "chapter_count": 10,
            "target_language": "en",
        }
        with pytest.raises(ValidationError) as exc_info:
            ProjectInput(**data)
        assert "malicious" in str(exc_info.value).lower()

    def test_xss_attack_iframe_tag(self):
        data = {
            "idea": "<iframe src='evil.com'></iframe> Security guide for developers",
            "chapter_count": 10,
            "target_language": "en",
        }
        with pytest.raises(ValidationError) as exc_info:
            ProjectInput(**data)
        assert "malicious" in str(exc_info.value).lower()

    def test_sql_injection_drop_table(self):
        data = {
            "idea": "A guide to databases; DROP TABLE users; -- with examples",
            "chapter_count": 10,
            "target_language": "en",
        }
        with pytest.raises(ValidationError) as exc_info:
            ProjectInput(**data)
        assert "sql" in str(exc_info.value).lower()

    def test_sql_injection_delete_from(self):
        data = {
            "idea": "Database tutorial; DELETE FROM projects WHERE 1=1; --",
            "chapter_count": 10,
            "target_language": "en",
        }
        with pytest.raises(ValidationError) as exc_info:
            ProjectInput(**data)
        assert "sql" in str(exc_info.value).lower()

    def test_sql_injection_union_select(self):
        data = {
            "idea": "SQL guide' UNION SELECT password FROM users -- tutorial",
            "chapter_count": 10,
            "target_language": "en",
        }
        with pytest.raises(ValidationError) as exc_info:
            ProjectInput(**data)
        assert "sql" in str(exc_info.value).lower()

    def test_sql_injection_update_set(self):
        data = {
            "idea": "Database guide; UPDATE users SET admin=1 WHERE id=1; --",
            "chapter_count": 10,
            "target_language": "en",
        }
        with pytest.raises(ValidationError) as exc_info:
            ProjectInput(**data)
        assert "sql" in str(exc_info.value).lower()

    def test_title_too_long(self):
        data = {
            "idea": "A comprehensive guide to Python programming",
            "chapter_count": 10,
            "target_language": "en",
            "title": "x" * 201,
        }
        with pytest.raises(ValidationError) as exc_info:
            ProjectInput(**data)
        assert "200" in str(exc_info.value)

    def test_title_xss_attack(self):
        data = {
            "idea": "A comprehensive guide to Python programming",
            "chapter_count": 10,
            "target_language": "en",
            "title": "<script>alert('xss')</script>",
        }
        with pytest.raises(ValidationError) as exc_info:
            ProjectInput(**data)
        assert "malicious" in str(exc_info.value).lower()

    def test_title_none_allowed(self):
        data = {
            "idea": "A comprehensive guide to Python programming",
            "chapter_count": 10,
            "target_language": "en",
            "title": None,
        }
        project = ProjectInput(**data)
        assert project.title is None

    def test_title_empty_string_becomes_none(self):
        data = {
            "idea": "A comprehensive guide to Python programming",
            "chapter_count": 10,
            "target_language": "en",
            "title": "   ",
        }
        project = ProjectInput(**data)
        assert project.title is None

    def test_multiple_languages_supported(self):
        languages = ["en", "es", "fr", "de", "ja", "zh", "ar", "ru"]
        for lang in languages:
            data = {
                "idea": "A comprehensive guide to Python programming",
                "chapter_count": 10,
                "target_language": lang,
            }
            project = ProjectInput(**data)
            assert project.target_language == lang
