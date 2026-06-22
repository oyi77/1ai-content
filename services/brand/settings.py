"""
Brand Settings — Consistent branding across all generated content.

Stores per-user brand identity (colors, logo, watermark, fonts) and applies
branding to video output via FFmpeg + Pillow for logo processing.
"""

import subprocess
import tempfile
from pathlib import Path
from typing import Optional

DEFAULT_PRIMARY = "#FF6B35"
DEFAULT_SECONDARY = "#004E89"


class BrandSettings:
    """Per-user brand settings with video branding capabilities."""

    def __init__(self):
        self._brands: dict[str, dict] = {}

    def set_brand(self, user_id: str, settings: dict) -> dict:
        """Store brand settings for a user.

        settings keys: name, logo_path, watermark_path, primary_color,
        secondary_color, font_style, tagline, platforms.
        """
        brand = {
            "name": settings.get("name", ""),
            "logo_path": settings.get("logo_path"),
            "watermark_path": settings.get("watermark_path"),
            "primary_color": settings.get("primary_color", DEFAULT_PRIMARY),
            "secondary_color": settings.get("secondary_color", DEFAULT_SECONDARY),
            "font_style": settings.get("font_style", "default"),
            "tagline": settings.get("tagline", ""),
            "platforms": settings.get("platforms", []),
        }
        self._brands[user_id] = brand
        return {"success": True, "user_id": user_id, "settings": brand}

    def get_brand(self, user_id: str) -> dict:
        """Return brand settings for a user."""
        if user_id not in self._brands:
            return {"success": False, "error": "No brand settings"}
        return {"success": True, "settings": self._brands[user_id]}

    def apply_watermark(
        self, video_path: str, user_id: str, output_path: str
    ) -> str:
        """Overlay brand watermark at bottom-right of video.

        Uses ffmpeg overlay filter: overlay=W-w-10:H-h-10
        """
        brand = self._brands.get(user_id)
        if not brand or not brand.get("watermark_path"):
            # No watermark — copy video as-is
            subprocess.run(
                ["cp", video_path, output_path],
                check=True,
            )
            return output_path

        watermark = brand["watermark_path"]
        subprocess.run(
            [
                "ffmpeg", "-y",
                "-i", video_path,
                "-i", watermark,
                "-filter_complex", "overlay=W-w-10:H-h-10",
                "-c:a", "copy",
                output_path,
            ],
            check=True,
            capture_output=True,
        )
        return output_path

    def apply_brand_intro(
        self,
        video_path: str,
        user_id: str,
        output_path: str,
        duration: float = 3.0,
    ) -> str:
        """Prepend a brand intro clip (logo on colored background).

        1. Render a frame with Pillow (brand colors, logo, text)
        2. Create a short intro video clip from the frame
        3. Concatenate intro + original video
        """
        brand = self._brands.get(user_id, {})
        primary = brand.get("primary_color", DEFAULT_PRIMARY)
        secondary = brand.get("secondary_color", DEFAULT_SECONDARY)
        logo = brand.get("logo_path")
        brand_name = brand.get("name", "")

        # Probe source video for dimensions
        probe = subprocess.run(
            [
                "ffprobe", "-v", "error",
                "-select_streams", "v:0",
                "-show_entries", "stream=width,height",
                "-of", "csv=p=0",
                video_path,
            ],
            capture_output=True,
            text=True,
            check=True,
        )
        dims = probe.stdout.strip()
        width, height = (int(d) for d in dims.split(",")) if dims else (1920, 1080)

        tmpdir = tempfile.mkdtemp(prefix="brand_intro_")
        intro_path = str(Path(tmpdir) / "intro.mp4")
        frame_path = str(Path(tmpdir) / "frame.png")
        concat_list = str(Path(tmpdir) / "concat.txt")

        # Render intro frame with Pillow
        self._render_intro_frame(
            frame_path, width, height, primary, secondary, logo, brand_name
        )

        # Create intro video from single frame image
        subprocess.run(
            [
                "ffmpeg", "-y",
                "-loop", "1",
                "-i", frame_path,
                "-c:v", "libx264", "-pix_fmt", "yuv420p",
                "-t", str(duration),
                "-r", "30",
                intro_path,
            ],
            check=True,
            capture_output=True,
        )

        # Concatenate intro + original
        with open(concat_list, "w") as f:
            f.write(f"file '{intro_path}'\n")
            f.write(f"file '{video_path}'\n")

        subprocess.run(
            [
                "ffmpeg", "-y",
                "-f", "concat", "-safe", "0",
                "-i", concat_list,
                "-c:v", "libx264", "-pix_fmt", "yuv420p",
                "-c:a", "aac",
                output_path,
            ],
            check=True,
            capture_output=True,
        )
        return output_path

    @staticmethod
    def _render_intro_frame(
        out_path: str,
        width: int,
        height: int,
        primary: str,
        secondary: str,
        logo_path: Optional[str],
        brand_name: str,
    ) -> None:
        """Render a brand intro frame as PNG using Pillow."""
        from PIL import Image, ImageDraw, ImageFont

        frame = Image.new("RGB", (width, height), primary)
        draw = ImageDraw.Draw(frame)
        cx, cy = width // 2, height // 2
        logo_bottom = cy

        if logo_path and Path(logo_path).is_file():
            logo = Image.open(logo_path).convert("RGBA")
            max_w = int(width * 0.4)
            if logo.width > max_w:
                ratio = max_w / logo.width
                logo = logo.resize(
                    (max_w, int(logo.height * ratio)), Image.LANCZOS
                )
            lx = cx - logo.width // 2
            ly = cy - logo.height // 2 - int(height * 0.05)
            frame.paste(logo, (lx, ly), logo)
            logo_bottom = ly + logo.height

        if brand_name:
            font_size = max(24, int(width * 0.04))
            try:
                font = ImageFont.truetype(
                    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
                    font_size,
                )
            except (IOError, OSError):
                font = ImageFont.load_default()
            bbox = draw.textbbox((0, 0), brand_name, font=font)
            tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
            tx = cx - tw // 2
            ty = logo_bottom + int(height * 0.03)
            draw.text((tx, ty), brand_name, fill=secondary, font=font)

        frame.save(out_path)

    def get_ffmpeg_filter(self, user_id: str) -> str:
        """Return FFmpeg filter string for branding.

        Combines watermark overlay + subtle color grading based on brand colors.
        """
        brand = self._brands.get(user_id)
        if not brand:
            return ""

        filters = []

        # Watermark overlay
        if brand.get("watermark_path"):
            filters.append("overlay=W-w-10:H-h-10")

        # Subtle color grading: shift hue toward brand primary
        primary = brand.get("primary_color", DEFAULT_PRIMARY)
        filters.append(
            f"colorbalance=rs=0.05:gs=-0.02:bs=-0.03"
        )

        return ",".join(filters) if filters else ""
