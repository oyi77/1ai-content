# =========================================================
# VISUAL LAYOUT SERVICE
# Memanggil Gemini Vision API untuk menganalisis gambar
# background dan menghasilkan layout overlay teks.
# =========================================================

import os
import re
import json
import base64
import time

from google import genai
from google.genai import types

from .. import config
from .visual_layout_prompt import build_visual_layout_prompt
from .layout_validator import validate_visual_layout
from .visual_layout_types import make_default_visual_layout


class VisualLayoutService:
    """
    Service untuk menghasilkan AI Visual Layout dari gambar background.
    Menggunakan Gemini Vision API (multimodal) untuk menganalisis gambar
    dan mengembalikan JSON layout berisi posisi teks, warna, dekorasi, dsb.
    """

    def __init__(self, api_key: str = None, model: str = None, timeout_ms: int = None):
        self.api_key = api_key or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY", "")
        self.model = model or getattr(config, "VISUAL_LAYOUT_MODEL", "gemini-2.5-flash")
        self.timeout_ms = timeout_ms or getattr(config, "VISUAL_LAYOUT_TIMEOUT_MS", 30000)
        self.max_attempts = 7
        self.initial_wait_seconds = 10
        self.wait_increment_seconds = 10

    def _image_to_base64(self, image_path: str) -> str:
        """Baca file gambar dan convert ke base64 string."""
        with open(image_path, "rb") as f:
            return base64.standard_b64encode(f.read()).decode("utf-8")

    def _pil_image_to_base64(self, pil_image) -> str:
        """Convert PIL Image object ke base64 PNG string."""
        import io
        buffer = io.BytesIO()
        pil_image.save(buffer, format="PNG")
        buffer.seek(0)
        return base64.standard_b64encode(buffer.read()).decode("utf-8")

    def _get_mime_type(self, image_path: str) -> str:
        """Tentukan MIME type dari ekstensi file."""
        ext = os.path.splitext(image_path)[1].lower()
        mime_map = {
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".webp": "image/webp",
            ".gif": "image/gif",
        }
        return mime_map.get(ext, "image/jpeg")

    def _extract_json_from_text(self, text: str) -> dict:
        """Ekstrak JSON dari teks response (yang mungkin ada basa-basi/markdown)."""
        if not text:
            raise ValueError("Response teks kosong dari AI.")

        # Coba langsung parse
        try:
            return json.loads(text.strip())
        except json.JSONDecodeError:
            pass

        # Cari JSON block terluar
        match = re.search(r'\{.*\}', text, re.DOTALL)
        if match:
            json_str = match.group(0)
            try:
                return json.loads(json_str)
            except json.JSONDecodeError as e:
                raise ValueError(f"Ditemukan JSON-like tapi tidak valid: {e}")

        raise ValueError(f"Tidak ditemukan JSON di response AI:\n{text[:500]}")

    def generate_visual_layout(
        self,
        image_path: str = None,
        pil_image=None,
        canvas_width: int = 1080,
        canvas_height: int = 1920,
        canvas_format: str = "portrait",
        slide_type: str = "cover",
        topic: str = "",
        headline_text: str = "",
        subtitle_text: str = "",
        optional_labels: list = None,
        target_style: str = "lemon8",
    ) -> dict:
        """
        Kirim gambar background + prompt ke Gemini Vision,
        terima JSON layout, validasi, dan return.
        Jika gagal, return fallback layout.

        Args:
            image_path: Path ke file gambar background (opsional jika pil_image diberikan)
            pil_image: PIL Image object (opsional jika image_path diberikan)
            canvas_width: Lebar canvas dalam pixel
            canvas_height: Tinggi canvas dalam pixel
            canvas_format: Format canvas (portrait/square/portrait3_4)
            slide_type: Tipe slide (cover/content/closing)
            topic: Topik carousel
            headline_text: Teks headline
            subtitle_text: Teks subtitle
            optional_labels: Label opsional
            target_style: Target visual style

        Returns:
            dict: Validated VisualLayout JSON
        """
        if not self.api_key:
            print("⚠️ [VisualLayout] API key tidak tersedia, menggagalkan AI Layout.")
            raise ValueError("API Key tidak tersedia untuk Visual Layout.")

        # Build prompt
        prompt_text = build_visual_layout_prompt(
            canvas_width=canvas_width,
            canvas_height=canvas_height,
            canvas_format=canvas_format,
            slide_type=slide_type,
            topic=topic,
            headline_text=headline_text,
            subtitle_text=subtitle_text,
            optional_labels=optional_labels,
            target_style=target_style,
        )

        # Prepare image data
        try:
            if pil_image is not None:
                image_b64 = self._pil_image_to_base64(pil_image)
                mime_type = "image/png"
            elif image_path and os.path.exists(image_path):
                image_b64 = self._image_to_base64(image_path)
                mime_type = self._get_mime_type(image_path)
            else:
                print("⚠️ [VisualLayout] Gambar tidak ditemukan, menggagalkan AI Layout.")
                raise ValueError("Gambar tidak ditemukan.")
        except Exception as e:
            print(f"⚠️ [VisualLayout] Gagal membaca gambar: {e}")
            raise ValueError(f"Gagal membaca gambar: {e}")

        # Call Gemini Vision API with retry
        client = genai.Client(
            api_key=self.api_key,
            http_options=types.HttpOptions(
                timeout=self.timeout_ms,
                retry_options=types.HttpRetryOptions(attempts=1),
            ),
        )

        last_exc = None
        for attempt in range(1, self.max_attempts + 1):
            try:
                print(f"🎨 [VisualLayout] Meminta AI analisis gambar (attempt {attempt}/{self.max_attempts})...")

                response = client.models.generate_content(
                    model=self.model,
                    contents=[
                        types.Content(
                            role="user",
                            parts=[
                                types.Part.from_bytes(
                                    data=base64.standard_b64decode(image_b64),
                                    mime_type=mime_type,
                                ),
                                types.Part.from_text(text=prompt_text),
                            ],
                        )
                    ],
                )

                raw_text = (response.text or "").strip()

                if not raw_text:
                    raise ValueError("Response kosong dari Gemini Vision.")

                # Parse JSON
                layout_json = self._extract_json_from_text(raw_text)

                # Validate dan fix
                validated = validate_visual_layout(
                    layout_json, canvas_width, canvas_height, headline_text, subtitle_text
                )

                print(f"✅ [VisualLayout] AI layout berhasil digenerate dan divalidasi.")
                return validated

            except Exception as exc:
                last_exc = exc
                print(f"⚠️ [VisualLayout] Attempt {attempt}/{self.max_attempts} gagal: {exc}")

                if attempt < self.max_attempts:
                    wait = self.initial_wait_seconds + ((attempt - 1) * self.wait_increment_seconds)
                    print(f"⏳ [VisualLayout] Retry dalam {wait} detik...")
                    time.sleep(wait)

        print(f"❌ [VisualLayout] Semua attempt gagal. Error terakhir: {last_exc}")
        raise Exception(f"Gagal generate visual layout setelah {self.max_attempts} percobaan: {last_exc}")
