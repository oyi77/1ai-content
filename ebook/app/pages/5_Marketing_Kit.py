import streamlit as st
from pathlib import Path
import sys
import os
import json

sys.path.insert(0, str(Path(__file__).parent.parent.parent))
sys.path.insert(0, str(Path(__file__).parent.parent))

st.set_page_config(page_title="Marketing Kit", page_icon="💰", layout="wide")

from utils.mobile_css import inject_mobile_css

inject_mobile_css()

st.title("💰 Marketing Kit")
st.markdown("Your AI-generated marketing assets — copy, paste, and sell")

from src.db.repository import ProjectRepository

db_path = Path("data/ebook_generator.db")

if not db_path.exists():
    st.info("No projects yet. Create one first!")
    st.page_link("pages/2_Create_Ebook.py", label="→ Go to Create Ebook", icon="✍️")
    st.stop()

repo = ProjectRepository(str(db_path))
projects = repo.list_projects(limit=20)
completed = [p for p in projects if p["status"] == "completed"]

if not completed:
    st.info("No completed ebooks yet. Generate one first!")
    st.page_link("pages/2_Create_Ebook.py", label="→ Go to Create Ebook", icon="✍️")
    st.stop()

st.markdown(
    f"### ✅ {len(completed)} Completed Ebook{'' if len(completed) == 1 else 's'}"
)

for project in completed:
    project_dir = Path("projects") / str(project["id"])
    mk_file = project_dir / "marketing_kit.json"

    with st.expander(f"📚 {project['title']}", expanded=True):
        if not mk_file.exists():
            st.warning(
                "No marketing kit found for this project. "
                "Regenerate the ebook or run the marketing kit stage to create one."
            )
            st.markdown("---")
            continue

        with open(mk_file) as f:
            mk = json.load(f)

        book_description = mk.get("book_description", "")
        keywords = mk.get("keywords", [])
        ad_hooks = mk.get("ad_hooks", [])
        social_posts = mk.get("social_posts", {})
        suggested_price = mk.get("suggested_price", "")
        audience_persona = mk.get("audience_persona", "")

        col1, col2 = st.columns([3, 1])
        with col1:
            st.markdown(f"**Idea:** {project['idea']}")
            st.markdown(
                f"**Chapters:** {project['chapter_count']} | **Language:** {project['target_language']}"
            )
        with col2:
            if suggested_price:
                st.metric("Suggested Price", suggested_price)

        tabs = st.tabs(
            [
                "📝 Description",
                "🎯 Ad Hooks",
                "📱 Social Posts",
                "🔍 Keywords",
                "👤 Audience",
            ]
        )

        with tabs[0]:
            st.text_area(
                "Book Description",
                value=book_description,
                height=200,
                help="Use this for Amazon KDP, Gumroad, or your landing page",
                key=f"desc_{project['id']}",
            )
            st.caption(f"{len(book_description)} characters")

        with tabs[1]:
            for i, hook in enumerate(ad_hooks, 1):
                st.code(hook, language=None)
                st.caption(f"Hook {i} — select all and copy")
            if ad_hooks:
                st.markdown(
                    "> **Tip:** Use these as the first line of your Meta/TikTok ads"
                )
            else:
                st.info("No ad hooks found in this marketing kit.")

        with tabs[2]:
            fb_post = social_posts.get("facebook", "")
            ig_post = social_posts.get("instagram", "")
            tt_post = social_posts.get("tiktok", "")

            with st.expander("📘 Facebook", expanded=True):
                st.text_area(
                    "Facebook Post",
                    value=fb_post,
                    height=150,
                    key=f"fb_{project['id']}",
                    label_visibility="collapsed",
                )
                st.caption("Tip: Add a link to your landing page or Gumroad product")

            with st.expander("📸 Instagram", expanded=True):
                st.text_area(
                    "Instagram Post",
                    value=ig_post,
                    height=150,
                    key=f"ig_{project['id']}",
                    label_visibility="collapsed",
                )
                st.caption("Tip: Add relevant hashtags at the end to extend reach")

            with st.expander("🎵 TikTok", expanded=True):
                st.text_area(
                    "TikTok Caption",
                    value=tt_post,
                    height=120,
                    key=f"tt_{project['id']}",
                    label_visibility="collapsed",
                )
                char_count = len(tt_post)
                caption_color = "red" if char_count > 150 else "gray"
                st.caption(
                    f"{char_count}/150 chars — "
                    + (
                        "⚠️ over limit, trim before posting"
                        if char_count > 150
                        else "good length"
                    )
                )

        with tabs[3]:
            if keywords:
                st.code(", ".join(keywords), language=None)
                st.caption(
                    "Use these in your ad targeting, ebook metadata, and landing page SEO"
                )
            else:
                st.info("No keywords found in this marketing kit.")

        with tabs[4]:
            if audience_persona:
                st.info(audience_persona)
                st.caption("Use this to target your Meta/TikTok ads")
            else:
                st.info("No audience persona found in this marketing kit.")

        st.markdown("---")

        strategy_file = project_dir / "strategy.json"
        outline_file = project_dir / "outline.json"

        if st.button(
            "🚀 Push to adforge",
            key=f"adforge_{project['id']}",
            help="Create a landing page + ads campaign in adforge",
        ):
            strategy = {}
            outline = {}

            if strategy_file.exists():
                with open(strategy_file) as f:
                    strategy = json.load(f)
            if outline_file.exists():
                with open(outline_file) as f:
                    outline = json.load(f)

            pain_points = strategy.get("pain_points", [])
            if isinstance(pain_points, list):
                pain_points_str = "\n".join(f"- {p}" for p in pain_points[:3])
            else:
                pain_points_str = str(pain_points)

            chapters = outline.get("chapters", [])
            benefits = [ch.get("title", "") for ch in chapters[:5] if ch.get("title")]
            benefits_str = (
                "\n".join(f"- {b}" for b in benefits)
                if benefits
                else "Practical, actionable content"
            )

            price_raw = (
                mk.get("suggested_price", "$9.99").replace("$", "").replace("Free", "0")
            )

            payload = {
                "name": f"{project['title']} — AI Ebook",
                "theme": "dark",
                "product_name": project["title"],
                "price": price_raw,
                "pain_points": pain_points_str,
                "benefits": benefits_str,
                "cta_primary": "Get Your Copy Now",
                "cta_secondary": "Download Free Preview",
            }

            adforge_url = os.environ.get("ADFORGE_URL", "http://localhost:3000")
            adforge_key = os.environ.get("ADFORGE_API_KEY", "")

            try:
                import requests

                headers = {"Content-Type": "application/json"}
                if adforge_key:
                    headers["Authorization"] = f"Bearer {adforge_key}"

                resp = requests.post(
                    f"{adforge_url}/api/landing",
                    json=payload,
                    headers=headers,
                    timeout=10,
                )

                if resp.status_code in (200, 201):
                    data = resp.json()
                    lp_id = data.get("data", {}).get("id", "?")
                    st.success(f"✅ Landing page created in adforge! ID: {lp_id}")
                    st.info(
                        "💡 Open adforge to add your checkout link, connect Meta/TikTok ads, and publish."
                    )
                else:
                    st.error(
                        f"❌ adforge returned {resp.status_code}: {resp.text[:200]}"
                    )
                    st.info("Make sure adforge is running at " + adforge_url)
            except requests.exceptions.ConnectionError:
                st.error(f"❌ Cannot connect to adforge at {adforge_url}")
                st.info(
                    "Start adforge with `cd ~/projects/adforge && npm start`, then try again."
                )
            except Exception as e:
                st.error(f"❌ Error: {e}")
