"""Bookshelf — AI-powered book generation from topic description.

Uses OmniRoute (OpenAI-compatible endpoint) for model inference.
"""

from services.bookshelf.engine import generate_book_pipeline
from services.bookshelf.stats import GenerationStatistics

__all__ = [
    "generate_book_pipeline",
    "GenerationStatistics",
]
