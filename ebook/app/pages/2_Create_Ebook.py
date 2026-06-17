import os
import sqlite3
from pathlib import Path

import requests
import streamlit as st
from pydantic import ValidationError

from src.db.schema import create_tables
from src.models.validation import ProjectInput
from src.pipeline.intake import ProjectIntake
from src.pipeline.orchestrator import PipelineOrchestrator
from src.pipeline.error_classifier import ErrorClassifier
from src.db.schema import create_tables
from src.i18n.languages import SUPPORTED_LANGUAGES, is_rtl

db_path = Path("data/ebook_generator.db")
db_path.parent.mkdir(exist_ok=True)

conn = sqlite3.connect(db_path)
create_tables(conn)
conn.close()


@st.cache_data(ttl=300)
def get_available_models():
    try:
        base_url = os.getenv("OMNIROUTE_BASE_URL", "http://localhost:20128/v1")
        resp = requests.get(f"{base_url}/models", timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            return [m["id"] for m in data.get("data", [])]
    except Exception as e:
        from src.logger import get_logger

        logger = get_logger(__name__)
        logger.warning(
            "Failed to fetch AI models from OmniRoute",
            page="create_ebook",
            operation="get_models",
            error=str(e),
        )
    return ["auto/best-chat", "auto/best-fast", "auto/best-reasoning"]


available_models = get_available_models()

if "generating" not in st.session_state:
    st.session_state.generating = False
if "progress" not in st.session_state:
    st.session_state.progress = 0
if "progress_msg" not in st.session_state:
    st.session_state.progress_msg = ""
if "generation_error" not in st.session_state:
    st.session_state.generation_error = None
if "generated_project_id" not in st.session_state:
    st.session_state.generated_project_id = None

pre_idea = st.session_state.get("researched_idea", "")
pre_category = st.session_state.get("researched_category", "")

with st.form("ebook_form"):
    col1, col2 = st.columns(2)

    with col1:
        idea = st.text_area(
            "Your Ebook Idea",
            value=pre_idea if pre_idea else "",
            placeholder="e.g., How to start a successful blog from scratch",
            help="Describe your ebook idea in detail (10-500 characters)",
        )

        NOVEL_GENRES = [
            "Fantasy",
            "Romance",
            "Thriller",
            "Sci-Fi",
            "Mystery",
            "Literary Fiction",
            "Historical Fiction",
            "Horror",
        ]
        SHORT_STORY_GENRES = [
            "Literary Fiction",
            "Horror",
            "Fantasy",
            "Sci-Fi",
            "Romance",
            "Thriller",
            "Mystery",
            "Magical Realism",
        ]
        ACADEMIC_FIELDS = [
            "Social Sciences",
            "Natural Sciences",
            "Engineering",
            "Humanities",
            "Business",
            "Medicine",
            "Law",
            "Education",
            "Psychology",
            "Economics",
        ]
        SKILL_LEVELS = [
            "Complete Beginner",
            "Beginner",
            "Intermediate",
            "Advanced",
            "Expert",
        ]
        ACADEMIC_LEVELS = [
            "Undergraduate",
            "Graduate",
            "Postgraduate / PhD",
            "Professional",
        ]

        _MODE_LABELS = {
            "lead_magnet": "📧 Lead Magnet — Free, builds email list",
            "paid_ebook": "💰 Paid Ebook — Premium nonfiction",
            "bonus_content": "🎁 Bonus Content — For existing customers",
            "authority": "🏆 Authority — Thought leadership",
            "novel": "📖 Novel — Full-length fiction",
            "short_story": "✍️  Short Story — 5k–20k words, single arc",
            "memoir": "🧠 Memoir — Personal narrative nonfiction",
            "how_to_guide": "🔧 How-To Guide — Step-by-step practical",
            "textbook": "🎓 Textbook — Educational with exercises",
            "academic_paper": "🔬 Academic Paper — APA/IMRaD structure",
            "manga": "🎌 Manga — Japanese, right-to-left, B&W",
            "manhwa": "🇰🇷 Manhwa — Korean webtoon, color, vertical scroll",
            "manhua": "🇨🇳 Manhua — Chinese webtoon, color",
            "comics": "💥 Comics — Western page format, color",
        }

        product_mode = st.selectbox(
            "Book Type",
            options=list(_MODE_LABELS.keys()),
            format_func=lambda x: _MODE_LABELS[x],
        )

        genre = None
        if product_mode == "novel":
            genre = st.selectbox(
                "Genre",
                NOVEL_GENRES,
                help="The genre affects writing style, tone, and cover design.",
            )
        elif product_mode == "short_story":
            genre = st.selectbox(
                "Genre",
                SHORT_STORY_GENRES,
                help="Short story genre shapes tone and narrative structure.",
            )
        elif product_mode == "how_to_guide":
            st.selectbox(
                "Reader Skill Level",
                SKILL_LEVELS,
                key="skill_level",
                help="Calibrates vocabulary complexity and assumed prior knowledge.",
            )
        elif product_mode == "textbook":
            st.selectbox(
                "Academic Level",
                ACADEMIC_LEVELS,
                key="academic_level",
                help="Sets depth of content, vocabulary, and exercise difficulty.",
            )
        elif product_mode == "academic_paper":
            st.selectbox(
                "Field / Discipline",
                ACADEMIC_FIELDS,
                key="academic_field",
                help="Influences citation conventions and disciplinary framing.",
            )
            st.selectbox(
                "Citation Style",
                [
                    "APA 7th",
                    "Chicago 17th (Notes-Bibliography)",
                    "Chicago 17th (Author-Date)",
                    "MLA 9th",
                    "IEEE",
                    "Vancouver",
                ],
                key="citation_style",
                help="Citation format used throughout the paper.",
            )

        if product_mode in {"manga", "manhwa", "manhua", "comics"}:
            st.slider(
                "Pages per Chapter",
                min_value=4,
                max_value=24,
                value=8,
                key="pages_per_chapter",
            )
            st.selectbox(
                "Panel Layout",
                ["2x2 (4 panels)", "3-panel", "4-panel-vertical", "splash"],
                key="panel_layout",
            )
            st.selectbox(
                "Art Style",
                ["detailed", "simple", "chibi", "realistic"],
                key="art_style",
            )

    with col2:
        # Sensible defaults and ranges per book type
        _chapter_defaults = {
            "lead_magnet": (3, 2, 10),
            "paid_ebook": (8, 5, 20),
            "bonus_content": (3, 2, 8),
            "authority": (7, 5, 15),
            "novel": (20, 10, 40),
            "short_story": (5, 3, 12),
            "memoir": (12, 6, 20),
            "how_to_guide": (8, 4, 15),
            "textbook": (12, 6, 20),
            "academic_paper": (
                6,
                4,
                8,
            ),  # abstract/intro/lit-review/methods/results/discussion/conclusion/refs
        }
        _ch_default, _ch_min, _ch_max = _chapter_defaults.get(product_mode, (5, 2, 20))
        _section_label = "Sections" if product_mode == "academic_paper" else "Chapters"
        chapter_count = st.slider(
            f"Number of {_section_label}",
            min_value=_ch_min,
            max_value=_ch_max,
            value=_ch_default,
            help=f"How many {_section_label.lower()} should your book have?",
        )

        def _lang_label(code):
            meta = SUPPORTED_LANGUAGES[code]
            rtl_tag = " (RTL)" if meta["rtl"] else ""
            return f"{meta['name']}{rtl_tag}"

        target_language = st.selectbox(
            "Target Language",
            options=list(SUPPORTED_LANGUAGES.keys()),
            index=list(SUPPORTED_LANGUAGES.keys()).index("en"),
            format_func=_lang_label,
        )

        extra_languages = st.multiselect(
            "Also generate in (optional):",
            options=[k for k in SUPPORTED_LANGUAGES.keys() if k != target_language],
            format_func=_lang_label,
            max_selections=3,
            help="Generate additional language editions. Increases generation time.",
        )
        target_languages = [target_language] + extra_languages

        ai_model = st.selectbox(
            "AI Model",
            options=available_models,
            help="Choose the AI model for content generation (fetched from OmniRoute)",
        )

    quality_level = st.radio(
        "Quality Level",
        ["fast", "thorough"],
        horizontal=True,
        help="Fast: immediate output. Thorough: AI grammar review + consistency scoring (slower, uses more API credits).",
    )

    submitted = st.form_submit_button(
        "🚀 Generate Ebook", type="primary", disabled=st.session_state.generating
    )

    if submitted:
        try:
            validated_input = ProjectInput(
                idea=idea,
                chapter_count=chapter_count,
                target_language=target_language,
                product_mode=product_mode,
                quality_level=quality_level,
            )

            intake = ProjectIntake(str(db_path))
            project = intake.create_project(
                idea=validated_input.idea,
                product_mode=validated_input.product_mode,
                chapter_count=validated_input.chapter_count,
                target_language=validated_input.target_language,
                target_languages=target_languages,
            )
            st.session_state.quality_level = quality_level

            project_id = project["id"]
            st.session_state.generating = True
            st.session_state.progress = 0
            st.session_state.progress_msg = "Starting..."
            st.session_state.generation_error = None
            st.session_state.generated_project_id = project_id

            progress_bar = st.progress(0, text="Starting generation...")
            status_text = st.empty()

            def on_progress(pct, msg):
                st.session_state.progress = pct
                st.session_state.progress_msg = msg
                progress_bar.progress(pct / 100, text=msg)
                status_text.text(msg)

            try:
                orchestrator = PipelineOrchestrator(
                    db_path=str(db_path),
                    projects_dir="projects",
                )
                result = orchestrator.run_full_pipeline(
                    project_id, on_progress=on_progress, manuscript_model=ai_model
                )

                st.session_state.generating = False
                st.session_state.generated_project_id = project_id
                st.success(f"✅ Ebook generated successfully! Project ID: {project_id}")
                st.markdown(f"**Files created:**")
                st.markdown(f"- 📄 DOCX: `{result['exports']['docx']}`")
                st.markdown(f"- 📕 PDF: `{result['exports']['pdf']}`")

            except Exception as e:
                st.session_state.generating = False
                friendly = ErrorClassifier.classify(e)
                st.session_state.generation_error = friendly
                st.error(f"❌ {friendly}")
                st.info("You can retry by submitting the form again.")

        except ValidationError as e:
            error_messages = []
            for error in e.errors():
                field = error["loc"][0]
                msg = error["msg"]
                error_messages.append(f"**{field}**: {msg}")
            st.error("❌ Validation Error:\n\n" + "\n\n".join(error_messages))

# Handle resume from Progress page
resume_id = st.session_state.get("generate_project_id")
if resume_id and not st.session_state.generating:
    from src.pipeline.orchestrator import PipelineOrchestrator as PO

    orchestrator = PO(db_path=str(db_path), projects_dir="projects")
    prog = orchestrator._check_progress(resume_id)
    completed = prog["completed_chapters"]
    total = prog["total_chapters"]
    steps_done = sum(
        [
            prog["strategy"],
            prog["outline"],
            bool(completed > 0),
            prog["cover"],
            prog["qa"],
            prog["export"],
        ]
    )
    pct = int((steps_done / 6) * 100)

    st.info(
        f"📋 Project #{resume_id} is {pct}% complete ({completed}/{total} chapters)"
    )

    if st.button("▶️ Resume Generation", type="primary", key="resume_btn"):
        st.session_state.generating = True
        st.session_state.progress = pct
        st.session_state.progress_msg = "Resuming..."
        st.session_state.generation_error = None
        st.session_state.generated_project_id = resume_id

        progress_bar = st.progress(pct / 100, text="Resuming generation...")
        status_text = st.empty()

        def on_progress(pct, msg):
            st.session_state.progress = pct
            st.session_state.progress_msg = msg
            progress_bar.progress(pct / 100, text=msg)
            status_text.text(msg)

        try:
            orchestrator = PO(db_path=str(db_path), projects_dir="projects")
            result = orchestrator.run_full_pipeline(
                resume_id, on_progress=on_progress, manuscript_model=None
            )

            st.session_state.generating = False
            st.session_state.generated_project_id = resume_id
            st.success(f"✅ Ebook generated successfully! Project ID: {resume_id}")
            st.markdown(f"**Files created:**")
            st.markdown(f"- 📄 DOCX: `{result['exports']['docx']}`")
            st.markdown(f"- 📕 PDF: `{result['exports']['pdf']}`")

        except Exception as e:
            st.session_state.generating = False
            friendly = ErrorClassifier.classify(e)
            st.session_state.generation_error = friendly
            st.error(f"❌ {friendly}")
            st.info("You can retry by clicking Resume again.")

if st.session_state.generated_project_id and not st.session_state.generating:
    if st.button("📥 Go to Download Page", type="primary", key="go_to_export"):
        st.session_state["view_project"] = st.session_state.generated_project_id
        st.switch_page("pages/4_Export.py")

if st.session_state.generating:
    st.info("⚙️ Generation in progress... Please wait.")
    st.progress(st.session_state.progress / 100, text=st.session_state.progress_msg)

if st.session_state.generation_error:
    st.error(f"❌ Last error: {st.session_state.generation_error}")
