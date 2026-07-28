"""
Tests for src/utils/path_validator.py

Comprehensive test coverage for PathValidator class including:
- Path validation (containment within base directory)
- File extension validation
- Filename sanitization
- Security edge cases (symlinks, traversal attempts)
"""

import pytest
from pathlib import Path
from services.ebook.utils.path_validator import PathValidator


class TestPathValidatorInit:
    """Tests for PathValidator initialization."""

    def test_init_with_path_object(self, tmp_path):
        validator = PathValidator(tmp_path)
        assert validator.base_dir == tmp_path.resolve()

    def test_init_with_string(self, tmp_path):
        validator = PathValidator(str(tmp_path))
        assert validator.base_dir == tmp_path.resolve()

    def test_init_default_projects_dir(self):
        validator = PathValidator()
        assert validator.base_dir == Path("projects").resolve()


class TestValidateProjectPath:
    """Tests for validate_project_path method."""

    def test_valid_path_within_base_dir(self, tmp_path):
        validator = PathValidator(tmp_path)
        file_path = tmp_path / "subdir" / "file.txt"
        file_path.parent.mkdir(parents=True)
        file_path.touch()

        result = validator.validate_project_path(file_path)
        assert result == file_path.resolve()

    def test_path_traversal_attack_blocked(self, tmp_path):
        validator = PathValidator(tmp_path)
        outside_dir = tmp_path.parent / "outside"
        outside_dir.mkdir(exist_ok=True)
        outside_file = outside_dir / "secret.txt"
        outside_file.touch()

        with pytest.raises(ValueError, match="Invalid file path"):
            validator.validate_project_path(outside_file)

    def test_relative_path_traversal_blocked(self, tmp_path):
        validator = PathValidator(tmp_path)
        file_path = tmp_path / "file.txt"
        file_path.touch()

        traversal_path = tmp_path / "subdir" / ".." / ".." / "outside.txt"
        with pytest.raises(ValueError, match="Invalid file path"):
            validator.validate_project_path(traversal_path)

    def test_symlink_traversal_blocked(self, tmp_path):
        validator = PathValidator(tmp_path)
        outside_dir = tmp_path.parent / "outside"
        outside_dir.mkdir(exist_ok=True)
        outside_file = outside_dir / "secret.txt"
        outside_file.touch()

        symlink = tmp_path / "link_to_outside"
        symlink.symlink_to(outside_file)

        with pytest.raises(ValueError, match="Invalid file path"):
            validator.validate_project_path(symlink)

    def test_absolute_path_outside_base_dir(self, tmp_path):
        validator = PathValidator(tmp_path)
        outside_path = tmp_path.parent / "outside" / "file.txt"

        with pytest.raises(ValueError, match="Invalid file path"):
            validator.validate_project_path(outside_path)

    def test_path_with_string_input(self, tmp_path):
        validator = PathValidator(tmp_path)
        file_path = tmp_path / "file.txt"
        file_path.touch()

        result = validator.validate_project_path(str(file_path))
        assert result == file_path.resolve()


class TestValidateFileExtension:
    """Tests for validate_file_extension method."""

    def test_valid_extension_in_allowed_set(self, tmp_path):
        validator = PathValidator(tmp_path)
        file_path = tmp_path / "document.docx"

        result = validator.validate_file_extension(file_path, {".docx", ".pdf"})
        assert result == file_path

    def test_invalid_extension_rejected(self, tmp_path):
        validator = PathValidator(tmp_path)
        file_path = tmp_path / "document.txt"

        with pytest.raises(ValueError, match="File must have one of these extensions"):
            validator.validate_file_extension(file_path, {".docx", ".pdf"})

    def test_case_insensitive_extension_matching(self, tmp_path):
        validator = PathValidator(tmp_path)
        file_path = tmp_path / "document.DOCX"

        result = validator.validate_file_extension(file_path, {".docx"})
        assert result == file_path

    def test_no_extension_rejected(self, tmp_path):
        validator = PathValidator(tmp_path)
        file_path = tmp_path / "document"

        with pytest.raises(ValueError, match="File must have an extension"):
            validator.validate_file_extension(file_path, {".docx"})

    def test_extension_validation_without_allowed_set(self, tmp_path):
        validator = PathValidator(tmp_path)
        file_path = tmp_path / "document.anything"

        result = validator.validate_file_extension(file_path)
        assert result == file_path

    def test_extension_validation_with_none_allowed_set(self, tmp_path):
        validator = PathValidator(tmp_path)
        file_path = tmp_path / "document.txt"

        result = validator.validate_file_extension(file_path, None)
        assert result == file_path

    def test_multiple_dots_in_filename(self, tmp_path):
        validator = PathValidator(tmp_path)
        file_path = tmp_path / "document.backup.docx"

        result = validator.validate_file_extension(file_path, {".docx"})
        assert result == file_path

    def test_extension_with_string_input(self, tmp_path):
        validator = PathValidator(tmp_path)

        result = validator.validate_file_extension("document.pdf", {".pdf"})
        assert result == Path("document.pdf")


