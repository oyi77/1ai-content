try:
    from ebooklib import epub
except ImportError as e:
    raise ImportError(
        "ebooklib is required for EPUB export. Install it with: pip install ebooklib"
    ) from e

import re
from pathlib import Path
from services.ebook.logger import get_logger

logger = get_logger(__name__)


CSS = """\
body {
    font-family: Georgia, serif;
    font-size: 1em;
    line-height: 1.5;
    margin: 1em 2em;
}
h1 { color: #333; font-size: 2em; line-height: 1.2; margin-bottom: 0.5em; page-break-after: avoid; }
h2 { color: #555; font-size: 1.6em; line-height: 1.2; margin-bottom: 0.4em; page-break-after: avoid; }
h3 { font-size: 1.3em; line-height: 1.2; page-break-after: avoid; }
p  { margin: 0 0 0.9em 0; text-indent: 0; }
strong { font-weight: bold; }
em { font-style: italic; }
img { max-width: 100%; height: auto; }
blockquote { border-left: 3px solid #ccc; margin-left: 1.5em; padding-left: 1em; }
aside { background: #f9f9f9; border-left: 4px solid #666; padding: 0.8em 1em; margin: 1em 0; }
section.chapter { page-break-before: always; }
.callout {
    border-left: 3px solid #666;
    padding-left: 1em;
    margin: 1em 0;
    font-style: italic;
}
.section-break { text-align: center; margin: 1.5em 0; }
"""


def _md_to_html(text: str) -> str:
    """Convert basic markdown text block to HTML."""
    # Bold
    text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)
    # Italic
    text = re.sub(r"\*(.+?)\*", r"<em>\1</em>", text)
    # Escape any remaining HTML-unsafe chars that weren't from markdown
    # (title lines handled separately, so this is body text only)
    paragraphs = re.split(r"\n{2,}", text.strip())
    parts = []
    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        # Section break markers
        if re.match(r"^\*\s+\*\s+\*$", para) or re.match(r"^-{3,}$", para):
            parts.append('<p class="section-break">&#x2042;</p>')
        # Callout: blockquote lines starting with > **Key Insight:**
        elif para.startswith("&gt; ") or para.startswith("> "):
            inner = re.sub(r"^&gt;\s*|^>\s*", "", para, flags=re.MULTILINE)
            parts.append(f'<aside epub:type="tip" class="callout">{inner}</aside>')
        # Don't double-wrap heading lines that might sneak in
        elif para.startswith("<h"):
            parts.append(para)
        else:
            parts.append(f"<p>{para}</p>")
    return "\n".join(parts)


def _parse_manuscript(content: str) -> list[dict]:
    """Split manuscript on ## chapter boundaries. Returns list of {title, body}."""
    chapters = []
    current_title = None
    current_lines: list[str] = []

    for line in content.splitlines():
        if line.startswith("## "):
            if current_title is not None:
                chapters.append(
                    {"title": current_title, "body": "\n".join(current_lines)}
                )
            current_title = line[3:].strip()
            current_lines = []
        else:
            if current_title is not None:
                current_lines.append(line)
            # Lines before first ## are ignored (preamble / # title)

    if current_title is not None:
        chapters.append({"title": current_title, "body": "\n".join(current_lines)})

    return chapters


