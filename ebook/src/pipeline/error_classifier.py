from __future__ import annotations
import json


class ErrorClassifier:
    """Maps exception types to user-friendly messages for display in the UI."""

    _MESSAGES = {
        "PermanentAPIError": "AI provider rejected the request. Check your API key or model name in Settings.",
        "TimeoutError": "AI request timed out. Try again or reduce the chapter count / word targets.",
        "JSONDecodeError": "AI returned malformed output. This sometimes fixes itself on retry.",
        "ConnectionError": "Could not connect to the AI provider. Check that your local proxy is running.",
        "ConnectionRefusedError": "Connection refused. Is the AI proxy server running on the configured port?",
        "FileNotFoundError": "A required project file is missing. The project may be corrupted.",
        "PermissionError": "Cannot write to the projects directory. Check folder permissions.",
        "MemoryError": "Out of memory during generation. Try fewer chapters or a smaller model.",
    }

    _PATTERNS = [
        ("rate limit", "Rate limit reached. Wait a moment and try again."),
        ("quota", "API quota exceeded. Check your provider usage limits."),
        (
            "token",
            "AI response exceeded token limit. Try reducing chapter word targets.",
        ),
        (
            "context length",
            "Input too long for the AI model. Try fewer chapters or shorter outlines.",
        ),
        ("invalid model", "Invalid model name. Check the model name in Settings."),
        ("not found", "AI model not found. Check the model name in Settings."),
        (
            "libreoffice",
            "LibreOffice not found. PDF export is unavailable — install LibreOffice for PDF support.",
        ),
        ("disk", "Not enough disk space to save the project."),
    ]

    @classmethod
    def classify(cls, exc: Exception) -> str:
        """Return a user-friendly error message for the given exception."""
        exc_type = type(exc).__name__
        if exc_type in cls._MESSAGES:
            return cls._MESSAGES[exc_type]

        exc_str = str(exc).lower()
        for pattern, message in cls._PATTERNS:
            if pattern in exc_str:
                return message

        return f"Generation failed: {type(exc).__name__}. Check the server logs for details."

    @classmethod
    def classify_str(cls, error_str: str) -> str:
        """Classify from a stored error string (for display of historical errors)."""
        error_lower = error_str.lower()
        for pattern, message in cls._PATTERNS:
            if pattern in error_lower:
                return message
        # Check type name patterns
        for type_name, message in cls._MESSAGES.items():
            if type_name.lower() in error_lower:
                return message
        return error_str  # Return original if no match found
