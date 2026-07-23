"""Bookshelf — AI-powered book generation from topic description.

Uses Groq API with Llama models to generate structured non-fiction books.
"""

from services.bookshelf.engine import generate_book_pipeline
from services.bookshelf.stats import GenerationStatistics

__all__ = [
    "generate_book_pipeline",
    "GenerationStatistics",
]
