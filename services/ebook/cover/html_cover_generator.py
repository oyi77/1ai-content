from __future__ import annotations

from pathlib import Path

from jinja2 import Environment, FileSystemLoader

TEMPLATE_DIR = Path(__file__).parent / "templates"

# Color schemes per mode
COLOR_SCHEMES = {
    "lead_magnet": {"primary": "#1a1a2e", "secondary": "#16213e", "accent": "#e94560"},
    "paid_ebook": {"primary": "#0f3460", "secondary": "#533483", "accent": "#e94560"},
    "bonus_content": {
        "primary": "#1b262c",
        "secondary": "#0f4c75",
        "accent": "#1b9aaa",
    },
    "authority": {"primary": "#2d132c", "secondary": "#ee4540", "accent": "#c72c41"},
    "novel": {"primary": "#1a0533", "secondary": "#2d1b69", "accent": "#f7b731"},
    "short_story": {"primary": "#0d0d0d", "secondary": "#1a1a1a", "accent": "#f39c12"},
    "memoir": {"primary": "#2c1810", "secondary": "#8b4513", "accent": "#daa520"},
    "how_to_guide": {"primary": "#1e3a5f", "secondary": "#2e86ab", "accent": "#00d4aa"},
    "textbook": {"primary": "#1565c0", "secondary": "#0d47a1", "accent": "#ff6f00"},
    "academic_paper": {
        "primary": "#37474f",
        "secondary": "#263238",
        "accent": "#00bcd4",
    },
    "manga": {"primary": "#1a1a1a", "secondary": "#2d2d2d", "accent": "#ffffff"},
    "manhwa": {"primary": "#1a0a2e", "secondary": "#2d1b4e", "accent": "#ff6b9d"},
    "manhua": {"primary": "#1a0a0a", "secondary": "#3d1515", "accent": "#ff4444"},
    "comics": {"primary": "#0a0a2e", "secondary": "#1a1a4e", "accent": "#ffff00"},
}

TEMPLATE_MAP = {
    "lead_magnet": "nonfiction",
    "paid_ebook": "nonfiction",
    "bonus_content": "nonfiction",
    "authority": "nonfiction",
    "how_to_guide": "nonfiction",
    "novel": "fiction",
    "short_story": "fiction",
    "memoir": "fiction",
    "textbook": "academic",
    "academic_paper": "academic",
    "manga": "comics",
    "manhwa": "comics",
    "manhua": "comics",
    "comics": "comics",
}

MODE_LABELS = {
    "lead_magnet": "Lead Magnet",
    "paid_ebook": "Premium Ebook",
    "bonus_content": "Bonus Content",
    "authority": "Authority Guide",
    "novel": "Novel",
    "short_story": "Short Story",
    "memoir": "Memoir",
    "how_to_guide": "How-To Guide",
    "textbook": "Textbook",
    "academic_paper": "Academic Paper",
    "manga": "Manga",
    "manhwa": "Manhwa · Webtoon",
    "manhua": "Manhua",
    "comics": "Comics",
}


def _title_font_size(title: str) -> int:
    n = len(title)
    if n <= 20:
        return 120
    if n <= 35:
        return 96
    if n <= 50:
        return 80
    if n <= 70:
        return 64
    return 52


class HTMLCoverGenerator:
    def __init__(self, width: int = 1200, height: int = 1680):
        self.width = width
        self.height = height
        self._env = Environment(
            loader=FileSystemLoader(str(TEMPLATE_DIR)), autoescape=False
        )

    def generate(
        self,
        title: str,
        subtitle: str = "",
        author: str = "AI Generated",
        product_mode: str = "paid_ebook",
        output_path: Path | None = None,
    ) -> bytes:
        """Render cover via Playwright. Returns PNG bytes."""
        template_name = TEMPLATE_MAP.get(product_mode, "nonfiction")
        colors = COLOR_SCHEMES.get(product_mode, COLOR_SCHEMES["paid_ebook"])
        mode_label = MODE_LABELS.get(
            product_mode, product_mode.replace("_", " ").title()
        )
        title_size = _title_font_size(title)

        template = self._env.get_template(f"{template_name}.html.j2")
        body_html = template.render(
            title=title,
            subtitle=subtitle,
            author=author,
            mode_label=mode_label,
            title_size=title_size,
            **colors,
        )

        base_template = self._env.get_template("base.html.j2")
        full_html = base_template.render(content=body_html)

        png_bytes = self._render_html(full_html)

        if output_path:
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_bytes(png_bytes)

        return png_bytes

    def _render_html(self, html: str) -> bytes:
        from playwright.sync_api import sync_playwright

        with sync_playwright() as p:
            browser = p.chromium.launch(
                args=["--no-sandbox", "--disable-dev-shm-usage"]
            )
            page = browser.new_page(
                viewport={"width": self.width, "height": self.height}
            )
            page.set_content(html, wait_until="domcontentloaded")
            png_bytes = page.screenshot(
                clip={"x": 0, "y": 0, "width": self.width, "height": self.height},
                type="png",
            )
            browser.close()
        return png_bytes
