import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))
sys.path.insert(0, str(Path(__file__).parent.parent))

import streamlit as st

st.set_page_config(page_title="Settings", page_icon="⚙️", layout="wide")

from utils.mobile_css import inject_mobile_css

inject_mobile_css()

from src.config import get_config, reload_config
from src.pipeline.model_tracker import ModelTracker
from src.pipeline.token_calibrator import TokenCalibrator

st.title("⚙️ Settings")
st.markdown("Configure pipeline settings and view performance statistics.")

config = get_config()

# --- AI Models ---
st.header("AI Models")
provider = st.selectbox(
    "AI Provider",
    options=["omniroute", "ollama", "openai", "custom"],
    index=["omniroute", "ollama", "openai", "custom"].index(config.provider),
    help="Select the AI provider to use for generation",
)

st.subheader("Model Configuration")
col1, col2 = st.columns(2)
with col1:
    default_model = st.text_input("Default Model", value=config.default_model)
    outline_model = st.text_input("Outline Model", value=config.outline_model)
    strategy_model = st.text_input("Strategy Model", value=config.strategy_model)
with col2:
    cover_model = st.text_input("Cover Model", value=config.cover_model)
    qa_model = st.text_input("QA Model", value=config.qa_model)

st.subheader("Provider-Specific Models")
col3, col4 = st.columns(2)
with col3:
    st.caption("Ollama Models")
    ollama_default_model = st.text_input(
        "Ollama Default Model", value=config.ollama_default_model
    )
    ollama_outline_model = st.text_input(
        "Ollama Outline Model", value=config.ollama_outline_model
    )
    ollama_strategy_model = st.text_input(
        "Ollama Strategy Model", value=config.ollama_strategy_model
    )
    ollama_cover_model = st.text_input(
        "Ollama Cover Model", value=config.ollama_cover_model
    )
    ollama_qa_model = st.text_input("Ollama QA Model", value=config.ollama_qa_model)
with col4:
    st.caption("OpenAI Models")
    openai_default_model = st.text_input(
        "OpenAI Default Model", value=config.openai_default_model
    )
    openai_outline_model = st.text_input(
        "OpenAI Outline Model", value=config.openai_outline_model
    )
    openai_strategy_model = st.text_input(
        "OpenAI Strategy Model", value=config.openai_strategy_model
    )
    openai_cover_model = st.text_input(
        "OpenAI Cover Model", value=config.openai_cover_model
    )
    openai_qa_model = st.text_input("OpenAI QA Model", value=config.openai_qa_model)

st.subheader("Model Performance Thresholds")
col3, col4 = st.columns(2)
with col3:
    model_success_threshold = st.slider(
        "Min Success Rate",
        min_value=0.0,
        max_value=1.0,
        value=config.model_success_threshold,
        step=0.05,
        help="Minimum success rate required before using a model for a task.",
    )
with col4:
    model_min_samples = st.number_input(
        "Min Samples Before Switching",
        min_value=1,
        max_value=50,
        value=config.model_min_samples,
        help="Number of samples required before evaluating model performance.",
    )

# --- Token Budgets ---
st.header("Token Budgets")
col5, col6, col7 = st.columns(3)
with col5:
    tokens_intro = st.number_input(
        "Intro Tokens", min_value=100, max_value=8000, value=config.tokens_intro
    )
    tokens_strategy = st.number_input(
        "Strategy Tokens", min_value=100, max_value=8000, value=config.tokens_strategy
    )
with col6:
    tokens_subchapter = st.number_input(
        "Subchapter Tokens",
        min_value=100,
        max_value=8000,
        value=config.tokens_subchapter,
    )
    tokens_outline = st.number_input(
        "Outline Tokens", min_value=100, max_value=8000, value=config.tokens_outline
    )
with col7:
    tokens_outro = st.number_input(
        "Outro Tokens", min_value=100, max_value=8000, value=config.tokens_outro
    )

# --- QA Thresholds ---
st.header("QA Thresholds")
col8, col9, col10 = st.columns(3)
with col8:
    qa_word_count_tolerance = st.slider(
        "Word Count Tolerance",
        min_value=0.0,
        max_value=1.0,
        value=config.qa_word_count_tolerance,
        step=0.05,
        help="Allowed deviation from target word count (e.g. 0.20 = ±20%).",
    )
with col9:
    qa_min_chapter_words = st.number_input(
        "Min Chapter Words",
        min_value=50,
        max_value=5000,
        value=config.qa_min_chapter_words,
    )
