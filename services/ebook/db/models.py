from datetime import datetime
from enum import Enum
from typing import Optional

import sqlalchemy
from pydantic import BaseModel, Field
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    pass


class ProductMode(str, Enum):
    LEAD_MAGNET = "lead_magnet"
    PAID_EBOOK = "paid_ebook"
    BONUS_CONTENT = "bonus_content"
    AUTHORITY = "authority"
    NOVEL = "novel"
    SHORT_STORY = "short_story"
    MEMOIR = "memoir"
    HOW_TO_GUIDE = "how_to_guide"
    TEXTBOOK = "textbook"
    ACADEMIC_PAPER = "academic_paper"
    MANGA = "manga"
    MANHWA = "manhwa"
    MANHUA = "manhua"
    COMICS = "comics"


class ProjectStatus(str, Enum):
    DRAFT = "draft"
    GENERATING = "generating"
    COMPLETED = "completed"
    FAILED = "failed"


class JobStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class ProjectRecord(Base):
    """SQLAlchemy ORM model for the ebook_projects table."""

    __tablename__ = "ebook_projects"

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String, nullable=False)
    owner = Column(String, nullable=True)  # tenant id (Telegram user id); NULL = legacy row
    idea = Column(Text, nullable=False)
    product_mode = Column(String, nullable=False, default="lead_magnet")
    target_language = Column(String, nullable=False, default="en")
    chapter_count = Column(Integer, nullable=False, default=5)
    status = Column(String, nullable=False, default="draft")
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    jobs = relationship("JobRecord", back_populates="project", cascade="all, delete-orphan")
    metadata_entries = relationship("ProjectMetadataRecord", back_populates="project", cascade="all, delete-orphan")


class JobRecord(Base):
    """SQLAlchemy ORM model for the ebook_jobs table."""

    __tablename__ = "ebook_jobs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    project_id = Column(Integer, ForeignKey("ebook_projects.id"), nullable=False)
    step = Column(String, nullable=False)
    status = Column(String, nullable=False, default="pending")
    progress = Column(Integer, nullable=False, default=0)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    project = relationship("ProjectRecord", back_populates="jobs")


class ProjectMetadataRecord(Base):
    """SQLAlchemy ORM model for the ebook_project_metadata table."""

    __tablename__ = "ebook_project_metadata"

    id = Column(Integer, primary_key=True, autoincrement=True)
    project_id = Column(Integer, ForeignKey("ebook_projects.id", ondelete="CASCADE"), nullable=False)
    key = Column(String, nullable=False)
    value = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.now)

    project = relationship("ProjectRecord", back_populates="metadata_entries")

    __table_args__ = (
        sqlalchemy.UniqueConstraint("project_id", "key"),
    )


class IntegrationLogRecord(Base):
    """SQLAlchemy ORM model for the ebook_integration_logs table."""

    __tablename__ = "ebook_integration_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    integration_id = Column(String, nullable=False)
    event = Column(String, nullable=False)
    status = Column(String, nullable=False)
    http_status = Column(Integer, nullable=True)
    error = Column(Text, nullable=True)
    consecutive_failures = Column(Integer, default=0)
    circuit_open = Column(Integer, default=0)
    circuit_open_until = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.now)


class Project(BaseModel):
    id: Optional[int] = None
    title: str
    idea: str
    product_mode: ProductMode = ProductMode.LEAD_MAGNET
    target_language: str = "en"
    chapter_count: int = Field(default=5, ge=2, le=20)
    status: ProjectStatus = ProjectStatus.DRAFT
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class Job(BaseModel):
    id: Optional[int] = None
    project_id: int
    step: str
    status: JobStatus = JobStatus.PENDING
    progress: int = Field(default=0, ge=0, le=100)
    error_message: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None