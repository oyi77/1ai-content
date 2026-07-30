"""Thin SQLAlchemy helper for the ebook domain.

Provides get_engine() and create_tables().
Engine instantiation is deferred to ProjectRepository.__init__ so
that each ProjectRepository manages its own per-db-path engine.
"""

import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine


def get_engine(db_path: Path | str) -> Engine:
    """Create a sync SQLAlchemy engine.

    Priority:
    1. USE_EBOOK_SQLITE=true  → SQLite (explicit, used by tests)
    2. DATABASE_URL is set    → PostgreSQL
    3. Neither                → SQLite (fallback)
    """
    use_sqlite = os.environ.get("USE_EBOOK_SQLITE", "").lower() in (
        "true",
        "1",
        "yes",
    )
    if use_sqlite:
        return create_engine(f"sqlite:///{db_path}", echo=False)

    pg_url = os.environ.get("DATABASE_URL", "")
    if pg_url:
        return create_engine(pg_url, echo=False)

    # Fallback to SQLite when neither flag nor DATABASE_URL is set
    return create_engine(f"sqlite:///{db_path}", echo=False)


def create_tables(engine: Engine) -> None:
    """Create all ebook tables via SQLAlchemy ORM metadata."""
    from services.ebook.db.models import Base

    Base.metadata.create_all(bind=engine)