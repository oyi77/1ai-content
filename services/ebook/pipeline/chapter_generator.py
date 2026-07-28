from __future__ import annotations

import time
from typing import TYPE_CHECKING

from services.ebook.ai_client import OmnirouteClient
from services.ebook.config import get_config
from services.ebook.i18n.languages import language_instruction
from services.ebook.pipeline.model_tracker import ModelTracker
from services.ebook.pipeline.style_context import StyleContext
from services.ebook.pipeline.token_calibrator import TokenCalibrator

if TYPE_CHECKING:
    from services.ebook.pipeline.pipeline_profile import PipelineProfile
    from services.ebook.pipeline.style_guide import StyleGuide


class ChapterGenerator:
    """Generates individual chapter content with AI-powered writing.

    Handles chapter structure: hook/intro, subchapters, and outro/summary.
    Tracks model performance and calibrates token budgets for optimal output.
    """

    def __init__(
        self,
        ai_client: OmnirouteClient | None = None,
        model_tracker: ModelTracker | None = None,
        token_calibrator: TokenCalibrator | None = None,
    ):
        self.ai_client = ai_client or OmnirouteClient()
        self.model_tracker = model_tracker or ModelTracker()
        self.token_calibrator = token_calibrator or TokenCalibrator()

    def generate_chapter(
        self,
        chapter: dict,
        strategy: dict,
        chapter_num: int,
        total_chapters: int,
        language: str = "en",
        style_ctx: StyleContext | None = None,
        profile: "PipelineProfile | None" = None,
        manuscript_model: str | None = None,
        style_guide: "StyleGuide | None" = None,
        extra_instruction: str = "",
    ) -> str:
        """Generate complete chapter content with intro, subchapters, and outro.

        Args:
            chapter: Chapter dict with title, summary, subchapters, estimated_word_count
            strategy: Strategy dict with tone, audience
            chapter_num: Current chapter number (1-indexed)
            total_chapters: Total number of chapters in the book
            language: Target language code (default: "en")
            style_ctx: Style context for consistency across chapters
            profile: Pipeline profile (e.g., fiction mode)
            manuscript_model: Override model for chapter generation
            style_guide: Style guide for formatting and conventions
            extra_instruction: Additional instructions (e.g., QA failure context)

        Returns:
            Complete chapter content as markdown string
        """
        title = chapter.get("title", "")
        summary = chapter.get("summary", "")
        subchapters = chapter.get("subchapters", [])

        tone = strategy.get("tone", "conversational")
        audience = strategy.get("audience", "general")
        lang_instr = language_instruction(language)
        style_block = (
            f"\n\nStyle Guide:\n{style_ctx.to_prompt_block()}" if style_ctx else ""
        )
        fiction_block = (
            "\n\nFiction: show don't tell, use dialogue, sensory details, consistent character voice."
            if profile and getattr(profile, "is_fiction", False)
            else ""
        )

        style_guide_block = ""
        if style_guide is not None:
            tier = get_config().model_capability_tier
            style_guide_block = f"\n\n{style_guide.to_system_prompt_block(tier=tier)}"

        import os

        # Use caller-supplied model; fall back to env var, then hardcoded default.
        _default_model = os.getenv("EBOOK_MANUSCRIPT_MODEL", get_config().default_model)
        # When using a combo model (auto/*), bypass ModelTracker — combos already handle routing
        _use_tracker = not _default_model.startswith("auto/")

        base_system = (
            f"You are an expert ebook writer. Tone: {tone}. Audience: {audience}.\n"
            f"Chapter {chapter_num}/{total_chapters}: {title}\nSummary: {summary}\n"
            f"{lang_instr}{style_block}{fiction_block}{style_guide_block}"
            f"{extra_instruction}\n"
            "Do NOT repeat the section heading in the body text. Write in full paragraphs."
        )

        parts: list[str] = []

        # 1. Hook + introduction (rotate hook type by chapter number)
        hook_types = {
            0: "a micro-anecdote (2-4 sentences placing a specific person in a concrete moment)",
            1: "a counterintuitive claim that challenges conventional wisdom",
            2: "a problem statement that makes the reader feel directly understood",
        }
        hook_instruction = hook_types[(chapter_num - 1) % 3]

        intro_target = max(300, chapter.get("estimated_word_count", 2000) * 0.15)
        intro_tokens = self.token_calibrator.calibrated_tokens(
            "intro", int(intro_target)
        )
        intro_model = manuscript_model or (
            self.model_tracker.best_model("manuscript_intro", default=_default_model)
            if _use_tracker
            else _default_model
        )
        _t0 = time.time()
        intro_prompt = (
            f"Write the opening for chapter '{title}'.\n"
            f"Hook type for this chapter: {hook_instruction}\n"
            "Include:\n"
            "- Hook paragraph using the specified hook type (NO heading, never start with 'In today's world' or 'As we explore')\n"
            "- Chapter promise: one sentence starting with 'By the end of this chapter, you'll...'\n"
            "- Introduction paragraph (what this chapter covers)\n"
            "Do NOT include the chapter title. Start directly with the hook."
        )
        intro = self.ai_client.generate_text(
            prompt=intro_prompt,
            system_prompt=base_system,
            model=intro_model,
            max_tokens=intro_tokens,
            temperature=0.7,
        )
        _latency = (time.time() - _t0) * 1000
        _success = len(intro.strip()) > 50
        _tokens = int(len(intro.split()) * 1.3)
        self.model_tracker.record(
            intro_model, "manuscript_intro", _success, _tokens, _latency
        )
        self.token_calibrator.record("intro", intro_tokens, len(intro.split()))
        parts.append(intro.strip())

        # 2. Each subchapter section
        sub_target = max(
            400,
            chapter.get("estimated_word_count", 2000) / max(len(subchapters), 1) * 0.7,
        )
        sub_tokens = self.token_calibrator.calibrated_tokens(
            "subchapter", int(sub_target)
        )
        sub_model = manuscript_model or (
            self.model_tracker.best_model(
                "manuscript_subchapter", default=_default_model
            )
            if _use_tracker
            else _default_model
        )
        for sub in subchapters:
            if isinstance(sub, dict):
                sub_title = sub.get("title", str(sub))
                sub_summary = sub.get("summary", "")
            else:
                sub_title = str(sub)
                sub_summary = ""

            context = (
                f"\nContext for this section: {sub_summary}" if sub_summary else ""
            )

            terms_block = ""
            if style_ctx and style_ctx.established_terminology:
                terms = "; ".join(
                    f"{k}: {v}"
                    for k, v in list(style_ctx.established_terminology.items())[:5]
                )
                terms_block = f"\nMaintain these established terms: {terms}"

            _t0 = time.time()
            section = self.ai_client.generate_text(
                prompt=(
                    f"Write the section '{sub_title}' for chapter '{title}'.\n"
                    f"{context}\n"
                    f"{terms_block}\n"
                    "Write 3-5 substantial paragraphs covering the topic in depth.\n"
                    "Be specific, practical, and engaging. Do NOT include a heading — start directly with prose."
                ),
                system_prompt=base_system,
                model=sub_model,
                max_tokens=sub_tokens,
                temperature=0.7,
            )
            _latency = (time.time() - _t0) * 1000
            _success = len(section.strip()) > 50
            _tokens = int(len(section.split()) * 1.3)
            self.model_tracker.record(
                sub_model, "manuscript_subchapter", _success, _tokens, _latency
            )
            self.token_calibrator.record("subchapter", sub_tokens, len(section.split()))
            # Strip any heading the AI added despite instructions, then prepend our own
            section_body = "\n".join(
                line
                for i, line in enumerate(section.strip().splitlines())
                if not (i == 0 and line.startswith("#"))
            )
            parts.append(f"\n\n### {sub_title}\n\n{section_body.strip()}")

        # 3. Summary + transition (structured enrichment when enabled)
        outro_target = max(150, chapter.get("estimated_word_count", 2000) * 0.10)
        outro_tokens = self.token_calibrator.calibrated_tokens(
            "outro", int(outro_target)
        )
        outro_model = manuscript_model or (
            self.model_tracker.best_model("manuscript_outro", default=_default_model)
            if _use_tracker
            else _default_model
        )

        if get_config().chapter_enrichment_enabled:
            enrichment_schema = {
                "chapter_summary_bullets": list,
                "callout_insight": str,
                "case_study": {"name": str, "conflict": str, "resolution": str},
                "action_steps": list,
                "bridge_sentence": str,
            }
            try:
                enrichment = self.ai_client.generate_structured(
                    prompt=(
                        f"Generate the closing elements for chapter '{title}'.\n"
                        f"Chapter context: {summary}\n"
                        "Provide:\n"
                        "- chapter_summary_bullets: list of 3-5 key takeaways (strings)\n"
                        "- callout_insight: one powerful key insight (1-2 sentences)\n"
                        "- case_study: a named composite person with conflict and resolution arc\n"
                        "- action_steps: list of 3 numbered actionable steps (imperative verbs)\n"
                        "- bridge_sentence: one sentence transitioning to the next chapter"
                    ),
                    system_prompt=base_system,
                    response_schema=enrichment_schema,
                    model=outro_model,
                    max_tokens=outro_tokens,
                    temperature=0.7,
                )

                if not isinstance(enrichment, dict):
                    raise ValueError("enrichment result is not a dict")

                # Render enrichment into markdown
                bullets = enrichment.get("chapter_summary_bullets", [])
                callout = enrichment.get("callout_insight", "")
                case_study = enrichment.get("case_study", {})
                action_steps = enrichment.get("action_steps", [])
                bridge = enrichment.get("bridge_sentence", "")

                enrichment_text = []
                if callout:
                    enrichment_text.append(f"\n\n> **Key Insight:** {callout}")
                if case_study and case_study.get("name"):
                    enrichment_text.append(
                        f"\n\n**Example: {case_study['name']}'s Story** — "
                        f"{case_study.get('conflict', '')} {case_study.get('resolution', '')}"
                    )
                if bullets:
                    enrichment_text.append(
                        "\n\n### Chapter Summary\n\n"
                        + "\n".join(f"- {b}" for b in bullets)
                    )
                if action_steps:
                    steps = "\n".join(f"{i+1}. {s}" for i, s in enumerate(action_steps))
                    enrichment_text.append(f"\n\n### Action Steps\n\n{steps}")
                if bridge:
                    enrichment_text.append(f"\n\n{bridge}")

                parts.append("".join(enrichment_text))

            except Exception as e:
                # Fallback to plain outro on enrichment failure
                from services.ebook.logger import get_logger

                logger = get_logger(__name__)
                logger.warning(
                    "Chapter enrichment failed, using plain outro",
                    chapter=title,
                    error=str(e),
                )
                _t0 = time.time()
                outro = self.ai_client.generate_text(
                    prompt=(
                        f"Write the closing for chapter '{title}'.\n"
                        "Include:\n"
                        "- Summary paragraph: 3-4 key takeaways from this chapter\n"
                        "- Transition sentence: one sentence bridging to the next chapter"
                    ),
                    system_prompt=base_system,
                    model=outro_model,
                    max_tokens=outro_tokens,
                    temperature=0.7,
                )
                _latency = (time.time() - _t0) * 1000
                _success = len(outro.strip()) > 50
                _tokens = int(len(outro.split()) * 1.3)
                self.model_tracker.record(
                    outro_model, "manuscript_outro", _success, _tokens, _latency
                )
                self.token_calibrator.record("outro", outro_tokens, len(outro.split()))
                parts.append(f"\n\n{outro.strip()}")
        else:
            # chapter_enrichment_enabled = False: use original outro
            _t0 = time.time()
            outro = self.ai_client.generate_text(
                prompt=(
                    f"Write the closing for chapter '{title}'.\n"
                    "Include:\n"
                    "- Summary paragraph: 3-4 key takeaways from this chapter\n"
                    "- Transition sentence: one sentence bridging to the next chapter"
                ),
                system_prompt=base_system,
                model=outro_model,
                max_tokens=outro_tokens,
                temperature=0.7,
            )
            _latency = (time.time() - _t0) * 1000
            _success = len(outro.strip()) > 50
            _tokens = int(len(outro.split()) * 1.3)
            self.model_tracker.record(
                outro_model, "manuscript_outro", _success, _tokens, _latency
            )
            self.token_calibrator.record("outro", outro_tokens, len(outro.split()))
            parts.append(f"\n\n{outro.strip()}")

        return "\n\n".join(parts)
