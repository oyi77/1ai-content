#!/usr/bin/env python3
"""
Migrate ebook SQLite databases to PostgreSQL.

Reads from data/ebook/projects.db (primary) and data/ebook_generator.db (comics),
then writes matching rows into the PostgreSQL database via psycopg2.

Usage:
    python3 scripts/migrate-ebook-sqlite-to-pg.py

Env:
    DATABASE_URL  — required, PostgreSQL connection string
    USE_EBOOK_SQLITE — if set, confirms intent to migrate (safety gate)
"""
import os
import sqlite3
import sys
from pathlib import Path

import psycopg2
from psycopg2.extras import RealDictCursor

PROJECTS_DB = Path("data/ebook/projects.db")
GENERATOR_DB = Path("data/ebook_generator.db")
DATABASE_URL = os.environ.get("DATABASE_URL", "")

# Safety gate: must confirm intent
if not os.environ.get("USE_EBOOK_SQLITE", "").lower() in ("true", "1", "yes"):
    print("ERROR: Set USE_EBOOK_SQLITE=true to confirm migration intent (prevents accidental override)")
    sys.exit(1)


def get_sqlite_table_names(conn: sqlite3.Connection) -> list[str]:
    cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    return [row[0] for row in cursor.fetchall()]


def migrate_table(pg: psycopg2.extensions.connection, sqlite_conn: sqlite3.Connection, table: str, pk: str = "id"):
    """Migrate one table from SQLite to PostgreSQL, skipping existing PKs."""
    sqlite_cursor = sqlite_conn.execute(f"SELECT * FROM {table}")
    rows = sqlite_cursor.fetchall()
    if not rows:
        print(f"  {table}: 0 rows (empty)")
        return

    col_names = [d[0] for d in sqlite_cursor.description]
    placeholders = ", ".join(f"%s" for _ in col_names)
    cols = ", ".join(col_names)

    # Build list of existing PKs in PG
    pg_cursor = pg.cursor(cursor_factory=RealDictCursor)
    pg_cursor.execute(f"SELECT {pk} FROM {table}")
    existing = {row[pk] for row in pg_cursor.fetchall()}

    inserted = 0
    skipped = 0

    with pg.cursor(cursor_factory=RealDictCursor) as cursor:
        for row in rows:
            row_dict = dict(row)
            pk_val = row_dict[pk]
            if pk_val in existing:
                skipped += 1
                continue
            values = [row_dict[c] for c in col_names]
            try:
                cursor.execute(
                    f"INSERT INTO {table} ({cols}) VALUES ({placeholders}) ON CONFLICT ({pk}) DO NOTHING",
                    values,
                )
                inserted += 1
            except Exception as e:
                print(f"  {table}: ERROR on {pk}={pk_val}: {e}")

    pg.commit()
    print(f"  {table}: {inserted} inserted, {skipped} skipped (already exist)")


def main():
    if not DATABASE_URL:
        print("ERROR: DATABASE_URL environment variable not set")
        sys.exit(1)

    pg = psycopg2.connect(DATABASE_URL)

    for label, db_path in [("projects.db", PROJECTS_DB), ("ebook_generator.db", GENERATOR_DB)]:
        if not db_path.exists():
            print(f"{label}: not found ({db_path}), skipping")
            continue

        print(f"\n=== {label} ({db_path}) ===")
        sqlite_conn = sqlite3.connect(str(db_path))
        tables = get_sqlite_table_names(sqlite_conn)
        print(f"Tables: {tables}")

        for table in tables:
            pk = "project_id" if table in ("project_metadata", "integration_logs") else "id"
            migrate_table(pg, sqlite_conn, table, pk=pk)

        sqlite_conn.close()

    pg.close()
    print("\nMigration complete.")


if __name__ == "__main__":
    main()