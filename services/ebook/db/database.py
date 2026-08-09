"""Thin SQLAlchemy helper for the ebook domain.

Provides get_engine() and create_tables().
Engine instantiation is deferred to ProjectRepository.__init__ so
that each ProjectRepository manages its own per-db-path engine.
"""

import os
from pathlib import Path

from sqlalchemy import create_engine, inspect, text
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

    # Tenant scoping backfill: ebook_projects predates the owner column, and
    # create_all() never ALTERs existing tables. Existing rows keep NULL owner
    # (owned by nobody, backward compatible); new rows always carry owner.
    inspector = inspect(engine)
    tables = {t for t in inspector.get_table_names()}
    if "ebook_projects" in tables:
        columns = {col["name"] for col in inspector.get_columns("ebook_projects")}
        if "owner" not in columns:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE ebook_projects ADD COLUMN owner VARCHAR"))