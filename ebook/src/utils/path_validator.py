"""
Path validation utilities for secure file operations.

Consolidates path validation logic to prevent code duplication and ensure
consistent security checks across the codebase.
"""

from pathlib import Path
from typing import Set


class PathValidator:
    """
    Validates file paths to prevent security vulnerabilities.

    Provides methods for:
    - Validating paths are within a base directory (prevents path traversal)
    - Validating file extensions (prevents arbitrary file processing)
    - Sanitizing filenames (prevents directory traversal in filenames)
    """

    def __init__(self, base_dir: Path | str = "projects"):
        """
        Initialize PathValidator with a base directory.

        Args:
            base_dir: Base directory for path validation. All validated paths
                     must be within this directory.
        """
        self.base_dir = Path(base_dir).resolve()

    def validate_project_path(self, path: Path | str) -> Path:
        """
        Validate that a file path is within the base directory.

        Resolves the path to absolute form (handling symlinks and ..) and ensures
        it's contained within base_dir to prevent path traversal attacks.

        Args:
            path: Path to validate

        Returns:
            Resolved absolute path

        Raises:
            ValueError: If path is outside base_dir or cannot be resolved
        """
        try:
            resolved_path = Path(path).resolve()

            if not resolved_path.is_relative_to(self.base_dir):
                raise ValueError(f"File path must be within base directory: {path}")

            return resolved_path
        except (ValueError, OSError) as e:
            raise ValueError(f"Invalid file path: {path}") from e

    def validate_file_extension(
        self, path: Path | str, allowed_extensions: Set[str] | None = None
    ) -> Path:
        """
        Validate that a file has an allowed extension.

        Args:
            path: Path to validate
            allowed_extensions: Set of allowed extensions (e.g., {".docx", ".pdf"}).
                               If None, only checks that extension exists.
                               Extensions should include the dot (e.g., ".docx").

        Returns:
            Path object (not resolved)

        Raises:
            ValueError: If file extension is not allowed
        """
        path_obj = Path(path)
        extension = path_obj.suffix.lower()

        if not extension:
            raise ValueError(f"File must have an extension: {path}")

        if allowed_extensions is not None and extension not in allowed_extensions:
            allowed_str = ", ".join(sorted(allowed_extensions))
            raise ValueError(
                f"File must have one of these extensions: {allowed_str}, got: {extension}"
            )

        return path_obj

    def sanitize_filename(self, filename: str) -> str:
        """
        Sanitize a filename to prevent directory traversal.

        Removes path separators and relative path components from filenames.

        Args:
            filename: Filename to sanitize

        Returns:
            Sanitized filename safe for use in file operations

        Raises:
            ValueError: If filename is empty or contains only path separators
        """
        if not filename or not filename.strip():
            raise ValueError("Filename cannot be empty")

        # Remove path separators and relative path components
        sanitized = Path(filename).name

        if not sanitized or sanitized in (".", ".."):
            raise ValueError(f"Invalid filename: {filename}")

        return sanitized
