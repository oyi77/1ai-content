from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


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
