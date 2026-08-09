"""Repository classes for the ebook domain using SQLAlchemy ORM.

ProjectRepository and JobRepository manage per-db-path engine/session,
replacing the former raw-sqlite + DatabaseManager pattern.
"""

from datetime import datetime
from pathlib import Path
from typing import Optional

from sqlalchemy import or_
from sqlalchemy.orm import Session

from services.ebook.db.database import get_engine, create_tables
from services.ebook.db.models import (
    JobRecord,
    JobStatus,
    ProjectMetadataRecord,
    ProjectRecord,
    ProjectStatus,
)

# Whitelist of allowed fields for project updates to prevent SQL injection
ALLOWED_UPDATE_FIELDS = {"title", "idea", "status", "chapter_count"}


def _project_to_dict(record: ProjectRecord) -> dict:
    """Convert a ProjectRecord ORM instance to the dict format callers expect."""
    return {
        "id": record.id,
        "title": record.title,
        "owner": record.owner,  # tenant id; NULL for legacy rows
        "idea": record.idea,
        "product_mode": record.product_mode,
        "target_language": record.target_language,
        "chapter_count": record.chapter_count,
        "status": record.status,
        "created_at": record.created_at.isoformat() if record.created_at else None,
        "updated_at": record.updated_at.isoformat() if record.updated_at else None,
    }


def _job_to_dict(record: JobRecord) -> dict:
    """Convert a JobRecord ORM instance to dict."""
    return {
        "id": record.id,
        "project_id": record.project_id,
        "step": record.step,
        "status": record.status,
        "progress": record.progress,
        "error_message": record.error_message,
        "created_at": record.created_at.isoformat() if record.created_at else None,
        "updated_at": record.updated_at.isoformat() if record.updated_at else None,
    }


