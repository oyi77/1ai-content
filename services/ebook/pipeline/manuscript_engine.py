from __future__ import annotations

import json
import time
from pathlib import Path
from typing import TYPE_CHECKING, Callable, Optional

from services.ebook.ai_client import OmnirouteClient
from services.ebook.config import get_config
from services.ebook.logger import get_logger
from services.ebook.pipeline.chapter_generator import ChapterGenerator
from services.ebook.pipeline.model_tracker import ModelTracker
from services.ebook.pipeline.progress_tracker import ProgressTracker
from services.ebook.pipeline.style_context import StyleContext
from services.ebook.pipeline.token_calibrator import TokenCalibrator
from services.ebook.utils.error_handling import handle_gracefully

logger = get_logger(__name__)

if TYPE_CHECKING:
    from services.ebook.pipeline.pipeline_profile import PipelineProfile
    from services.ebook.pipeline.style_guide import StyleGuide


class ManuscriptChunker:
    def chunk(self, chapters):
        return chapters


class ManuscriptContentGenerator:
    def __init__(self, ai_client, projects_dir):
        self.ai_client = ai_client
        self.projects_dir = projects_dir


class ManuscriptQARetry:
    def __init__(self, chapter_generator):
        self.chapter_generator = chapter_generator


class ManuscriptEngine:
    def __init__(
        self,
        ai_client: OmnirouteClient | None = None,
        projects_dir: Path | str = "projects",
    ):
        self.ai_client = ai_client or OmnirouteClient()
        self.projects_dir = Path(projects_dir)
        # Namespace stats file by provider so Ollama/OmniRoute caches don't bleed
        _provider = self.ai_client.provider
        _stats_file = Path("projects") / f"model_stats_{_provider}.json"
        self.model_tracker = ModelTracker(stats_file=_stats_file)
        self.token_calibrator = TokenCalibrator()
        self.chapter_generator = ChapterGenerator(
            ai_client=self.ai_client,
            model_tracker=self.model_tracker,
            token_calibrator=self.token_calibrator,
        )

    def generate(
        self,
        project_id: int,
        outline: dict,
        strategy: dict,
        on_progress: Optional[Callable[[int, str], None]] = None,
        profile: "PipelineProfile | None" = None,
        language: str = "en",
        quality_level: str = "fast",
        target_languages: list[str] | None = None,
        manuscript_model: str | None = None,
        style_ctx: Optional[StyleContext] = None,
        style_guide: "StyleGuide | None" = None,
    ) -> dict:
        from services.ebook.pipeline.refinement_engine import RefinementEngine

        self._quality_level = quality_level
        chapters = outline.get("chapters", [])
        project_dir = self.projects_dir / str(project_id)
        chapters_dir = project_dir / "chapters"
        chapters_dir.mkdir(parents=True, exist_ok=True)

        manuscript_content = []
        chapter_metadata = []

        progress = ProgressTracker(
            on_progress=on_progress, total_steps=len(chapters) + 2
        )
        progress.update(0, "Starting manuscript generation...")

        if style_ctx is None:
            style_ctx = StyleContext.load_or_default(
                project_dir / "style_context.json",
                tone=strategy.get("tone", "conversational"),
            )

        if profile and getattr(profile, "is_fiction", False):
            characters = []
            for role in ["protagonist", "antagonist"]:
                val = strategy.get(role, "")
                if val:
                    characters.append(
                        {"name": str(val), "role": role, "description": str(val)[:100]}
                    )
            if characters:
                style_ctx.characters = characters

        refiner = RefinementEngine(
            ai_client=self.ai_client,
            language=language,
            tone=strategy.get("tone", "conversational"),
            quality_level=quality_level,
        )

        for i, chapter in enumerate(chapters, 1):
            progress.update(
                int((i - 1) / len(chapters) * 100),
                f"Writing chapter {i}/{len(chapters)}...",
            )

            chapter_content = self.chapter_generator.generate_chapter(
                chapter=chapter,
                strategy=strategy,
                chapter_num=i,
                total_chapters=len(chapters),
                language=language,
                style_ctx=style_ctx,
                profile=profile,
                manuscript_model=manuscript_model,
                style_guide=style_guide,
            )

            chapter_content = refiner.refine(chapter_content)

            # Extract terminology for voice consistency (skip if too short or AI unavailable)
            if len(chapter_content.split()) > 100:
                self._extract_terminology(chapter_content, style_ctx)

            chapter_file = chapters_dir / f"{i}.md"
            with open(chapter_file, "w") as f:
                f.write(chapter_content)

            manuscript_content.append(
                f"\n\n---\n\n## Chapter {i}: {chapter.get('title', f'Chapter {i}')}\n\n"
            )
            manuscript_content.append(chapter_content)

            word_count = len(chapter_content.split())
            chapter_metadata.append(
                {
                    "chapter": i,
                    "title": chapter.get("title"),
                    "word_count": word_count,
                }
            )

            style_ctx.previous_chapter_ending = chapter_content[-400:]
            style_ctx.save(project_dir / "style_context.json")

        progress.update(95, "Finalizing manuscript...")
        retry_fixes = self._retry_failed_chapters(
            chapters=chapters,
            chapters_dir=chapters_dir,
            strategy=strategy,
            language=language,
            style_ctx=style_ctx,
            profile=profile,
            manuscript_model=manuscript_model,
            style_guide=style_guide,
        )
        # Update chapter_metadata word counts for any retried chapters
        for chapter_num, new_content in retry_fixes.items():
            for meta in chapter_metadata:
                if meta["chapter"] == chapter_num:
                    meta["word_count"] = len(new_content.split())

        manuscript_file = project_dir / "manuscript.md"
        with open(manuscript_file, "w") as f:
            f.write("".join(manuscript_content))

        with open(project_dir / "manuscript.json", "w") as f:
            json.dump(
                {
                    "chapters": chapter_metadata,
                    "total_word_count": sum(c["word_count"] for c in chapter_metadata),
                },
                f,
                indent=2,
            )

        progress.complete("Manuscript generation complete!")

        editions: dict = {}
        if target_languages and len(target_languages) > 1:
            import logging

            for lang in target_languages[1:]:
                progress.update(0, f"Generating {lang} edition...")
                try:
                    edition_result = self._generate_edition(
                        project_id=project_id,
                        outline=outline,
                        strategy=strategy,
                        language=lang,
                        profile=profile,
                        quality_level=getattr(self, "_quality_level", "fast"),
                        style_guide=style_guide,
                    )
                    editions[lang] = edition_result
                except Exception as e:
                    logging.warning(f"Failed to generate '{lang}' edition: {e}")
                    editions[lang] = {"error": str(e)}

        return {
            "manuscript": manuscript_file,
            "chapters": chapter_metadata,
            "editions": editions,
        }

    def _retry_failed_chapters(
        self,
        chapters: list[dict],
        chapters_dir: Path,
        strategy: dict,
        language: str,
        style_ctx,
        profile,
        manuscript_model: str | None,
        max_retries: int | None = None,
        style_guide: "StyleGuide | None" = None,
    ) -> dict[int, str]:
        """Re-generate chapters that are below the minimum word count. Returns {chapter_num: new_content}."""
        cfg = get_config()
        max_retries = max_retries or cfg.qa_max_retry_attempts
        fixes: dict[int, str] = {}

        for i, chapter in enumerate(chapters, 1):
            chapter_file = chapters_dir / f"{i}.md"
            if not chapter_file.exists():
                continue
            content = chapter_file.read_text()
            word_count = len(content.split())
            target = chapter.get("estimated_word_count", cfg.qa_min_chapter_words)
            min_words = int(target * (1 - cfg.qa_word_count_tolerance))
            if word_count >= min_words:
                continue

            for attempt in range(max_retries):
                retry_content = self.chapter_generator.generate_chapter(
                    chapter=chapter,
                    strategy=strategy,
                    chapter_num=i,
                    total_chapters=len(chapters),
                    language=language,
                    style_ctx=style_ctx,
                    profile=profile,
                    manuscript_model=manuscript_model,
                    style_guide=style_guide,
                )
                if len(retry_content.split()) >= min_words:
                    chapter_file.write_text(retry_content)
                    fixes[i] = retry_content
                    break

        return fixes

    def _generate_edition(
        self,
        project_id: int,
        outline: dict,
        strategy: dict,
        language: str,
        profile: "PipelineProfile | None" = None,
        quality_level: str = "fast",
        style_guide: "StyleGuide | None" = None,
    ) -> dict:
        from services.ebook.export.file_manager import FileManager

        fm = FileManager(self.projects_dir)
        edition_dir = fm.get_edition_dir(project_id, language)
        chapters_dir = edition_dir / "chapters"
        chapters_dir.mkdir(parents=True, exist_ok=True)

        chapters = outline.get("chapters", [])
        style_ctx = StyleContext(tone=strategy.get("tone", "conversational"))
        manuscript_parts = []
        chapter_metadata = []

        for i, chapter in enumerate(chapters, 1):
            chapter_content = self.chapter_generator.generate_chapter(
                chapter=chapter,
                strategy=strategy,
                chapter_num=i,
                total_chapters=len(chapters),
                language=language,
                profile=profile,
                style_ctx=style_ctx,
                style_guide=style_guide,
            )
            style_ctx.previous_chapter_ending = chapter_content[-400:]
            style_ctx.save(edition_dir / "style_context.json")
            chapter_file = chapters_dir / f"{i}.md"
            chapter_file.write_text(chapter_content)
            manuscript_parts.append(
                f"\n\n## {chapter.get('title', f'Chapter {i}')}\n\n{chapter_content}"
            )
            chapter_metadata.append(
                {
                    "chapter": i,
                    "title": chapter.get("title"),
                    "word_count": len(chapter_content.split()),
                }
            )

        manuscript_file = edition_dir / "manuscript.md"
        manuscript_file.write_text("".join(manuscript_parts))
        return {"manuscript": str(manuscript_file), "chapters": chapter_metadata}

    def regenerate_chapter(self, chapter_idx: int, failure_context: str) -> str:
        """Re-generate a single chapter with QA failure context injected into prompt.

        Called by the post-QA retry loop in the orchestrator.
        """
        import structlog

        log = structlog.get_logger(__name__)
        log.info(
            "regenerating_chapter",
            chapter_idx=chapter_idx,
            failure_context=failure_context[:100],
        )

        # regenerate_chapter requires a project_id set on the instance;
        # callers must set self._project_id before calling this method.
        project_id = getattr(self, "_project_id", None)
        if project_id is None:
            raise RuntimeError(
                "ManuscriptEngine._project_id must be set before calling regenerate_chapter"
            )

        project_dir = self.projects_dir / str(project_id)
        outline_path = project_dir / "outline.json"
        strategy_path = project_dir / "strategy.json"
        style_ctx_path = project_dir / "style_context.json"

        import json as _json

        outline = _json.loads(outline_path.read_text()) if outline_path.exists() else {}
        strategy = (
            _json.loads(strategy_path.read_text()) if strategy_path.exists() else {}
        )
        style_ctx = (
            StyleContext.load_or_default(
                style_ctx_path, tone=strategy.get("tone", "conversational")
            )
            if style_ctx_path.exists()
            else StyleContext(tone=strategy.get("tone", "conversational"))
        )

        chapters = outline.get("chapters", [])
        if chapter_idx >= len(chapters):
            log.warning("chapter_idx_out_of_range", chapter_idx=chapter_idx)
            return ""

        chapter = chapters[chapter_idx]

        extra_instruction = (
            f"\n\nIMPORTANT: A previous attempt at this chapter failed quality review. "
            f"Specific issues to fix: {failure_context}\n"
            f"Please address these issues directly in your writing."
        )

        content = self.chapter_generator.generate_chapter(
            chapter=chapter,
            chapter_num=chapter_idx + 1,
            total_chapters=len(chapters),
            strategy=strategy,
            style_ctx=style_ctx,
            extra_instruction=extra_instruction,
        )

        chapter_path = project_dir / "chapters" / f"{chapter_idx + 1}.md"
        chapter_path.write_text(content, encoding="utf-8")
        log.info(
            "chapter_regenerated", chapter_idx=chapter_idx, words=len(content.split())
        )
        return content

    @handle_gracefully(default_return=None, log_level="info")
    def _extract_terminology(self, chapter_content: str, style_ctx) -> None:
        """Extract domain-specific terminology from chapter for consistency tracking.

        This is a best-effort operation that never blocks chapter generation.
        Failures are logged but not raised.
        """
        term_result = self.ai_client.generate_structured(
            prompt=(
                f"From this chapter excerpt, identify 1-2 domain-specific terms or metaphors "
                f"that should be used consistently throughout the ebook.\n\n"
                f"{chapter_content[:800]}\n\n"
                'Return JSON: {"terms": [{"term": "string", "definition": "1 sentence"}]}'
            ),
            system_prompt="You are an editor tracking terminology for consistency. Be concise.",
            response_schema={"terms": list},
            max_tokens=200,
            temperature=0.3,
        )
        if isinstance(term_result, dict):
            for t in term_result.get("terms", []):
                if isinstance(t, dict) and t.get("term"):
                    style_ctx.established_terminology[t["term"]] = t.get(
                        "definition", ""
                    )
