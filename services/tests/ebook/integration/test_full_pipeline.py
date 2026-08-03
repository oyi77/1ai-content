import pytest
from pathlib import Path
from unittest.mock import MagicMock


@pytest.mark.integration
def test_full_pipeline_integration(test_db_path, temp_project_dir):
    from services.ebook.pipeline.orchestrator import PipelineOrchestrator
    from services.ebook.db.repository import ProjectRepository
    from services.ebook.db.database import get_engine, create_tables as sa_create_tables
    import os

    engine = get_engine(test_db_path)
    sa_create_tables(engine)
    engine.dispose()

    repo = ProjectRepository(test_db_path)
    project_id = repo.create_project(
        title="Test Integration Ebook",
        idea="How to test an ebook generation pipeline",
        product_mode="lead_magnet",
        chapter_count=2,
    )

    # Realistic prose mock — long enough to pass word-count (500 target) and basic QA
    _MOCK_PROSE = """
The most effective leaders share one counterintuitive trait: they listen more than they speak.
In study after study, teams led by quiet, attentive managers outperform those run by charismatic talkers.
Why? Because listening creates the psychological safety that unlocks honest feedback.
When your team knows you hear them, they bring you problems before they become crises.
Start this week by holding a thirty-minute one-on-one with no agenda except to ask questions.

Consider Sarah, a regional director who inherited a team with forty percent turnover.
She spent her first month doing nothing but listening to frontline staff, customers, and data nobody had read.
By month three, she had a clear picture of three fixable problems her predecessor had missed entirely.
Her team's turnover dropped to eight percent within a year, not because she was smarter, but because she paid attention.

The technique is simple but requires discipline. Block your calendar for focused listening sessions.
Turn off notifications. Ask open-ended questions and resist the urge to jump in with solutions.
Your job in these sessions is to understand, not to fix.
The fixing comes later, and it will be far more accurate because of what you learned.

Most organizations have feedback mechanisms that look good on paper but fail in practice.
Annual performance reviews arrive too late to change anything meaningful.
Suggestion boxes collect dust. Town halls become one-way broadcasts.
The problem is not the format but the frequency and the follow-through.
People stop sharing when they see their input disappear without acknowledgment.

Listening at scale requires systems, not just intentions. Build a weekly cadence of brief check-ins.
Use structured questions so you gather comparable data over time.
Ask the same three questions every week: What is working? What is blocked? What do you need from me?
The consistency matters as much as the questions themselves.

However, listening without action destroys trust faster than never listening at all.
Your team will forgive a leader who sometimes misses the mark, but they will not forgive one who asks for input and then ignores it.
Whenever someone raises a concern, close the loop: acknowledge what you heard, explain what you will do about it, and follow up with a concrete update.
Even a small visible change, like fixing the scheduling conflict someone mentioned, proves that the exercise is real.

Measurement turns listening into a discipline. Track how many suggestions you receive and how many you act on.
Review the trends every quarter: which concerns keep resurfacing, which improvements changed the numbers, and which conversations you avoided.
The patterns you notice after several months are far more reliable than any single dramatic anecdote.

Finally, remember that listening is not a personality trait but a practice.
You can build it the same way you build any skill: deliberately, repeatedly, and with feedback.
Start small, stay consistent, and let the results of better decisions and lower turnover carry the argument forward.
When listening becomes routine, the organization begins to self-correct, because people finally believe their voice matters.
""".strip()

    mock_client = MagicMock()
    # generate_structured handles strategy, outline, style guide, enrichment, etc.
    mock_client.generate_structured = MagicMock(
        return_value={
            "audience": "test",
            "pain_points": ["pain1"],
            "promise": "test promise",
            "positioning": "test",
            "tone": "professional",
            "goal": "test goal",
            "titles": ["Test Ebook"],
            "subtitles": ["A Subtitle"],
            "best_title": "Test Ebook",
            "best_subtitle": "A Subtitle",
            "chapters": [
                {
                    "title": "Ch1",
                    "summary": "Summary of chapter one",
                    "subchapters": [{"title": "Section One"}, {"title": "Section Two"}],
                    "estimated_word_count": 500,
                }
            ],
            # enrichment fields
            "chapter_summary_bullets": ["Point one", "Point two", "Point three"],
            "callout_insight": "Key insight here.",
            "case_study": {
                "name": "Alex",
                "conflict": "challenge",
                "resolution": "success",
            },
            "action_steps": ["Do this", "Then this", "Finally this"],
            "bridge_sentence": "The next chapter builds on these ideas.",
            "terms": [],
            "score": 0.9,
            "reason": "good",
            "voice_anchor": "professional and direct",
            "pov": "second-person",
            "banned_phrases": [],
            "sentence_length_range": [12, 20],
            "tone_adjectives": ["clear", "direct"],
            "gold_standard_paragraph": _MOCK_PROSE[:200],
        }
    )
    # The pipeline calls generate_text once per section (intro, each subchapter,
    # and on the enrichment-fallback outro). QA's chapter-structure check requires
    # >=2 unique H2 (##) headings per chapter (ChapterStructureChecker counts
    # ^##\s+ via re.MULTILINE), but the generator only emits ### headings, so a
    # plain static response always yields h2_count=0 and fails QA. Return the same
    # realistic prose on every call with a unique "## " heading embedded mid-prose
    # (not on line 0, so it survives the intra-appended section-body strip). A
    # cycling callable (rather than a fixed list) also survives the post-QA retry
    # loop, which re-invokes generate_text for every chapter.
    from itertools import cycle

    heading_variants = [
        f"{_MOCK_PROSE}\n\n## Key Insight One\n\nTeam members who feel safe speak up sooner and solve problems faster.",
        f"{_MOCK_PROSE}\n\n## Key Insight Two\n\nPriority one-on-ones replace broadcasts, and follow-through builds trust.",
        f"{_MOCK_PROSE}\n\n## Key Insight Three\n\nTrust compounds when feedback is acknowledged and acted on publicly.",
    ]
    _variant_cycle = cycle(heading_variants)
    mock_client.generate_text = MagicMock(
        side_effect=lambda *args, **kwargs: next(_variant_cycle)
    )

    orchestrator = PipelineOrchestrator(
        db_path=test_db_path,
        projects_dir=temp_project_dir,
    )
    orchestrator.ai_client = mock_client

    progress_updates = []

    def on_progress(p, s):
        progress_updates.append((p, s))

    result = orchestrator.run_full_pipeline(project_id, on_progress=on_progress)

    assert result["status"] == "completed"
    assert len(progress_updates) > 0

    project_dir = temp_project_dir / str(project_id)
    assert (project_dir / "strategy.json").exists()
    assert (project_dir / "outline.json").exists()
    assert (project_dir / "manuscript.md").exists()

    # Verify DOCX TOC heading via DocxGenerator
    from services.ebook.export.docx_generator import DocxGenerator
    from docx import Document as DocxDocument

    docx_gen = DocxGenerator(projects_dir=temp_project_dir)
    docx_result = docx_gen.generate(project_id=project_id, title="Test")
    docx_path = docx_result["docx"]
    doc = DocxDocument(str(docx_path))
    headings = [p.text for p in doc.paragraphs if p.style.name.startswith("Heading")]
    assert "Table of Contents" in headings, "TOC heading missing from generated DOCX"


