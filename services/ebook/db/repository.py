from datetime import datetime
from pathlib import Path
from typing import Optional

from services.ebook.db.database import DatabaseManager
from services.ebook.db.models import JobStatus, ProjectStatus

# Whitelist of allowed fields for project updates to prevent SQL injection
ALLOWED_UPDATE_FIELDS = {"title", "idea", "status", "chapter_count"}


class ProjectRepository:
    def __init__(self, db_path: Path | str):
        self.db = DatabaseManager(db_path)

    def create_project(
        self,
        title: str,
        idea: str,
        product_mode: str = "lead_magnet",
        target_language: str = "en",
        chapter_count: int = 5,
    ) -> int:
        with self.db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """INSERT INTO projects (title, idea, product_mode, target_language, chapter_count, status)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (
                    title,
                    idea,
                    product_mode,
                    target_language,
                    chapter_count,
                    ProjectStatus.DRAFT.value,
                ),
            )
            conn.commit()
            return cursor.lastrowid

    def get_project(self, project_id: int) -> Optional[dict]:
        with self.db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM projects WHERE id = ?", (project_id,))
            row = cursor.fetchone()
            if row is None:
                return None
            return dict(row)

    def list_projects(self, limit: int = 100) -> list[dict]:
        with self.db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT * FROM projects ORDER BY created_at DESC LIMIT ?", (limit,)
            )
            return [dict(row) for row in cursor.fetchall()]

    def update_project_status(self, project_id: int, status: str) -> None:
        with self.db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE projects SET status = ?, updated_at = ? WHERE id = ?",
                (status, datetime.now().isoformat(), project_id),
            )
            conn.commit()

    def update_project(self, project_id: int, **kwargs) -> None:
        invalid_fields = set(kwargs.keys()) - ALLOWED_UPDATE_FIELDS
        if invalid_fields:
            raise ValueError(
                f"Invalid field(s) for update: {', '.join(sorted(invalid_fields))}. "
                f"Allowed fields: {', '.join(sorted(ALLOWED_UPDATE_FIELDS))}"
            )

        if not kwargs:
            return

        fields = ", ".join(f"{k} = ?" for k in kwargs.keys())
        values = list(kwargs.values()) + [datetime.now().isoformat(), project_id]
        with self.db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                f"UPDATE projects SET {fields}, updated_at = ? WHERE id = ?",
                values,
            )
            conn.commit()

    def set_target_languages(self, project_id: int, languages: list[str]) -> None:
        """Store target_languages as JSON in project_metadata table."""
        import json

        with self.db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "DELETE FROM project_metadata WHERE project_id = ? AND key = ?",
                (project_id, "target_languages"),
            )
            cursor.execute(
                "INSERT INTO project_metadata (project_id, key, value) VALUES (?, ?, ?)",
                (project_id, "target_languages", json.dumps(languages)),
            )
            conn.commit()

    def get_target_languages(self, project_id: int) -> list[str]:
        """Get target_languages; falls back to single target_language column for old projects."""
        import json

        with self.db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT value FROM project_metadata WHERE project_id = ? AND key = ?",
                (project_id, "target_languages"),
            )
            row = cursor.fetchone()
            if row:
                return json.loads(row["value"])
            cursor.execute(
                "SELECT target_language FROM projects WHERE id = ?", (project_id,)
            )
            proj = cursor.fetchone()
            return [proj["target_language"]] if proj else ["en"]

    def set_metadata(self, project_id: int, key: str, value: str) -> None:
        with self.db.get_connection() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO project_metadata (project_id, key, value) VALUES (?, ?, ?)",
                (project_id, key, value),
            )
            conn.commit()

    def get_metadata(self, project_id: int, key: str) -> str | None:
        with self.db.get_connection() as conn:
            cursor = conn.execute(
                "SELECT value FROM project_metadata WHERE project_id = ? AND key = ?",
                (project_id, key),
            )
            row = cursor.fetchone()
            return row[0] if row else None

    def delete_project(self, project_id: int) -> None:
        with self.db.get_connection() as conn:
            conn.execute("DELETE FROM projects WHERE id = ?", (project_id,))
            conn.commit()


class JobRepository:
    def __init__(self, db_path: Path | str):
        self.db = DatabaseManager(db_path)

    def create_job(self, project_id: int, step: str) -> int:
        with self.db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO jobs (project_id, step, status) VALUES (?, ?, ?)",
                (project_id, step, JobStatus.PENDING.value),
            )
            conn.commit()
            return cursor.lastrowid

    def get_job(self, job_id: int) -> Optional[dict]:
        with self.db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM jobs WHERE id = ?", (job_id,))
            row = cursor.fetchone()
            if row is None:
                return None
            return dict(row)

    def update_job_progress(
        self,
        job_id: int,
        status: str,
        progress: int,
        error_message: Optional[str] = None,
    ) -> None:
        with self.db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE jobs SET status = ?, progress = ?, error_message = ?, updated_at = ? WHERE id = ?",
                (status, progress, error_message, datetime.now().isoformat(), job_id),
            )
            conn.commit()

    def get_jobs_by_project(self, project_id: int) -> list[dict]:
        with self.db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT * FROM jobs WHERE project_id = ? ORDER BY created_at",
                (project_id,),
            )
            return [dict(row) for row in cursor.fetchall()]