with col10:
    qa_max_retry_attempts = st.number_input(
        "Max Retry Attempts",
        min_value=1,
        max_value=10,
        value=config.qa_max_retry_attempts,
    )

# --- Export ---
st.header("Export")
col11, col12 = st.columns(2)
with col11:
    docx_author = st.text_input("DOCX Author", value=config.docx_author)
    cover_width = st.number_input(
        "Cover Width (px)", min_value=400, max_value=4000, value=config.cover_width
    )
    cover_height = st.number_input(
        "Cover Height (px)", min_value=400, max_value=6000, value=config.cover_height
    )
with col12:
    cover_title_font_size = st.number_input(
        "Cover Title Font Size",
        min_value=10,
        max_value=300,
        value=config.cover_title_font_size,
    )
    cover_watermark_font_size = st.number_input(
        "Cover Watermark Font Size",
        min_value=10,
        max_value=200,
        value=config.cover_watermark_font_size,
    )

# --- Server ---
st.header("Server")
col13, col14, col15 = st.columns(3)
with col13:
    api_host = st.text_input("API Host", value=config.api_host)
with col14:
    api_port = st.number_input(
        "API Port", min_value=1024, max_value=65535, value=config.api_port
    )
with col15:
    ui_port = st.number_input(
        "UI Port", min_value=1024, max_value=65535, value=config.ui_port
    )

# --- Save ---
if st.button("💾 Save Settings", type="primary"):
    config.provider = provider
    config.default_model = default_model
    config.outline_model = outline_model
    config.strategy_model = strategy_model
    config.cover_model = cover_model
    config.qa_model = qa_model
    config.ollama_default_model = ollama_default_model
    config.ollama_outline_model = ollama_outline_model
    config.ollama_strategy_model = ollama_strategy_model
    config.ollama_cover_model = ollama_cover_model
    config.ollama_qa_model = ollama_qa_model
    config.openai_default_model = openai_default_model
    config.openai_outline_model = openai_outline_model
    config.openai_strategy_model = openai_strategy_model
    config.openai_cover_model = openai_cover_model
    config.openai_qa_model = openai_qa_model
    config.model_success_threshold = model_success_threshold
    config.model_min_samples = int(model_min_samples)
    config.tokens_intro = int(tokens_intro)
    config.tokens_subchapter = int(tokens_subchapter)
    config.tokens_outro = int(tokens_outro)
    config.tokens_strategy = int(tokens_strategy)
    config.tokens_outline = int(tokens_outline)
    config.qa_word_count_tolerance = qa_word_count_tolerance
    config.qa_min_chapter_words = int(qa_min_chapter_words)
    config.qa_max_retry_attempts = int(qa_max_retry_attempts)
    config.docx_author = docx_author
    config.cover_width = int(cover_width)
    config.cover_height = int(cover_height)
    config.cover_title_font_size = int(cover_title_font_size)
    config.cover_watermark_font_size = int(cover_watermark_font_size)
    config.api_host = api_host
    config.api_port = int(api_port)
    config.ui_port = int(ui_port)
    config.save()
    reload_config()
    st.success("Settings saved.")

st.divider()

# --- Model Performance Stats ---
st.header("Model Performance Stats")
tracker = ModelTracker()
stats = tracker.get_stats()

if stats:
    rows = []
    for task_type, entries in stats.items():
        for s in entries:
            rows.append(
                {
                    "task_type": task_type,
                    "model": s["model"],
                    "attempts": s["successes"] + s["failures"],
                    "success_rate": round(
                        s["successes"] / max(s["successes"] + s["failures"], 1), 3
                    ),
                    "avg_latency_ms": round(
                        s["total_latency_ms"] / max(s["successes"] + s["failures"], 1),
                        1,
                    ),
                }
            )
    st.dataframe(rows, use_container_width=True)
else:
    st.info(
        "No model performance data recorded yet. Stats appear after the pipeline runs."
    )

st.divider()

# --- Token Calibration ---
st.header("Token Calibration")
calibrator = TokenCalibrator()
calibration = calibrator.get_calibration()

if calibration:
    cal_rows = []
    for section_type, r in calibration.items():
        cal_rows.append(
            {
                "section_type": section_type,
                "budget": r["token_budget"],
                "avg_words": r["words_produced"],
                "words_per_token": round(
                    r["words_produced"] / max(r["token_budget"], 1), 3
                ),
                "samples": r["samples"],
            }
        )
    st.dataframe(cal_rows, use_container_width=True)
else:
    st.info(
        "No calibration data recorded yet. Data appears after chapters are generated."
    )
