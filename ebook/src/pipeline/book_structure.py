"""Book structure generator: front matter and back matter for ebooks."""

from __future__ import annotations
import datetime
from pathlib import Path
from src.logger import get_logger
from src.utils.error_handling import handle_gracefully

logger = get_logger(__name__)


class BookStructureGenerator:
    """Generates front matter and back matter artifacts for an ebook project."""

    def __init__(self, ai_client=None, projects_dir: str = "projects"):
        self.ai_client = ai_client
        self.projects_dir = projects_dir

    def generate_front_matter(
        self, project: dict, outline: dict, project_dir: str = None
    ) -> None:
        """Generate and persist front matter files.

        Files written (skipped if already exist — resume-safe):
          front_matter/title_page.md
          front_matter/copyright.md
          front_matter/toc_page.md
          front_matter/dedication.md   (AI-generated)
          front_matter/preface.md      (AI-generated)
        """
        if project_dir is None:
            project_dir = str(Path(self.projects_dir) / project["id"])

        fm_dir = Path(project_dir) / "front_matter"
        fm_dir.mkdir(parents=True, exist_ok=True)

        self._write_if_missing(fm_dir / "title_page.md", self._title_page(project))
        self._write_if_missing(fm_dir / "copyright.md", self._copyright_page(project))
        self._write_if_missing(fm_dir / "toc_page.md", self._toc_page(outline))
        self._write_if_missing(fm_dir / "dedication.md", self._dedication(project))
        self._write_if_missing(fm_dir / "preface.md", self._preface(project))

        logger.info("front_matter_generated", project_id=project.get("id"))

    def generate_back_matter(
        self, project: dict, style_ctx, project_dir: str = None
    ) -> None:
        """Generate and persist back matter files.

        Files written (skipped if already exist — resume-safe):
          back_matter/glossary.md      (from established_terminology)
          back_matter/about_author.md  (AI-generated)
        """
        if project_dir is None:
            project_dir = str(Path(self.projects_dir) / project["id"])

        bm_dir = Path(project_dir) / "back_matter"
        bm_dir.mkdir(parents=True, exist_ok=True)

        terminology = getattr(style_ctx, "established_terminology", {}) or {}
        self._write_if_missing(bm_dir / "glossary.md", self._glossary(terminology))
        self._write_if_missing(bm_dir / "about_author.md", self._about_author(project))

        logger.info("back_matter_generated", project_id=project.get("id"))

    # ── template generators ──────────────────────────────────────────────────

    def _title_page(self, project: dict) -> str:
        title = project.get("title", "Untitled")
        subtitle = project.get("subtitle", "")
        author = project.get("author", "")
        year = datetime.date.today().year
        lines = [f"# {title}"]
        if subtitle:
            lines.append(f"\n*{subtitle}*")
        if author:
            lines.append(f"\n**{author}**")
        lines.append(f"\n{year}")
        return "\n".join(lines)

    def _copyright_page(self, project: dict) -> str:
        year = datetime.date.today().year
        author = project.get("author", "The Author")
        title = project.get("title", "This Work")
        return (
            f"Copyright © {year} {author}\n\n"
            f"All rights reserved. No part of *{title}* may be reproduced, "
            f"distributed, or transmitted in any form or by any means without "
            f"the prior written permission of the publisher.\n\n"
            f"First published {year}\n\n"
            f"ISBN: [Pending]\n\n"
            f"Printed and distributed digitally."
        )

    def _toc_page(self, outline: dict) -> str:
        lines = ["# Table of Contents\n"]
        for ch in outline.get("chapters", []):
            num = ch.get("number", "")
            title = ch.get("title", "")
            lines.append(f"{num}. {title}")
        return "\n".join(lines)

    def _dedication(self, project: dict) -> str:
        if not self.ai_client:
            return "*For every reader who dares to keep learning.*"
        return (
            self._generate_dedication(project)
            or "*For every reader who dares to keep learning.*"
        )

    @handle_gracefully(default_return=None, log_level="info")
    def _generate_dedication(self, project: dict) -> str | None:
        """Generate a heartfelt book dedication using AI."""
        prompt = (
            f"Write a short, heartfelt book dedication (1-2 sentences) for an ebook titled "
            f"'{project.get('title', 'this book')}'. "
            f"Be sincere, warm, and universal. No quotes, no explanations — just the dedication text."
        )
        text = self.ai_client.generate_text(prompt, max_tokens=80)
        return f"*{text.strip()}*"

    def _preface(self, project: dict) -> str:
        if not self.ai_client:
            return "# Preface\n\nThis book was written to provide practical, actionable guidance."
        return (
            self._generate_preface(project)
            or "# Preface\n\nThis book was written to provide practical, actionable guidance."
        )

    @handle_gracefully(default_return=None, log_level="info")
    def _generate_preface(self, project: dict) -> str | None:
        """Generate a preface for the ebook using AI."""
        prompt = (
            f"Write a preface (200-250 words) for an ebook titled '{project.get('title', 'this book')}'. "
            f"Write in first person as the author. Explain why you wrote this book, who it is for, "
            f"and what the reader will gain. Be warm, direct, and authentic. "
            f"Start with 'I wrote this book because...' or similar personal opening."
        )
        text = self.ai_client.generate_text(prompt, max_tokens=350)
        return f"# Preface\n\n{text.strip()}"

    def _glossary(self, terminology: dict) -> str:
        if not terminology:
            return "# Glossary\n\n*No specialized terms recorded for this book.*"
        lines = ["# Glossary\n"]
        for term, definition in sorted(terminology.items()):
            lines.append(f"**{term}**\n: {definition}\n")
        return "\n".join(lines)

    def _about_author(self, project: dict) -> str:
        if not self.ai_client:
            return "# About the Author\n\nThe author is an expert in their field."
        return (
            self._generate_about_author(project)
            or "# About the Author\n\nThe author is a passionate expert dedicated to helping readers achieve their goals."
        )

    @handle_gracefully(default_return=None, log_level="info")
    def _generate_about_author(self, project: dict) -> str | None:
        """Generate an 'About the Author' bio using AI."""
        prompt = (
            f"Write a short 'About the Author' bio (100-150 words) for an ebook titled "
            f"'{project.get('title', 'this book')}'. "
            f"Write in third person. Make the author sound credible and approachable. "
            f"Mention their expertise in the subject area, their passion for the topic, "
            f"and their goal of helping readers. Do not use a real person's name — use 'the author'."
        )
        text = self.ai_client.generate_text(prompt, max_tokens=200)
        return f"# About the Author\n\n{text.strip()}"

    # ── helpers ──────────────────────────────────────────────────────────────

    def _write_if_missing(self, path: Path, content: str) -> None:
        """Write file only if it doesn't exist (resume-safe)."""
        if path.exists():
            logger.debug("skipping_existing_file", path=str(path))
            return
        path.write_text(content, encoding="utf-8")
        logger.debug("wrote_file", path=str(path))
