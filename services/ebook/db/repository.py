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
                   VALUES (%s, %s, %s, %s, %s, %s) RETURNING id""",
                (
                    title,
                    idea,
                    product_mode,
                    target_language,
                    chapter_count,
                    ProjectStatus.DRAFT.value,
                ),
            )
            result_id = cursor.fetchone()["id"]
            conn.commit()
            return result_id

    def get_project(self, project_id: int) -> Optional[dict]:
        with self.db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM projects WHERE id = %s", (project_id,))
            row = cursor.fetchone()
            if row is None:
                return None
            return dict(row)

    def list_projects(self, limit: int = 100) -> list[dict]:
        with self.db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT * FROM projects ORDER BY created_at DESC LIMIT %s", (limit,)
            )
            return [dict(row) for row in cursor.fetchall()]

    def update_project_status(self, project_id: int, status: str) -> None:
        with self.db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE projects SET status = %s, updated_at = %s WHERE id = %s",
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

        fields = ", ".join(f"{k} = %s" for k in kwargs.keys())
        values = list(kwargs.values()) + [datetime.now().isoformat(), project_id]
        with self.db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                f"UPDATE projects SET {fields}, updated_at = %s WHERE id = %s",
                values,
            )
            conn.commit()

    def set_target_languages(self, project_id: int, languages: list[str]) -> None:
        """Store target_languages as JSON in project_metadata table."""
        import json

        with self.db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "DELETE FROM project_metadata WHERE project_id = %s AND key = %s",
                (project_id, "target_languages"),
            )
            cursor.execute(
                "INSERT INTO project_metadata (project_id, key, value) VALUES (%s, %s, %s)",
                (project_id, "target_languages", json.dumps(languages)),
            )
            conn.commit()

    def get_target_languages(self, project_id: int) -> list[str]:
        """Get target_languages; falls back to single target_language column for old projects."""
        import json

        with self.db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT value FROM project_metadata WHERE project_id = %s AND key = %s",
                (project_id, "target_languages"),
            )
            row = cursor.fetchone()
            if row:
                return json.loads(row["value"])
            cursor.execute(
                "SELECT target_language FROM projects WHERE id = %s", (project_id,)
            )
            proj = cursor.fetchone()
            return [proj["target_language"]] if proj else ["en"]

    def set_metadata(self, project_id: int, key: str, value: str) -> None:
        with self.db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO project_metadata (project_id, key, value) VALUES (%s, %s, %s) "
                "ON CONFLICT (project_id, key) DO UPDATE SET value = EXCLUDED.value",
                (project_id, key, value),
            )
            conn.commit()

    def get_metadata(self, project_id: int, key: str) -> str | None:
        with self.db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT value FROM project_metadata WHERE project_id = %s AND key = %s",
                (project_id, key),
            )
            row = cursor.fetchone()
            return row["value"] if row else None

    def delete_project(self, project_id: int) -> None:
        with self.db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM projects WHERE id = %s", (project_id,))
            conn.commit()


class JobRepository:
    def __init__(self, db_path: Path | str):
        self.db = DatabaseManager(db_path)

    def create_job(self, project_id: int, step: str) -> int:
        with self.db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO jobs (project_id, step, status) VALUES (%s, %s, %s) RETURNING id",
                (project_id, step, JobStatus.PENDING.value),
            )
            result_id = cursor.fetchone()["id"]
            conn.commit()
            return result_id

    def get_job(self, job_id: int) -> Optional[dict]:
        with self.db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM jobs WHERE id = %s", (job_id,))
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
                "UPDATE jobs SET status = %s, progress = %s, error_message = %s, updated_at = %s WHERE id = %s",
                (status, progress, error_message, datetime.now().isoformat(), job_id),
            )
            conn.commit()

    def get_jobs_by_project(self, project_id: int) -> list[dict]:
        with self.db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT * FROM jobs WHERE project_id = %s ORDER BY created_at",
                (project_id,),
            )
            return [dict(row) for row in cursor.fetchall()]