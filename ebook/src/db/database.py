from pathlib import Path


class DatabaseManager:
    def __init__(self, db_path: Path | str):
        self.db_path = Path(db_path)
        self._init_database()

    def get_connection(self):
        import sqlite3

        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_database(self):
        from src.db.schema import create_tables

        with self.get_connection() as conn:
            create_tables(conn)
        self._migrate_schema()

    def _migrate_schema(self):
        """Apply schema migrations for existing databases."""
        with self.get_connection() as conn:
            cursor = conn.execute("PRAGMA index_list(project_metadata)")
            indexes = cursor.fetchall()
            has_unique = any("project_id" in str(idx) for idx in indexes)
            if not has_unique:
                conn.executescript("""
                    CREATE TABLE IF NOT EXISTS project_metadata_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                        key TEXT NOT NULL,
                        value TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE(project_id, key)
                    );
                    INSERT OR IGNORE INTO project_metadata_new SELECT * FROM project_metadata;
                    DROP TABLE project_metadata;
                    ALTER TABLE project_metadata_new RENAME TO project_metadata;
                """)
