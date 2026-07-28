from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING

from services.ebook.ai_client import OmnirouteClient
from services.ebook.config import get_config
from services.ebook.logger import get_logger
from services.ebook.pipeline.prose_scorer import ProseScorer
from services.ebook.pipeline.chapter_structure_checker import ChapterStructureChecker

logger = get_logger(__name__)

if TYPE_CHECKING:
    from services.ebook.pipeline.pipeline_profile import PipelineProfile


class QAEngine:
    def __init__(
        self,
        ai_client: OmnirouteClient | None = None,
        quality_level: str = "fast",
        prose_scorer: ProseScorer | None = None,
        structure_checker: ChapterStructureChecker | None = None,
    ):
        self.ai_client = ai_client
        self.quality_level = quality_level
        self.prose_scorer = prose_scorer or ProseScorer()
        self.structure_checker = structure_checker or ChapterStructureChecker()

    def run(
        self,
        manuscript: dict,
        outline: dict,
        strategy: dict | None = None,
        profile: PipelineProfile | None = None,
    ) -> dict:
        issues = []
        scores = {}

        structure_issues = self._check_structure(manuscript, outline)
        issues.extend(structure_issues)

        heading_issues = self._check_duplicate_headings(manuscript)
        issues.extend(heading_issues)

        scores["structure"] = 0.0 if (structure_issues or heading_issues) else 1.0

        word_count_issues = self._check_word_count(manuscript, outline)
        issues.extend(word_count_issues)
        scores["word_count"] = 0.0 if word_count_issues else 1.0

        if strategy:
            consistency_score = self._check_consistency(manuscript, strategy)
            if consistency_score is not None:
                scores["consistency"] = consistency_score

        # Prose quality check (per-chapter, English only)
        language = strategy.get("language", "en") if strategy else "en"
        prose_scores = []
        prose_quality_enabled = get_config().qa_prose_quality_enabled
        for ch in manuscript.get("chapters", []):
            content = ch.get("content", "")
            if content:
                pq = self._check_prose_quality(content, language)
                if not pq.get("skipped"):
                    prose_scores.append(pq["prose_quality"])
                    if prose_quality_enabled and pq["prose_quality"] < 0.8:
                        issues.append(
                            f"Chapter {ch.get('chapter','?')} prose quality {pq['prose_quality']:.2f} below threshold"
                        )

        if prose_scores and prose_quality_enabled:
            scores["prose_quality"] = round(sum(prose_scores) / len(prose_scores), 3)

        # Chapter structure check (per-chapter)
        structure_scores = []
        for ch in manuscript.get("chapters", []):
            content = ch.get("content", "")
            if content:
                sc = self._check_chapter_structure(
                    content, ch.get("title", f"Chapter {ch.get('chapter','?')}")
                )
                if not sc.get("skipped"):
                    structure_scores.append(sc["structure_score"])
                    issues.extend(sc.get("issues", []))

        if structure_scores:
            scores["chapter_structure"] = round(
                sum(structure_scores) / len(structure_scores), 3
            )

        from services.ebook.pipeline.content_safety import ContentSafety

        safety = ContentSafety()
        # Build a text sample from chapter titles for a lightweight check
        chapter_titles = " ".join(
            ch.get("title", "") for ch in manuscript.get("chapters", [])
        )
        safety_result = safety.check_content(chapter_titles)
        if not safety_result["passed"]:
            issues.extend(safety_result["issues"])
        scores["safety"] = 0.0 if safety_result["issues"] else 1.0

        passed = len(issues) == 0 and all(s >= 0.8 for s in scores.values())

        return {
            "passed": passed,
            "issues": issues,
            "scores": scores,
        }

    def _check_structure(self, manuscript: dict, outline: dict) -> list[str]:
        issues = []
        manuscript_titles = {
            ch.get("title", "").lower() for ch in manuscript.get("chapters", [])
        }
        outline_titles = {
            ch.get("title", "").lower() for ch in outline.get("chapters", [])
        }

        missing = outline_titles - manuscript_titles
        if missing:
            issues.append(f"Missing chapters: {', '.join(missing)}")

        return issues

    def _check_duplicate_headings(self, manuscript: dict) -> list[str]:
        issues = []
        for ch in manuscript.get("chapters", []):
            content = ch.get("content", "")
            if not content:
                continue
            chapter_num = ch.get("chapter", "?")
            headings = [
                line.strip() for line in content.splitlines() if line.startswith("#")
            ]
            if len(headings) != len(set(headings)):
                dupes = [h for h in set(headings) if headings.count(h) > 1]
                issues.append(
                    f"Chapter {chapter_num} has duplicate headings: {', '.join(dupes[:3])}"
                )
        return issues

    def _check_word_count(self, manuscript: dict, outline: dict) -> list[str]:
        issues = []

        # Build a title -> outline chapter map for accurate matching
        outline_by_title = {
            ch.get("title", "").lower(): ch for ch in outline.get("chapters", [])
        }

        for i, chapter in enumerate(manuscript.get("chapters", []), 1):
            word_count = chapter.get("word_count", 0)
            title_key = chapter.get("title", "").lower()

            outline_ch = outline_by_title.get(title_key, {})
            if not outline_ch:
                # Fall back to positional lookup when title doesn't match
                chapters_list = outline.get("chapters", [])
                outline_ch = chapters_list[i - 1] if i <= len(chapters_list) else {}

            target = outline_ch.get("estimated_word_count", 500)

            tolerance = get_config().qa_word_count_tolerance
            # Only fail if too short — longer chapters are acceptable (more content = better)
            if word_count < target * (1 - tolerance):
                issues.append(
                    f"Chapter {i} word count ({word_count}) below -{tolerance*100:.0f}% of target ({target})"
                )

        return issues

    def _check_prose_quality(self, chapter_content: str, language: str = "en") -> dict:
        """Delegate prose quality scoring to ProseScorer. English-only; returns skipped for other languages."""
        if language and language.lower() not in ("english", "en", ""):
            return {
                "prose_quality": None,
                "skipped": True,
                "reason": f"language={language}",
            }

        result = self.prose_scorer.score(chapter_content)

        slop_hits = result.details.get("slop_hits", [])

        # Architecture check (action steps + chapter summary) — preserved from original
        text_lower = chapter_content.lower()
        has_action_steps = (
            "### action steps" in text_lower or "## action steps" in text_lower
        )
        has_summary = (
            "### chapter summary" in text_lower
            or "## chapter summary" in text_lower
            or "## summary" in text_lower
        )

        # Abstract opener check — preserved from original
        first_200 = chapter_content[:200].lower()
        abstract_openers = [
            "in today's world",
            "in today's fast",
            "as we explore",
            "it is important",
        ]
        has_abstract_opener = any(op in first_200 for op in abstract_openers)

        # Apply architecture penalty on top of ProseScorer score (action steps + summary)
        architecture_penalty = (0 if has_action_steps else 0.1) + (
            0 if has_summary else 0.1
        )
        final_score = max(0.0, min(1.0, result.score - architecture_penalty))

        return {
            "prose_quality": round(final_score, 3),
            "flesch_reading_ease": result.flesch_score,
            "passive_voice_ratio": result.passive_ratio,
            "ai_slop_density": result.slop_hit_count,
            "sentence_length_stdev": None,
            "mattr": None,
            "issues": slop_hits[:5],
            "skipped": False,
            "details": {
                "banned_phrases_found": slop_hits,
                "has_abstract_opener": has_abstract_opener,
                "has_action_steps": has_action_steps,
                "has_summary": has_summary,
                "flesch_score": result.flesch_score,
                "passive_ratio": result.passive_ratio,
                "repetition_ratio": result.repetition_ratio,
            },
        }

    def _check_chapter_structure(self, content: str, chapter_title: str) -> dict:
        config = get_config()
        if not config.qa_structure_check_enabled:
            return {"structure_score": 1.0, "skipped": True}
        result = self.structure_checker.check(content)
        issues = []
        if result.prohibited_openers:
            issues.append(f"Prohibited opener in '{chapter_title}'")
        if result.h2_count < 2:
            issues.append(
                f"Too few sections in '{chapter_title}' (only {result.h2_count} H2s)"
            )
        return {
            "structure_score": result.structure_score,
            "h2_count": result.h2_count,
            "has_case_study": result.has_case_study,
            "issues": issues,
            "skipped": False,
        }

    def _check_consistency(self, manuscript: dict, strategy: dict) -> float | None:
        if self.quality_level != "thorough" or self.ai_client is None:
            return None
        chapters = manuscript.get("chapters", [])
        if not chapters:
            return None
        sample_titles = [
            f"- {ch.get('title', f'Chapter {i+1}')}" for i, ch in enumerate(chapters)
        ]
        tone = strategy.get("tone", "conversational")
        prompt = (
            f"Rate the consistency of this ebook's chapter structure on a scale of 0.0 to 1.0.\n\n"
            f"Target tone: {tone}\nChapters ({len(chapters)} total):\n"
            + "\n".join(sample_titles)
            + '\n\nReturn only a JSON object: {"score": <float 0.0-1.0>, "reason": "<brief reason>"}'
        )
        try:
            result = self.ai_client.generate_structured(
                prompt=prompt,
                system_prompt="You are a book editor evaluating manuscript consistency. Be precise and concise.",
                response_schema={"score": float, "reason": str},
            )
            score = float(result.get("score", 0.0))
            return max(0.0, min(1.0, score))
        except Exception as e:
            logger.warning("Consistency check failed", error=str(e))
            return None

    def save_report(
        self, project_id: int, report: dict, projects_dir: Path | str = "projects"
    ) -> None:
        project_dir = Path(projects_dir) / str(project_id)
        project_dir.mkdir(parents=True, exist_ok=True)

        with open(project_dir / "qa_report.json", "w") as f:
            json.dump(report, f, indent=2)