class EpubGenerator:
    def __init__(self, projects_dir: Path | str = "projects"):
        self.projects_dir = Path(projects_dir)

    def _load_front_matter(self, project_dir: Path) -> list[dict]:
        """Load front matter markdown files as chapter dicts if they exist."""
        fm_dir = project_dir / "front_matter"
        if not fm_dir.exists():
            return []
        order = ["title_page", "copyright", "dedication", "preface", "toc_page"]
        chapters = []
        for name in order:
            f = fm_dir / f"{name}.md"
            if f.exists():
                content = f.read_text(encoding="utf-8")
                title = name.replace("_", " ").title()
                chapters.append(
                    {"title": title, "body": content, "epub_type": "frontmatter"}
                )
        return chapters

    def _load_back_matter(self, project_dir: Path) -> list[dict]:
        """Load back matter markdown files as chapter dicts if they exist."""
        bm_dir = project_dir / "back_matter"
        if not bm_dir.exists():
            return []
        order = ["glossary", "about_author"]
        chapters = []
        for name in order:
            f = bm_dir / f"{name}.md"
            if f.exists():
                content = f.read_text(encoding="utf-8")
                title = name.replace("_", " ").title()
                chapters.append(
                    {"title": title, "body": content, "epub_type": "backmatter"}
                )
        return chapters

    def generate(
        self,
        project_id: int,
        title: str = "Ebook",
        subtitle: str = "",
        author: str = "Author",
        language: str = "en",
    ) -> dict:
        project_dir = self.projects_dir / str(project_id)
        exports_dir = project_dir / "exports"
        exports_dir.mkdir(parents=True, exist_ok=True)

        book = epub.EpubBook()
        book.set_title(title)
        book.set_language(language)
        book.add_author(author)

        # CSS
        style = epub.EpubItem(
            uid="style",
            file_name="style/main.css",
            media_type="text/css",
            content=CSS.encode(),
        )
        book.add_item(style)

        # Cover image
        cover_file = project_dir / "cover" / "cover.png"
        if cover_file.exists():
            try:
                cover_data = cover_file.read_bytes()
                book.set_cover("cover.png", cover_data)
            except Exception as e:
                logger.warning("Failed to add cover to EPUB", error=str(e))

        # Parse manuscript into chapters
        manuscript_file = project_dir / "manuscript.md"
        chapter_items: list[epub.EpubHtml] = []

        if manuscript_file.exists():
            content = manuscript_file.read_text(encoding="utf-8")
            body_chapters = _parse_manuscript(content)
        else:
            body_chapters = []

        if not body_chapters:
            # Fallback: single title page
            body_chapters = [{"title": title, "body": subtitle or ""}]

        # Assign epub:type to body chapters by position
        total_body = len(body_chapters)
        for idx, ch in enumerate(body_chapters, start=1):
            if "epub_type" not in ch:
                if idx == 1:
                    ch["epub_type"] = "introduction"
                elif idx == total_body:
                    ch["epub_type"] = "conclusion"
                else:
                    ch["epub_type"] = "chapter"

        front_matter = self._load_front_matter(project_dir)
        back_matter = self._load_back_matter(project_dir)
        chapters = front_matter + body_chapters + back_matter

        total_chapters = len(chapters)
        for idx, ch in enumerate(chapters, start=1):
            ch_title = ch["title"]
            ch_body_html = _md_to_html(ch["body"])

            epub_type = ch.get("epub_type", "chapter")

            html_content = (
                f'<?xml version="1.0" encoding="UTF-8"?>'
                f"<!DOCTYPE html>"
                f'<html xmlns="http://www.w3.org/1999/xhtml"'
                f' xmlns:epub="http://www.idpf.org/2007/ops">'
                f"<head>"
                f"<title>{ch_title}</title>"
                f'<link rel="stylesheet" type="text/css" href="../style/main.css"/>'
                f"</head>"
                f"<body>"
                f'<section epub:type="{epub_type}" class="chapter">'
                f"<h2>{ch_title}</h2>"
                f"{ch_body_html}"
                f"</section>"
                f"</body></html>"
            )

            item = epub.EpubHtml(
                title=ch_title,
                file_name=f"chapter_{idx:03d}.xhtml",
                lang=language,
            )
            item.content = html_content.encode("utf-8")
            item.add_item(style)
            book.add_item(item)
            chapter_items.append(item)

        # TOC and navigation
        book.toc = tuple(
            epub.Link(item.file_name, item.title, f"ch{i}")
            for i, item in enumerate(chapter_items, start=1)
        )
        book.add_item(epub.EpubNcx())
        book.add_item(epub.EpubNav())

        book.spine = ["nav"] + chapter_items

        epub_path = exports_dir / "ebook.epub"
        epub.write_epub(str(epub_path), book)

        return {"epub": epub_path}
