"""Input validation models for user-submitted data.

This module provides Pydantic models with strict validation rules to prevent:
- Injection attacks (XSS, SQL injection)
- Buffer overflows
- Invalid data reaching the database
- Malformed inputs causing pipeline failures
"""

import re
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

# Supported languages (from app/pages/2_Create_Ebook.py SUPPORTED_LANGUAGES)
VALID_LANGUAGES = [
    "en",
    "es",
    "fr",
    "de",
    "it",
    "pt",
    "nl",
    "pl",
    "ru",
    "ja",
    "ko",
    "zh",
    "ar",
    "hi",
    "tr",
    "sv",
    "no",
    "da",
    "fi",
    "cs",
    "el",
    "he",
    "th",
    "vi",
    "id",
    "ms",
    "tl",
    "uk",
    "ro",
    "hu",
    "sk",
    "bg",
    "hr",
    "sr",
    "sl",
    "et",
    "lv",
    "lt",
    "is",
    "ga",
    "cy",
    "mt",
    "sq",
    "mk",
    "bs",
    "ka",
    "hy",
    "az",
    "uz",
    "kk",
    "ky",
    "tg",
    "tk",
    "mn",
    "ne",
    "si",
    "bn",
    "ta",
    "te",
    "ml",
    "kn",
    "mr",
    "gu",
    "pa",
    "ur",
    "fa",
    "ps",
    "ku",
    "am",
    "om",
    "so",
    "sw",
    "zu",
    "xh",
    "af",
    "st",
    "tn",
    "sn",
    "ny",
    "mg",
    "eo",
    "la",
    "sa",
]

# Product modes (from app/pages/2_Create_Ebook.py)
VALID_PRODUCT_MODES = [
    "lead_magnet",
    "paid_ebook",
    "bonus_content",
    "authority",
    "novel",
    "short_story",
    "memoir",
    "how_to_guide",
    "textbook",
    "academic_paper",
    "manga",
    "manhwa",
    "manhua",
    "comics",
]

# Quality levels
VALID_QUALITY_LEVELS = ["fast", "thorough", "draft", "standard", "premium"]


class ProjectInput(BaseModel):
    """Validated input for creating a new ebook project.

    All fields are validated to prevent injection attacks and ensure
    data integrity before reaching the database or generation pipeline.
    """

    idea: str = Field(
        ...,
        min_length=10,
        max_length=5000,
        description="Ebook idea or description (10-5000 characters)",
    )

    chapter_count: int = Field(
        ..., ge=3, le=50, description="Number of chapters (3-50)"
    )

    target_language: str = Field(
        ..., description="Primary target language code (ISO 639-1)"
    )

    product_mode: str = Field(
        default="paid_ebook", description="Book type/product mode"
    )

    quality_level: str = Field(
        default="standard", description="Generation quality level"
    )

    title: str | None = Field(
        default=None, max_length=200, description="Optional project title"
    )

    @field_validator("idea")
    @classmethod
    def validate_idea(cls, v: str) -> str:
        """Validate and sanitize idea field.

        - Strips leading/trailing whitespace
        - Rejects common injection patterns
        - Ensures reasonable length
        """
        v = v.strip()

        if len(v) < 10:
            raise ValueError(
                "Idea must be at least 10 characters after trimming whitespace"
            )

        if len(v) > 5000:
            raise ValueError("Idea must not exceed 5000 characters")

        # Detect potential XSS attempts
        xss_patterns = [
            r"<script[^>]*>",
            r"javascript:",
            r"onerror\s*=",
            r"onload\s*=",
            r"onclick\s*=",
            r"<iframe[^>]*>",
        ]

        for pattern in xss_patterns:
            if re.search(pattern, v, re.IGNORECASE):
                raise ValueError("Idea contains potentially malicious content")

        # Detect SQL injection patterns
        sql_patterns = [
            r";\s*DROP\s+TABLE",
            r";\s*DELETE\s+FROM",
            r";\s*UPDATE\s+.*\s+SET",
            r"UNION\s+SELECT",
            r"--\s*$",
            r"/\*.*\*/",
        ]

        for pattern in sql_patterns:
            if re.search(pattern, v, re.IGNORECASE):
                raise ValueError("Idea contains potentially malicious SQL patterns")

        return v

    @field_validator("chapter_count")
    @classmethod
    def validate_chapter_count(cls, v: int) -> int:
        """Validate chapter count is within acceptable range."""
        if v < 3:
            raise ValueError("Chapter count must be at least 3")
        if v > 50:
            raise ValueError("Chapter count must not exceed 50")
        return v

    @field_validator("target_language")
    @classmethod
    def validate_language(cls, v: str) -> str:
        """Validate language code against supported languages."""
        v = v.strip().lower()

        if not v:
            raise ValueError("Language code cannot be empty")

        if v not in VALID_LANGUAGES:
            raise ValueError(
                f"Unsupported language code: {v}. "
                f"Must be one of: {', '.join(VALID_LANGUAGES[:10])}..."
            )

        return v

    @field_validator("product_mode")
    @classmethod
    def validate_product_mode(cls, v: str) -> str:
        """Validate product mode against supported types."""
        v = v.strip().lower()

        if not v:
            raise ValueError("Product mode cannot be empty")

        if v not in VALID_PRODUCT_MODES:
            raise ValueError(
                f"Invalid product mode: {v}. "
                f"Must be one of: {', '.join(VALID_PRODUCT_MODES)}"
            )

        return v

    @field_validator("quality_level")
    @classmethod
    def validate_quality_level(cls, v: str) -> str:
        """Validate quality level against supported options."""
        v = v.strip().lower()

        if not v:
            raise ValueError("Quality level cannot be empty")

        if v not in VALID_QUALITY_LEVELS:
            raise ValueError(
                f"Invalid quality level: {v}. "
                f"Must be one of: {', '.join(VALID_QUALITY_LEVELS)}"
            )

        return v

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: str | None) -> str | None:
        """Validate optional title field."""
        if v is None:
            return None

        v = v.strip()

        if not v:
            return None

        if len(v) > 200:
            raise ValueError("Title must not exceed 200 characters")

        # Check for XSS patterns in title
        xss_patterns = [r"<script[^>]*>", r"javascript:", r"onerror\s*=", r"onload\s*="]
        for pattern in xss_patterns:
            if re.search(pattern, v, re.IGNORECASE):
                raise ValueError("Title contains potentially malicious content")

        return v

    model_config = {
        "str_strip_whitespace": True,
        "validate_assignment": True,
    }
