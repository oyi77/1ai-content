"""
Database layer — SQLAlchemy models + async session.

Maps to the same PostgreSQL tables as the Prisma schema on the TypeScript side.
Python services share the same database as the bot.
"""

import os
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    BigInteger, Boolean, Column, DateTime, DECIMAL as SADecimal,
    ForeignKey, Integer, String, Text, func,
)
from sqlalchemy.dialects import postgresql
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import DeclarativeBase, relationship, sessionmaker

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://openclaw:openclaw@localhost:5432/berkahkarya",
)

# Convert sync URL to async
ASYNC_DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://")

engine = create_async_engine(ASYNC_DATABASE_URL, echo=False, pool_size=5, max_overflow=10)
async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


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


# ══════════════════════════════════════════════════════════════
# SESSION HELPER
# ══════════════════════════════════════════════════════════════

async def get_db() -> AsyncSession:
    """Get an async database session."""
    async with async_session() as session:
        yield session


async def init_db():
    """Initialize database connection (verify connectivity)."""
    async with engine.begin() as conn:
        await conn.run_sync(lambda _: None)  # just test connection
    print("✅ Database connected (SQLAlchemy async)")