class ProjectRepository:
    def __init__(self, db_path: Path | str):
        self.engine = get_engine(db_path)
        create_tables(self.engine)

    def _session(self) -> Session:
        return Session(bind=self.engine)

    def create_project(
        self,
        title: str,
        idea: str,
        product_mode: str = "lead_magnet",
        target_language: str = "en",
        chapter_count: int = 5,
        owner: str | None = None,
    ) -> int:
        with self._session() as session:
            record = ProjectRecord(
                title=title,
                idea=idea,
                product_mode=product_mode,
                target_language=target_language,
                chapter_count=chapter_count,
                owner=owner,  # tenant id (Telegram user id); None = legacy/global
                status=ProjectStatus.DRAFT.value,
            )
            session.add(record)
            session.flush()
            project_id = record.id
            session.commit()
            return project_id

    def get_project(
        self, project_id: int, owner: str | None = None
    ) -> Optional[dict]:
        """Fetch a project, enforcing tenant scope.

        owner=None (no tenant context) may only read legacy rows (owner IS NULL).
        A project owned by another tenant is treated as not-found.
        """
        with self._session() as session:
            record = session.get(ProjectRecord, project_id)
            if record is None:
                return None
            if record.owner is not None and record.owner != owner:
                return None
            return _project_to_dict(record)

    def get_project_unscoped(self, project_id: int) -> Optional[dict]:
        """Fetch a project by id WITHOUT tenant scoping.

        INTERNAL TRUSTED USE ONLY (pipeline orchestrator, comics orchestrator,
        intake): these callers run a project that was already ownership-validated
        at the API/MCP boundary via get_project(project_id, owner=...). Do NOT
        call from API/MCP boundaries — use get_project(project_id, owner=...) so
        cross-tenant reads are denied.
        """
        with self._session() as session:
            record = session.get(ProjectRecord, project_id)
            if record is None:
                return None
            return _project_to_dict(record)

    def list_projects(
        self, limit: int = 100, owner: str | None = None
    ) -> list[dict]:
        """List projects visible to *owner*: its own + legacy (owner IS NULL).

        owner=None → legacy rows only (safe default: no tenant context must not
        enumerate other tenants' projects).
        """
        with self._session() as session:
            records = (
                session.query(ProjectRecord)
                .filter(
                    or_(
                        ProjectRecord.owner == owner,
                        ProjectRecord.owner.is_(None),
                    )
                )
                .order_by(ProjectRecord.created_at.desc())
                .limit(limit)
                .all()
            )
            return [_project_to_dict(r) for r in records]

    def update_project_status(self, project_id: int, status: str) -> None:
        with self._session() as session:
            record = session.get(ProjectRecord, project_id)
            if record is not None:
                record.status = status
                record.updated_at = datetime.now()
                session.commit()

    def update_project(self, project_id: int, **kwargs) -> None:
        invalid_fields = set(kwargs.keys()) - ALLOWED_UPDATE_FIELDS
        if invalid_fields:
            raise ValueError(
                f"Invalid field(s) for update: {', '.join(sorted(invalid_fields))}. "
                f"Allowed fields: {', '.join(sorted(ALLOWED_UPDATE_FIELDS))}"
            )

        if not kwargs:
            return

        with self._session() as session:
            record = session.get(ProjectRecord, project_id)
            if record is None:
                return
            for key, value in kwargs.items():
                setattr(record, key, value)
            record.updated_at = datetime.now()
            session.commit()

    def set_target_languages(self, project_id: int, languages: list[str]) -> None:
        """Store target_languages as JSON in project_metadata table."""
        import json

        with self._session() as session:
            # Delete old entry
            session.query(ProjectMetadataRecord).filter(
                ProjectMetadataRecord.project_id == project_id,
                ProjectMetadataRecord.key == "target_languages",
            ).delete()
            # Insert new entry
            entry = ProjectMetadataRecord(
                project_id=project_id,
                key="target_languages",
                value=json.dumps(languages),
            )
            session.add(entry)
            session.commit()

    def get_target_languages(self, project_id: int) -> list[str]:
        """Get target_languages; falls back to single target_language column for old projects."""
        import json

        with self._session() as session:
            entry = (
                session.query(ProjectMetadataRecord)
                .filter(
                    ProjectMetadataRecord.project_id == project_id,
                    ProjectMetadataRecord.key == "target_languages",
                )
                .first()
            )
            if entry is not None:
                return json.loads(entry.value)

            record = session.get(ProjectRecord, project_id)
            return [record.target_language] if record else ["en"]

    def set_metadata(self, project_id: int, key: str, value: str) -> None:
        with self._session() as session:
            entry = (
                session.query(ProjectMetadataRecord)
                .filter(
                    ProjectMetadataRecord.project_id == project_id,
                    ProjectMetadataRecord.key == key,
                )
                .first()
            )
            if entry is not None:
                entry.value = value
            else:
                entry = ProjectMetadataRecord(
                    project_id=project_id, key=key, value=value
                )
                session.add(entry)
            session.commit()

    def get_metadata(self, project_id: int, key: str) -> str | None:
        with self._session() as session:
            entry = (
                session.query(ProjectMetadataRecord)
                .filter(
                    ProjectMetadataRecord.project_id == project_id,
                    ProjectMetadataRecord.key == key,
                )
                .first()
            )
            return entry.value if entry is not None else None

    def delete_project(self, project_id: int) -> None:
        with self._session() as session:
            record = session.get(ProjectRecord, project_id)
            if record is not None:
                session.delete(record)
                session.commit()


class JobRepository:
    def __init__(self, db_path: Path | str):
        self.engine = get_engine(db_path)
        create_tables(self.engine)

    def _session(self) -> Session:
        return Session(bind=self.engine)

    def create_job(self, project_id: int, step: str) -> int:
        with self._session() as session:
            record = JobRecord(
                project_id=project_id,
                step=step,
                status=JobStatus.PENDING.value,
            )
            session.add(record)
            session.flush()
            job_id = record.id
            session.commit()
            return job_id

    def get_job(self, job_id: int) -> Optional[dict]:
        with self._session() as session:
            record = session.get(JobRecord, job_id)
            if record is None:
                return None
            return _job_to_dict(record)

    def update_job_progress(
        self,
        job_id: int,
        status: str,
        progress: int,
        error_message: Optional[str] = None,
    ) -> None:
        with self._session() as session:
            record = session.get(JobRecord, job_id)
            if record is not None:
                record.status = status
                record.progress = progress
                record.error_message = error_message
                record.updated_at = datetime.now()
                session.commit()

    def get_jobs_by_project(self, project_id: int) -> list[dict]:
        with self._session() as session:
            records = (
                session.query(JobRecord)
                .filter(JobRecord.project_id == project_id)
                .order_by(JobRecord.created_at)
                .all()
            )
            return [_job_to_dict(r) for r in records]