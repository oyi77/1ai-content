"""PDF generation from markdown via weasyprint."""
import io
from typing import Optional

from markdown import markdown


def markdown_to_pdf(md_text: str, title: str = "Generated Book") -> bytes:
    """Convert markdown to PDF bytes using weasyprint.

    Args:
        md_text: Full markdown text of the book.
        title: Document title.

    Returns:
        PDF file bytes.
    """
    from weasyprint import HTML

    html_body = markdown(
        md_text,
        extensions=["extra", "codehilite", "toc"],
    )

    html_doc = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{_escape_html(title)}</title>
<style>
  body {{ font-family: Georgia, serif; max-width: 800px; margin: 40px auto; line-height: 1.6; }}
  h1 {{ text-align: center; font-size: 2em; margin-bottom: 0.5em; }}
  h2 {{ color: #333; border-bottom: 1px solid #ccc; padding-bottom: 4px; }}
  h3 {{ color: #555; }}
  code {{ background: #f4f4f4; padding: 2px 6px; border-radius: 3px; }}
  pre {{ background: #f4f4f4; padding: 12px; border-radius: 6px; overflow-x: auto; }}
  blockquote {{ border-left: 4px solid #ccc; margin-left: 0; padding-left: 16px; color: #666; }}
</style>
</head>
<body>
{html_body}
</body>
</html>"""

    pdf_bytes = HTML(string=html_doc).write_pdf()
    return pdf_bytes


def markdown_to_pdf_bytesio(md_text: str, title: str = "Generated Book") -> io.BytesIO:
    """Return PDF as BytesIO for FastAPI StreamingResponse."""
    return io.BytesIO(markdown_to_pdf(md_text, title))


def _escape_html(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
