def create_tables(conn):
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            idea TEXT NOT NULL,
            product_mode TEXT NOT NULL DEFAULT 'lead_magnet',
            target_language TEXT NOT NULL DEFAULT 'en',
            chapter_count INTEGER NOT NULL DEFAULT 5,
            status TEXT NOT NULL DEFAULT 'draft',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            step TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            progress INTEGER NOT NULL DEFAULT 0,
            error_message TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id)
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS project_metadata (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            key TEXT NOT NULL,
            value TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(project_id, key)
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS integration_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            integration_id TEXT NOT NULL,
            event TEXT NOT NULL,
            status TEXT NOT NULL,
            http_status INTEGER,
            error TEXT,
            consecutive_failures INTEGER DEFAULT 0,
            circuit_open INTEGER DEFAULT 0,
            circuit_open_until TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    conn.commit()
