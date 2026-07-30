import os
from pathlib import Path


class _CompatCursor:
    """Wraps a sqlite3.Cursor, translating %s → ? on execute."""

    def __init__(self, cur):
        self._cur = cur

    def execute(self, sql, params=None):
        sql = sql.replace("%s", "?")
        if params is None:
            return self._cur.execute(sql)
        return self._cur.execute(sql, params)

    def __getattr__(self, name):
        return getattr(self._cur, name)


class _CompatConnection:
    """Wraps a sqlite3.Connection, translating %s → ? via wrapped cursor/execute."""

    def __init__(self, conn):
        self._conn = conn

    def __enter__(self):
        self._conn.__enter__()
        return self

    def __exit__(self, *args):
        return self._conn.__exit__(*args)

    def cursor(self):
        return _CompatCursor(self._conn.cursor())

    def execute(self, sql, params=None):
        sql = sql.replace("%s", "?")
        if params is None:
            return self._conn.execute(sql)
        return self._conn.execute(sql, params)

    def close(self):
        self._conn.close()

    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()

    def __getattr__(self, name):
        return getattr(self._conn, name)


class DatabaseManager:
    def __init__(self, db_path: Path | str):
        self.db_path = Path(db_path)
        # USE_EBOOK_SQLITE=true forces legacy sqlite3; otherwise use PostgreSQL
        self._use_pg = os.environ.get("USE_EBOOK_SQLITE", "").lower() not in (
            "true",
            "1",
            "yes",
        )
        self._pg_url = os.environ.get("DATABASE_URL", "")

    def get_connection(self):
        if self._use_pg and self._pg_url:
            return self._connect_pg()
        return self._connect_sqlite()

    def _connect_pg(self):
        import psycopg2
        from psycopg2.extras import RealDictCursor

        return psycopg2.connect(self._pg_url, cursor_factory=RealDictCursor)

    def _connect_sqlite(self):
        import sqlite3

        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row

        # Auto-create tables for SQLite (PG tables managed by Prisma)
        from services.ebook.db.schema import create_tables

        create_tables(conn)
        return _CompatConnection(conn)