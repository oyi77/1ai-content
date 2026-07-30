"""
Database layer — SQLAlchemy models + async session.

Maps to the same PostgreSQL tables as the Prisma schema on the TypeScript side.
Python services share the same database as the bot.
"""

import os
import enum
from typing import Any
from datetime import datetime
from decimal import Decimal


class ContentType(str, enum.Enum):
    """Canonical content type values stored in content_type columns."""

    caption = "caption"
    carousel = "carousel"
    mixed = "mixed"
    short = "short"
    video = "video"

    @classmethod
    def _missing_(cls, value: Any) -> "ContentType | None":
        """ValueError instead of silent fallback for invalid types."""
        return None  # explicit None so @validates raises


def _validate_content_type(v: Any) -> str:
    """Validate a content_type value against the ContentType enum."""
    if isinstance(v, ContentType):
        return v.value
    if isinstance(v, str):
        ct = ContentType._value2member_map_.get(v)
        if ct is not None:
            return ct.value
        raise ValueError(f"Invalid content_type: {v!r}. Must be one of {[m.value for m in ContentType]}")
    raise ValueError(f"Invalid content_type type: {type(v).__name__}. Expected str or ContentType.")

from sqlalchemy import (
    BigInteger, Boolean, Column, DateTime, DECIMAL as SADecimal,
    ForeignKey, Integer, String, Text, func, select,
)
from sqlalchemy.dialects import postgresql
from sqlalchemy.dialects.postgresql import JSONB, insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, relationship, validates

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://openclaw:openclaw@localhost:5432/berkahkarya",
)

# Lazy async engine — only creates when accessed, to avoid crashing on asyncpg import
_engine = None
_async_session = None


def get_engine():
    global _engine
    if _engine is None:
        async_url = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://")
        _engine = create_async_engine(async_url, echo=False, pool_size=5, max_overflow=10)
    return _engine


def get_async_session():
    global _async_session
    if _async_session is None:
        _async_session = async_sessionmaker(get_engine(), expire_on_commit=False)
    return _async_session()


class Base(DeclarativeBase):
    pass


# ══════════════════════════════════════════════════════════════
# MODELS — Maps to existing Prisma tables
# ══════════════════════════════════════════════════════════════

class User(Base):
    __tablename__ = "users"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    telegram_id = Column(BigInteger, unique=True, nullable=False)
    uuid = Column(String, unique=True, nullable=False)
    username = Column(String(32))
    first_name = Column(String(64), nullable=False)
    last_name = Column(String(64))
    tier = Column(String(16), default="free")
    credit_balance = Column(SADecimal(10, 2), default=0)
    subscription_credits = Column(Integer, default=0)
    referral_code = Column(String(32), unique=True)
    referred_by = Column(String)  # uuid
    language = Column(String(5), default="id")
    is_banned = Column(Boolean, default=False)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    last_activity_at = Column(DateTime, default=func.now())

    # Relations
    videos = relationship("Video", back_populates="user", lazy="dynamic")
    carousels = relationship("Carousel", back_populates="user", lazy="dynamic")
    content_calendar = relationship("ContentCalendar", back_populates="user", lazy="dynamic")
    ab_tests = relationship("ABTest", back_populates="user", lazy="dynamic")


class Video(Base):
    __tablename__ = "videos"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(BigInteger, ForeignKey("users.telegram_id"), nullable=False)
    job_id = Column(String(64), unique=True, nullable=False)
    title = Column(String(255))
    description = Column(Text)
    niche = Column(String(32), nullable=False)
    platform = Column(String(32), nullable=False)
    duration = Column(Integer)
    scenes = Column(Integer)
    thumbnail_url = Column(String)
    video_url = Column(String)
    download_url = Column(String)
    status = Column(String(16), default="processing")
    progress = Column(Integer, default=0)
    error_message = Column(String)
    credits_used = Column(SADecimal(10, 2), default=0)
    storyboard = Column(JSONB)
    created_at = Column(DateTime, default=func.now())
    completed_at = Column(DateTime)

    user = relationship("User", back_populates="videos")


class Carousel(Base):
    __tablename__ = "carousels"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(BigInteger, ForeignKey("users.telegram_id"), nullable=False)
    job_id = Column(String(64), unique=True, nullable=False)
    topic = Column(String(255), nullable=False)
    caption = Column(Text)
    hashtags = Column(postgresql.ARRAY(String), default=list)
    slide_count = Column(Integer, default=0)
    style = Column(String(32), default="outline")
    language = Column(String(5), default="id")
    platform = Column(String(32), default="tiktok")
    slide_urls = Column(postgresql.ARRAY(String), default=list)
    cover_url = Column(String)
    status = Column(String(16), default="processing")
    progress = Column(Integer, default=0)
    error_msg = Column(String)
    credits_used = Column(SADecimal(10, 2), default=0)
    created_at = Column(DateTime, default=func.now())
    completed_at = Column(DateTime)

    user = relationship("User", back_populates="carousels")