class TestSanitizeFilename:
    """Tests for sanitize_filename method."""

    def test_simple_filename(self):
        validator = PathValidator()
        result = validator.sanitize_filename("document.txt")
        assert result == "document.txt"

    def test_filename_with_path_separators_removed(self):
        validator = PathValidator()
        result = validator.sanitize_filename("subdir/document.txt")
        assert result == "document.txt"

    def test_filename_with_multiple_path_components(self):
        validator = PathValidator()
        result = validator.sanitize_filename("subdir/nested/document.txt")
        assert result == "document.txt"

    def test_relative_path_traversal_removed(self):
        validator = PathValidator()
        result = validator.sanitize_filename("../../../etc/passwd")
        assert result == "passwd"

    def test_dot_filename_rejected(self):
        validator = PathValidator()
        with pytest.raises(ValueError, match="Invalid filename"):
            validator.sanitize_filename(".")

    def test_double_dot_filename_rejected(self):
        validator = PathValidator()
        with pytest.raises(ValueError, match="Invalid filename"):
            validator.sanitize_filename("..")

    def test_empty_filename_rejected(self):
        validator = PathValidator()
        with pytest.raises(ValueError, match="Filename cannot be empty"):
            validator.sanitize_filename("")

    def test_whitespace_only_filename_rejected(self):
        validator = PathValidator()
        with pytest.raises(ValueError, match="Filename cannot be empty"):
            validator.sanitize_filename("   ")

    def test_filename_with_spaces(self):
        validator = PathValidator()
        result = validator.sanitize_filename("my document.txt")
        assert result == "my document.txt"

    def test_filename_with_special_characters(self):
        validator = PathValidator()
        result = validator.sanitize_filename("document-2026_04_21.pdf")
        assert result == "document-2026_04_21.pdf"


class TestIntegration:
    """Integration tests combining multiple validation methods."""

    def test_full_validation_workflow(self, tmp_path):
        validator = PathValidator(tmp_path)

        filename = validator.sanitize_filename("my-document.docx")
        assert filename == "my-document.docx"

        file_path = tmp_path / filename
        file_path.touch()

        validated_path = validator.validate_project_path(file_path)
        assert validated_path == file_path.resolve()

        validator.validate_file_extension(validated_path, {".docx"})

    def test_security_workflow_blocks_attack(self, tmp_path):
        validator = PathValidator(tmp_path)

        malicious_filename = validator.sanitize_filename("../../../etc/passwd")
        assert malicious_filename == "passwd"

        file_path = tmp_path / malicious_filename
        file_path.touch()

        validated_path = validator.validate_project_path(file_path)
        assert validated_path == file_path.resolve()

    def test_multiple_validators_independent(self, tmp_path):
        validator1 = PathValidator(tmp_path)
        validator2 = PathValidator(tmp_path.parent)

        file_path = tmp_path / "file.txt"
        file_path.touch()

        result1 = validator1.validate_project_path(file_path)
        assert result1 == file_path.resolve()

        result2 = validator2.validate_project_path(file_path)
        assert result2 == file_path.resolve()