@pytest.mark.integration
def test_streamlit_form_submission(test_db_path, temp_project_dir):
    from services.ebook.pipeline.intake import ProjectIntake
    from services.ebook.db.database import get_engine, create_tables as sa_create_tables

    engine = get_engine(test_db_path)
    sa_create_tables(engine)
    engine.dispose()

    intake = ProjectIntake(test_db_path)
    project = intake.create_project(
        idea="Test Streamlit form with long enough idea",
        product_mode="paid_ebook",
        chapter_count=3,
    )

    assert project["id"] is not None
    assert project["status"] == "draft"
    assert project["product_mode"] == "paid_ebook"


@pytest.mark.integration
def test_export_includes_all_files(test_db_path, temp_project_dir):
    from services.ebook.export.export_orchestrator import ExportOrchestrator
    from services.ebook.db.repository import ProjectRepository
    from services.ebook.db.database import get_engine, create_tables as sa_create_tables

    engine = get_engine(test_db_path)
    sa_create_tables(engine)
    engine.dispose()

    repo = ProjectRepository(test_db_path)
    project_id = repo.create_project(
        title="Export Test",
        idea="Testing export functionality",
        product_mode="lead_magnet",
    )

    project_dir = temp_project_dir / str(project_id)
    project_dir.mkdir(parents=True, exist_ok=True)
    (project_dir / "chapters").mkdir(exist_ok=True)
    (project_dir / "chapters" / "1.md").write_text("# Chapter 1\n\nContent")
    (project_dir / "manuscript.md").write_text("# Chapter 1\n\nContent")
    (project_dir / "cover").mkdir(exist_ok=True)
    (project_dir / "outline.json").write_text('{"best_title": "Test"}')

    from PIL import Image

    (project_dir / "cover" / "cover.png").write_bytes(
        Image.new("RGB", (10, 10)).tobytes()
    )

    orchestrator = ExportOrchestrator(
        db_path=test_db_path,
        projects_dir=temp_project_dir,
    )

    result = orchestrator.export(project_id)

    assert result["status"] == "completed"
    exports_dir = project_dir / "exports"
    assert (exports_dir / "manifest.json").exists()