class ContentCalendar(Base):
    __tablename__ = "content_calendar"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(BigInteger, ForeignKey("users.telegram_id"), nullable=False)
    scheduled_at = Column(DateTime, nullable=False)
    platform = Column(String(32), nullable=False)
    content_type = Column(String(32), nullable=False)
    topic = Column(String(255))
    caption = Column(Text)
    hashtags = Column(postgresql.ARRAY(String), default=list)
    media_url = Column(String(512))
    media_type = Column(String(16))
    status = Column(String(16), default="scheduled")
    niche = Column(String(64))
    style = Column(String(32))
    language = Column(String(5), default="id")
    auto_post = Column(Boolean, default=False)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="content_calendar")
    @validates("content_type")
    def validate_content_type(self, key: str, value: Any) -> str:
        return _validate_content_type(value)


class ABTest(Base):
    __tablename__ = "ab_tests"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(BigInteger, ForeignKey("users.telegram_id"), nullable=False)
    name = Column(String(128), nullable=False)
    description = Column(Text)
    platform = Column(String(32), nullable=False)
    content_type = Column(String(32), nullable=False)
    variant_a_caption = Column(Text)
    variant_b_caption = Column(Text)
    variant_a_url = Column(String)
    variant_b_url = Column(String)
    variant_a_views = Column(Integer, default=0)
    variant_a_likes = Column(Integer, default=0)
    variant_a_shares = Column(Integer, default=0)
    variant_a_comments = Column(Integer, default=0)
    variant_b_views = Column(Integer, default=0)
    variant_b_likes = Column(Integer, default=0)
    variant_b_shares = Column(Integer, default=0)
    variant_b_comments = Column(Integer, default=0)
    status = Column(String(16), default="draft")
    winner = Column(String(8))
    started_at = Column(DateTime)
    ended_at = Column(DateTime)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="ab_tests")
    @validates("content_type")
    def validate_content_type(self, key: str, value: Any) -> str:
        return _validate_content_type(value)


class ViralScan(Base):
    __tablename__ = "viral_scans"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(BigInteger, nullable=False)
    query = Column(String(255), nullable=False)
    platform = Column(String(32), nullable=False)
    niche = Column(String(64))
    result_count = Column(Integer, default=0)
    results = Column(JSONB)
    created_at = Column(DateTime, default=func.now())
    expires_at = Column(DateTime, nullable=False)


class PricingConfig(Base):
    __tablename__ = "pricing_config"

    key = Column(String(64), primary_key=True)
    value = Column(JSONB, nullable=False)
    description = Column(String(256))
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())



class ProcessedVideo(Base):
    """Tracks processed video URLs for duplicate detection."""
    __tablename__ = "processed_videos"

    url_hash = Column(String(64), primary_key=True)
    source_url = Column(String, nullable=False)
    processed_at = Column(DateTime, nullable=False)
    file_path = Column(String, nullable=True)


async def record_processed_video(source_url: str, file_path: str) -> None:
    """Record a processed video for duplicate detection."""
    import hashlib
    from datetime import datetime

    url_hash = hashlib.sha256(source_url.encode()).hexdigest()
    async with get_async_session() as session:
        now = datetime.utcnow()
        stmt = pg_insert(ProcessedVideo).values(
            url_hash=url_hash,
            source_url=source_url,
            processed_at=now,
            file_path=file_path,
        ).on_conflict_do_update(
            index_elements=[ProcessedVideo.url_hash],
            set_=dict(processed_at=now, file_path=file_path),
        )
        await session.execute(stmt)
        await session.commit()


async def check_processed_video(url: str) -> dict:
    """Check if a video URL has been processed before.

    Returns {found, url_hash, processed_at, file_path}.
    """
    import hashlib

    url_hash = hashlib.sha256(url.encode()).hexdigest()
    async with get_async_session() as session:
        result = await session.execute(
            select(ProcessedVideo).where(ProcessedVideo.url_hash == url_hash)
        )
        row = result.scalar_one_or_none()
        if row:
            return {
                "found": True,
                "url_hash": url_hash,
                "processed_at": row.processed_at.isoformat() if row.processed_at else None,
                "file_path": row.file_path,
            }
    return {
        "found": False,
        "url_hash": url_hash,
        "processed_at": None,
        "file_path": None,
    }

# ══════════════════════════════════════════════════════════════
# SESSION HELPER
# ══════════════════════════════════════════════════════════════

async def get_db() -> AsyncSession:
    """Get an async database session."""
    async with get_async_session() as session:
        yield session


async def init_db():
    """Initialize database connection (verify connectivity)."""
    async with get_engine().begin() as conn:
        await conn.run_sync(lambda _: None)  # just test connection
    print("✅ Database connected (SQLAlchemy async)")
