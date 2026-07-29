"""Ebook generator router — registered via ContentGenerator.extra_routes().

Standard CRUD endpoints are created by register_generator_routes().
Extra endpoints (generate, export, download) come from the generator's
extra_routes() method.
"""

from __future__ import annotations

from services.ebook import EbookContentGenerator

# Lazy singleton — import gates on first use so wheel imports don't fail.
_gen: EbookContentGenerator | None = None


def _get() -> EbookContentGenerator:
    global _gen
    if _gen is None:
        _gen = EbookContentGenerator()
    return _gen
