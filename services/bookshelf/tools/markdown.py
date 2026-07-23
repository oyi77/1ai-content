"""Markdown book assembly tools."""
import io
from typing import Optional


def assemble_markdown(
    title: str,
    structure: dict,
    sections_content: dict[str, str],
) -> str:
    """Assemble all chapter contents into a single markdown string.

    Args:
        title: Book title.
        structure: Parsed JSON structure with keys 'title' and 'sections'.
        sections_content: Dict mapping section title -> markdown content.

    Returns:
        Complete markdown book text.
    """
    lines = [f"# {title}", ""]

    for chapter in structure.get("sections", []):
        chapter_title = chapter.get("title", "Untitled Chapter")
        lines.append(f"## {chapter_title}")
        lines.append("")

        sub_sections = chapter.get("sections", [])
        if not sub_sections:
            content = sections_content.get(chapter_title, "")
            if content:
                lines.append(content)
                lines.append("")
        else:
            for section in sub_sections:
                section_title = section.get("title", "Untitled Section")
                # Check if there's pre-defined content; otherwise look up by section title
                content_key = section_title
                content = sections_content.get(content_key, "")
                if content:
                    lines.append(f"### {section_title}")
                    lines.append("")
                    lines.append(content)
                    lines.append("")

    return "\n".join(lines)


def markdown_to_bytesio(md_text: str) -> io.BytesIO:
    """Convert markdown text to a BytesIO buffer (UTF-8)."""
    return io.BytesIO(md_text.encode("utf-8"))
