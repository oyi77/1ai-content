import streamlit as st
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))
sys.path.insert(0, str(Path(__file__).parent))

from src.logger import setup_logging

setup_logging()

st.set_page_config(page_title="Ebook Generator", page_icon="📚", layout="wide")

from utils.mobile_css import inject_mobile_css

inject_mobile_css()

st.title("📚 Ebook Generator")
st.markdown("Transform your ideas into market-ready ebooks with AI")

st.markdown("---")
st.markdown("### 🚀 Quick Start")

col1, col2, col3, col4 = st.columns(4)
with col1:
    st.page_link("pages/1_Idea_Research.py", label="📊 Research Ideas", icon="📊")
with col2:
    st.page_link("pages/2_Create_Ebook.py", label="✍️ Create Ebook", icon="✍️")
with col3:
    st.page_link("pages/4_Export.py", label="📥 Download", icon="📥")
with col4:
    st.page_link("pages/5_Marketing_Kit.py", label="💰 Marketing Kit", icon="💰")

st.markdown("---")

from src.db.repository import ProjectRepository

db_path = Path("data/ebook_generator.db")
db_path.parent.mkdir(exist_ok=True)

if db_path.exists():
    repo = ProjectRepository(str(db_path))
    projects = repo.list_projects(limit=5)
    if projects:
        st.markdown("### Recent Projects")
        for project in projects:
            status_emoji = {
                "draft": "📝",
                "generating": "⚙️",
                "completed": "✅",
                "failed": "❌",
            }.get(project["status"], "📝")
            col1, col2, col3, col4 = st.columns([3, 1, 1, 1])
            with col1:
                st.markdown(f"**{status_emoji} {project['title']}**")
                st.caption(project["idea"][:60])
            with col2:
                st.markdown(f"`{project['status']}`")
            with col3:
                if project["status"] == "completed":
                    if st.button("📥 Download", key=f"dl_{project['id']}"):
                        st.session_state["view_project"] = project["id"]
                        st.switch_page("pages/4_Export.py")
                elif st.button("👁️ View", key=f"view_{project['id']}"):
                    st.session_state["view_project"] = project["id"]
                    st.switch_page("pages/3_Progress.py")
            with col4:
                if project["status"] == "completed":
                    if st.button("💰 Kit", key=f"kit_{project['id']}"):
                        st.session_state["view_project"] = project["id"]
                        st.switch_page("pages/5_Marketing_Kit.py")
            st.divider()
    else:
        st.info("No projects yet. Start by researching ideas or creating a new ebook!")
else:
    st.info("No projects yet. Start by researching ideas or creating a new ebook!")
