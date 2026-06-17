import streamlit as st
from pathlib import Path
import sys
import os
import json

sys.path.insert(0, str(Path(__file__).parent.parent.parent))
sys.path.insert(0, str(Path(__file__).parent.parent))

st.set_page_config(page_title="Export & Download", page_icon="📥", layout="wide")

from utils.mobile_css import inject_mobile_css

inject_mobile_css()

st.title("📥 Export & Download")
st.markdown("Download your generated ebooks in DOCX or PDF format")

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

    docx_file = project_dir / "exports" / "ebook.docx"
    pdf_file = project_dir / "exports" / "ebook.pdf"
    manifest_file = project_dir / "exports" / "manifest.json"

    with st.expander(f"📚 {project['title']}", expanded=True):
        col1, col2 = st.columns([2, 1])

        with col1:
            st.markdown(f"**Idea:** {project['idea']}")
            st.markdown(
                f"**Chapters:** {project['chapter_count']} | **Language:** {project['target_language']}"
            )
            st.markdown(f"**Mode:** {project['product_mode']}")

            if manifest_file.exists():
                with open(manifest_file) as f:
                    manifest = json.load(f)
                st.markdown(f"**Generated:** {manifest.get('generated_at', 'Unknown')}")
                files_info = manifest.get("files", {})
                if "docx" in files_info:
                    st.markdown(
                        f"📄 DOCX: {files_info['docx'].get('size', 0) / 1024:.1f} KB"
                    )
                if "pdf" in files_info:
                    st.markdown(
                        f"📕 PDF: {files_info['pdf'].get('size', 0) / 1024:.1f} KB"
                    )

        with col2:
            st.markdown("**Download:**")

            if docx_file.exists():
                with open(docx_file, "rb") as f:
                    st.download_button(
                        label="📄 Download DOCX",
                        data=f.read(),
                        file_name=f"{project['title'].replace(' ', '_')}.docx",
                        mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                        key=f"dl_docx_{project['id']}",
                    )
            else:
                st.button(
                    "📄 DOCX (not found)",
                    disabled=True,
                    key=f"dl_docx_nf_{project['id']}",
                )

            if pdf_file.exists():
                with open(pdf_file, "rb") as f:
                    st.download_button(
                        label="📕 Download PDF",
                        data=f.read(),
                        file_name=f"{project['title'].replace(' ', '_')}.pdf",
                        mime="application/pdf",
                        key=f"dl_pdf_{project['id']}",
                    )
            else:
                st.button(
                    "📕 PDF (not found)",
                    disabled=True,
                    key=f"dl_pdf_nf_{project['id']}",
                )

            epub_file = project_dir / "exports" / "ebook.epub"
            if epub_file.exists():
                with open(epub_file, "rb") as f:
                    st.download_button(
                        label="📖 Download EPUB",
                        data=f.read(),
                        file_name=f"{project['title'].replace(' ', '_')}.epub",
                        mime="application/epub+zip",
                        key=f"dl_epub_{project['id']}",
                    )

        qa_report_path = project_dir / "qa_report.json"
        if qa_report_path.exists():
            qa_data = json.loads(qa_report_path.read_text())
            scores = qa_data.get("scores", {})

            st.markdown("### Quality Report")

            # Overall pass/fail
            passed = qa_data.get("passed", False)
            if passed:
                st.success("✅ Quality check passed — ready to export")
            else:
                st.error("❌ Quality check failed — see issues below")

            # Issues list
            issues = qa_data.get("issues", [])
            if issues:
                with st.expander(f"⚠️ {len(issues)} issue(s) found"):
                    for issue in issues:
                        st.markdown(f"- {issue}")

            # Key metrics row
            def quality_badge(value, low, high):
                if value is None:
                    return "⚪"
                if low <= value <= high:
                    return "🟢"
                elif abs(value - (low + high) / 2) / ((high - low) / 2) < 1.5:
                    return "🟡"
                return "🔴"

            col1, col2, col3, col4 = st.columns(4)

            prose_q = scores.get("prose_quality")
            fre = scores.get("flesch_reading_ease")
            passive = scores.get("passive_voice_ratio")
            slop = scores.get("ai_slop_density")

            with col1:
                badge = quality_badge(prose_q, 0.8, 1.0)
                val = f"{prose_q:.2f}" if prose_q is not None else "N/A"
                st.metric(f"{badge} Prose Quality", val, help="Target: ≥ 0.80")

            with col2:
                badge = quality_badge(fre, 60, 75) if fre is not None else "⚪"
                val = f"{fre:.0f}" if fre is not None else "N/A"
                st.metric(
                    f"{badge} Readability (Flesch)",
                    val,
                    help="Target: 60–75 for nonfiction",
                )

            with col3:
                badge = (
                    "🟢"
                    if passive is not None and passive < 0.10
                    else ("🟡" if passive is not None and passive < 0.15 else "🔴")
                )
                val = f"{passive*100:.1f}%" if passive is not None else "N/A"
                st.metric(f"{badge} Passive Voice", val, help="Target: < 10%")

            with col4:
                badge = (
                    "🟢"
                    if slop is not None and slop < 1.0
                    else ("🟡" if slop is not None and slop < 2.0 else "🔴")
                )
                val = f"{slop:.2f}" if slop is not None else "N/A"
                st.metric(
                    f"{badge} AI Slop Density", val, help="Target: < 1.0 per 500 words"
                )

            # Per-chapter breakdown
            chapter_scores = qa_data.get("chapter_scores", {})
            if chapter_scores:
                with st.expander("📊 Per-chapter breakdown"):
                    for ch_title, ch_data in chapter_scores.items():
                        st.markdown(f"**{ch_title}**")
                        c1, c2, c3 = st.columns(3)
                        with c1:
                            pq = ch_data.get("prose_quality", "N/A")
                            st.markdown(
                                f"Prose: `{pq:.2f}`"
                                if isinstance(pq, float)
                                else f"Prose: `{pq}`"
                            )
                        with c2:
                            wc = ch_data.get("word_count", "N/A")
                            st.markdown(f"Words: `{wc}`")
                        with c3:
                            ss = ch_data.get("structure_score", "N/A")
                            st.markdown(
                                f"Structure: `{ss:.2f}`"
                                if isinstance(ss, float)
                                else f"Structure: `{ss}`"
                            )

        st.markdown("---")
        st.markdown("**Project Files:**")
        if project_dir.exists():
            files = [
                f
                for f in sorted(project_dir.rglob("*"))
                if f.is_file() and not f.name.startswith(".")
            ]
            EXT_ICON = {
                ".md": "📝",
                ".json": "🗂️",
                ".docx": "📄",
                ".pdf": "📕",
                ".epub": "📖",
                ".png": "🖼️",
                ".jpg": "🖼️",
                ".txt": "📃",
            }
            rows_html = "".join(
                f"<tr>"
                f"<td style='padding:4px 8px;white-space:nowrap;'>{EXT_ICON.get(f.suffix, '📄')} <code style='font-size:0.78rem;'>{f.name}</code></td>"
                f"<td style='padding:4px 8px;color:#aaa;font-size:0.75rem;white-space:nowrap;'>{f.relative_to(project_dir).parent if f.relative_to(project_dir).parent != Path('.') else '/'}</td>"
                f"<td style='padding:4px 8px;color:#aaa;font-size:0.75rem;text-align:right;white-space:nowrap;'>{f.stat().st_size / 1024:.1f} KB</td>"
                f"</tr>"
                for f in files
            )
            st.markdown(
                f"<div style='max-height:200px;overflow-y:auto;border:1px solid #333;border-radius:6px;background:#0e1117;'>"
                f"<table style='width:100%;border-collapse:collapse;'>"
                f"<thead><tr style='border-bottom:1px solid #333;'>"
                f"<th style='padding:5px 8px;text-align:left;font-size:0.75rem;color:#666;font-weight:500;'>File</th>"
                f"<th style='padding:5px 8px;text-align:left;font-size:0.75rem;color:#666;font-weight:500;'>Path</th>"
                f"<th style='padding:5px 8px;text-align:right;font-size:0.75rem;color:#666;font-weight:500;'>Size</th>"
                f"</tr></thead>"
                f"<tbody>{rows_html}</tbody>"
                f"</table></div>",
                unsafe_allow_html=True,
            )

            # File preview
            preview_key = f"preview_{project['id']}"
            file_labels = {
                f"{EXT_ICON.get(f.suffix, '📄')} {f.relative_to(project_dir)}": f
                for f in files
            }
            selected_label = st.selectbox(
                "👁 Preview file",
                options=["— select a file —"] + list(file_labels.keys()),
                key=preview_key,
            )
            if selected_label != "— select a file —":
                selected_file = file_labels[selected_label]
                suffix = selected_file.suffix.lower()
                with st.container():
                    st.markdown(
                        f"<div style='border:1px solid #333;border-radius:6px;padding:12px;"
                        f"background:#0e1117;max-height:400px;overflow-y:auto;'>",
                        unsafe_allow_html=True,
                    )
                    if suffix in (".png", ".jpg", ".jpeg", ".gif", ".webp"):
                        st.image(str(selected_file))
                    elif suffix == ".json":
                        with open(selected_file) as fh:
                            st.json(json.load(fh))
                    elif suffix in (".md", ".txt"):
                        content = selected_file.read_text(
                            encoding="utf-8", errors="replace"
                        )
                        if suffix == ".md":
                            st.markdown(content)
                        else:
                            st.text(content)
                    elif suffix == ".pdf":
                        import base64

                        b64 = base64.b64encode(selected_file.read_bytes()).decode()
                        st.markdown(
                            f"<iframe src='data:application/pdf;base64,{b64}' "
                            f"width='100%' height='500px' style='border:none;'></iframe>",
                            unsafe_allow_html=True,
                        )
                    elif suffix == ".docx":
                        try:
                            from docx import Document

                            doc = Document(str(selected_file))
                            text = "\n\n".join(
                                p.text for p in doc.paragraphs if p.text.strip()
                            )
                            st.text_area(
                                "DOCX content",
                                text,
                                height=350,
                                key=f"docx_{project['id']}",
                            )
                        except Exception as e:
                            st.warning(f"Cannot preview DOCX: {e}")
                    elif suffix == ".epub":
                        try:
                            import ebooklib
                            from ebooklib import epub as epublib
                            from html.parser import HTMLParser

                            class _Strip(HTMLParser):
                                def __init__(self):
                                    super().__init__()
                                    self.parts = []

                                def handle_data(self, data):
                                    self.parts.append(data)

                            book = epublib.read_epub(
                                str(selected_file), options={"ignore_ncx": True}
                            )
                            chunks = []
                            for item in book.get_items_of_type(ebooklib.ITEM_DOCUMENT):
                                p = _Strip()
                                p.feed(
                                    item.get_content().decode("utf-8", errors="replace")
                                )
                                chunks.append("".join(p.parts))
                            st.text_area(
                                "EPUB content",
                                "\n\n".join(chunks)[:8000],
                                height=350,
                                key=f"epub_{project['id']}",
                            )
                        except Exception as e:
                            st.warning(f"Cannot preview EPUB: {e}")
                    else:
                        st.info(f"No preview available for `{selected_file.name}`")
                    st.markdown("</div>", unsafe_allow_html=True)

        st.markdown("---")
        st.markdown("**🚀 Marketing:**")

        mk_file = project_dir / "marketing_kit.json"
        strategy_file = project_dir / "strategy.json"
        outline_file = project_dir / "outline.json"

        if st.button(
            "🚀 Push to adforge",
            key=f"adforge_{project['id']}",
            help="Create a landing page + ads campaign in adforge",
        ):
            marketing_kit = {}
            strategy = {}
            outline = {}

            if mk_file.exists():
                with open(mk_file) as f:
                    marketing_kit = json.load(f)
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

            suggested_price = (
                marketing_kit.get("suggested_price", "$9.99")
                .replace("$", "")
                .replace("Free", "0")
            )

            payload = {
                "name": f"{project['title']} — AI Ebook",
                "theme": "dark",
                "product_name": project["title"],
                "price": suggested_price,
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
