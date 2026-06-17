import pytest
from pathlib import Path


@pytest.mark.integration
def test_full_pipeline_integration(test_db_path, temp_project_dir):
    from src.pipeline.orchestrator import PipelineOrchestrator
    from src.db.repository import ProjectRepository
    from src.db.schema import create_tables
    from unittest.mock import MagicMock
    import sqlite3

    conn = sqlite3.connect(test_db_path)
    create_tables(conn)
    conn.close()

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
    mock_client.generate_text = MagicMock(return_value=_MOCK_PROSE)

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
    from src.export.docx_generator import DocxGenerator
    from docx import Document as DocxDocument

    docx_gen = DocxGenerator(projects_dir=temp_project_dir)
    docx_result = docx_gen.generate(project_id=project_id, title="Test")
    docx_path = docx_result["docx"]
    doc = DocxDocument(str(docx_path))
    headings = [p.text for p in doc.paragraphs if p.style.name.startswith("Heading")]
    assert "Table of Contents" in headings, "TOC heading missing from generated DOCX"


@pytest.mark.integration
def test_streamlit_form_submission(test_db_path, temp_project_dir):
    from src.pipeline.intake import ProjectIntake
    from src.db.schema import create_tables
    import sqlite3

    conn = sqlite3.connect(test_db_path)
    create_tables(conn)
    conn.close()

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
    from src.export.export_orchestrator import ExportOrchestrator
    from src.db.repository import ProjectRepository
    from src.db.schema import create_tables
    import sqlite3

    conn = sqlite3.connect(test_db_path)
    create_tables(conn)
    conn.close()

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
