import streamlit as st
from pathlib import Path
import sys
import time

sys.path.insert(0, str(Path(__file__).parent.parent.parent))
sys.path.insert(0, str(Path(__file__).parent.parent))

st.set_page_config(page_title="Progress", page_icon="📈", layout="wide")

from utils.mobile_css import inject_mobile_css

inject_mobile_css()

st.title("📈 Generation Progress")
st.markdown("Track and resume your ebook generation jobs — multiple at once!")

from src.db.repository import ProjectRepository
from src.pipeline.orchestrator import PipelineOrchestrator
from src.pipeline.error_classifier import ErrorClassifier
from src.jobs.tracker import (
    get_job_status,
    get_all_active_jobs,
    start_resume as tracker_start_resume,
)

db_path = Path("data/ebook_generator.db")

if not db_path.exists():
    st.info("No projects yet. Create one first!")
    st.page_link("pages/2_Create_Ebook.py", label="→ Go to Create Ebook", icon="✍️")
    st.stop()

repo = ProjectRepository(str(db_path))
projects = repo.list_projects(limit=20)

if not projects:
    st.info("No projects yet. Create one first!")
    st.page_link("pages/2_Create_Ebook.py", label="→ Go to Create Ebook", icon="✍️")
    st.stop()

# Handle batch resume
if st.button("🔥 Resume All Incomplete", type="primary", use_container_width=True):
    for project in projects:
        pid = project["id"]
        status = project["status"]
        if status in ["generating", "draft", "failed"]:
            tracker_start_resume(pid, str(db_path), "projects")
    st.rerun()

# Show active jobs at top
active_jobs = get_all_active_jobs()
if active_jobs:
    st.markdown("### ⚡ Active Generations")
    cols = st.columns(min(3, len(active_jobs)))
    for i, (pid, job) in enumerate(active_jobs.items()):
        project = repo.get_project(pid)
        title = project["title"][:30] if project else f"Project #{pid}"
        with cols[i % 3]:
            st.markdown(f"**{title}**")
            st.progress(job["progress"] / 100, text=job["message"])

st.markdown("---")
st.markdown("### All Projects")

for project in projects:
    status = project["status"]
    pid = project["id"]
    job = get_job_status(pid)
    job_status = job.get("status", "idle")

    display_status = status
    if job_status == "running":
        display_status = "running"
    elif job_status == "completed":
        display_status = "completed"
    elif job_status == "failed":
        display_status = "failed"

    status_emoji = {
        "draft": "📝",
        "generating": "⚙️",
        "running": "🔥",
        "completed": "✅",
        "failed": "❌",
    }.get(display_status, "📝")

    with st.expander(
        f"{status_emoji} {project['title']} — `{display_status}`",
        expanded=(display_status in ["running", "generating"]),
    ):
        col1, col2, col3 = st.columns([2, 1, 1])
        with col1:
            st.markdown(f"**Idea:** {project['idea']}")
            st.markdown(
                f"**Chapters:** {project['chapter_count']} | **Language:** {project['target_language']}"
            )
            st.markdown(f"**Mode:** {project['product_mode']}")

        with col2:
            if display_status == "running":
                st.info(f"🔥 {job['message']}")
                st.progress(job["progress"] / 100, text=f"{job['progress']}%")
            elif display_status == "completed":
                st.success("✅ Complete!")
            elif display_status == "failed":
                raw_error = job.get("error") or job.get("message", "Unknown error")
                st.error(f"❌ {ErrorClassifier.classify_str(raw_error)}")
            elif display_status == "generating":
                orchestrator = PipelineOrchestrator(
                    db_path=str(db_path), projects_dir="projects"
                )
                prog = orchestrator._check_progress(pid)
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
                st.warning(f"⚙️ {pct}% — {completed}/{total} chapters")
                st.progress(pct / 100)
            else:
                st.info("📝 Draft")

        with col3:
            if display_status == "running":
                st.button("⏳ Running...", key=f"run_{pid}", disabled=True)
            elif display_status == "completed":
                if st.button("📥 Download", key=f"dl_{pid}"):
                    st.session_state["view_project"] = pid
                    st.switch_page("pages/4_Export.py")
            elif display_status == "failed":
                if st.button("🔄 Retry", key=f"resume_{pid}", type="primary"):
                    tracker_start_resume(pid, str(db_path), "projects")
                    st.rerun()
            elif display_status in ["generating", "draft"]:
                if st.button("▶️ Resume", key=f"resume_{pid}", type="primary"):
                    tracker_start_resume(pid, str(db_path), "projects")
                    st.rerun()

if st.button("🔄 Refresh", type="secondary"):
    st.rerun()

# Auto-refresh via JavaScript when jobs are running (non-blocking)
if active_jobs:
    st.components.v1.html(
        """
        <script>
            setTimeout(function() {
                window.location.reload();
            }, 3000);
        </script>
        """,
        height=0,
    )
