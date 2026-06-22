import os
import json

from . import config
from .utils import download_font_if_missing, read_context, append_context, sanitize_text, get_font_path
from .content import ContentGenerator
from .image_source import PexelsImageSource
from .renderer import SlideRenderer
from .ai_visual_layout.visual_layout_service import VisualLayoutService
from .ai_visual_layout.visual_renderer import VisualLayoutRenderer


class TikTokCarouselGenerator:
    """Orchestrator utama yang menggabungkan semua modul menjadi satu pipeline."""

    def __init__(self, pexels_key: str, gemini_key: str,
                 title_font_family: str = None, title_font_weight: int = None,
                 content_font_family: str = None, content_font_weight: int = None,
                 output_dir: str = "output", output_format: str = "portrait",
                 enable_ai_layout: bool = None):

        config.apply_output_preset(output_format)

        tf_family = title_font_family or config.TITLE_FONT_FAMILY
        tf_weight = title_font_weight or config.TITLE_FONT_WEIGHT
        self.title_font_path = get_font_path(tf_family, tf_weight)

        cf_family = content_font_family or config.CONTENT_FONT_FAMILY
        cf_weight = content_font_weight or config.CONTENT_FONT_WEIGHT
        self.content_font_path = get_font_path(cf_family, cf_weight)

        self.output_dir = output_dir
        self.output_format = output_format

        # AI Visual Layout: aktif jika flag CLI true ATAU env var ENABLE_AI_VISUAL_LAYOUT=true
        if enable_ai_layout is not None:
            self.enable_ai_layout = enable_ai_layout
        else:
            self.enable_ai_layout = config.ENABLE_AI_VISUAL_LAYOUT

        # Inisialisasi sub-modul
        self.gemini_key = gemini_key
        self.content_gen = ContentGenerator(api_key=gemini_key)
        self.image_source = PexelsImageSource(api_key=pexels_key)
        self.renderer = SlideRenderer(title_font_path=self.title_font_path, content_font_path=self.content_font_path)

        # AI Visual Layout sub-modul (lazy, hanya aktif jika diperlukan)
        self.visual_layout_service = None
        self.visual_renderer = None
        if self.enable_ai_layout:
            self.visual_layout_service = VisualLayoutService(
                api_key=gemini_key,
                model=config.VISUAL_LAYOUT_MODEL,
                timeout_ms=config.VISUAL_LAYOUT_TIMEOUT_MS,
            )
            self.visual_renderer = VisualLayoutRenderer()
            print(f"🎨 AI Visual Layout Director AKTIF (model: {config.VISUAL_LAYOUT_MODEL}, style: {config.VISUAL_LAYOUT_STYLE})")

    def run(self, topic: str, num_slides: int, style: str, box_opacity: int = None) -> None:
        """Jalankan pipeline: generate konten → cari gambar → render slide → simpan."""
        
        # Aktifkan AI layout jika flag aktif atau style yang diminta adalah "beauty"
        use_ai_layout = self.enable_ai_layout or (style == "beauty")
        if use_ai_layout and not self.visual_layout_service:
            self.visual_layout_service = VisualLayoutService(
                api_key=self.gemini_key,
                model=config.VISUAL_LAYOUT_MODEL,
                timeout_ms=config.VISUAL_LAYOUT_TIMEOUT_MS,
            )
            self.visual_renderer = VisualLayoutRenderer()
            print(f"🎨 AI Visual Layout Director AKTIF (model: {config.VISUAL_LAYOUT_MODEL}, style: {config.VISUAL_LAYOUT_STYLE})")

        if not os.path.exists(self.output_dir):
            os.makedirs(self.output_dir)

        try:
            # 1. Dapatkan JSON yang berisi Metadata + Slides
            previous_context = read_context(config.CONTEXT_FILE)
            full_data = self.content_gen.generate(topic, num_slides, style, previous_context)
            full_data["output_format"] = self.output_format
            full_data["canvas_size"] = {
                "width": config.CANVAS_WIDTH,
                "height": config.CANVAS_HEIGHT,
            }

            # 2. Ekstraksi data
            tiktok_title = full_data.get("tiktok_title", "Tanpa Judul")
            tiktok_desc = full_data.get("tiktok_description", "")
            tiktok_tags = full_data.get("tiktok_tags", [])
            slides = full_data.get("slides", [])

            ai_title_font = full_data.get("title_font_family", config.TITLE_FONT_FAMILY)
            ai_content_font = full_data.get("content_font_family", config.CONTENT_FONT_FAMILY)
            
            title_font_path = get_font_path(ai_title_font, config.TITLE_FONT_WEIGHT)
            content_font_path = get_font_path(ai_content_font, config.CONTENT_FONT_WEIGHT)
            
            print(f"\n🎨 AI merekomendasikan font Title: {ai_title_font}, Content: {ai_content_font}")
            download_font_if_missing(title_font_path)
            download_font_if_missing(content_font_path)
            
            self.renderer = SlideRenderer(title_font_path=title_font_path, content_font_path=content_font_path)

            # 3. Print Metadata ke Console
            print("\n" + "=" * 50)
            print("📱 METADATA TIKTOK POST")
            print("=" * 50)
            print(f"📍 Judul     : {tiktok_title}")
            print(f"📍 Deskripsi : {tiktok_desc}")
            print(f"📍 Format    : {self.output_format} ({config.CANVAS_WIDTH}x{config.CANVAS_HEIGHT})")

            # Format hashtag agar ada tanda '#' nya jika AI lupa
            formatted_tags = " ".join([f"#{t.replace('#', '')}" for t in tiktok_tags])
            print(f"📍 Tags      : {formatted_tags}")
            print("=" * 50 + "\n")

            # 4. Simpan Metadata ke file metadata.json
            metadata_filepath = os.path.join(self.output_dir, "metadata.json")
            with open(metadata_filepath, "w", encoding="utf-8") as f:
                json.dump(full_data, f, ensure_ascii=False, indent=4)
            print(f"💾 Metadata berhasil disimpan di: {metadata_filepath}")

            # 5. Simpan isi konten ke context.txt untuk memori generasi berikutnya
            if slides:
                append_context(config.CONTEXT_FILE, topic, slides)
                print(f"📝 Sejarah konten (Context) berhasil di-update di: {config.CONTEXT_FILE}")
            else:
                print("⚠️ Peringatan: Data 'slides' kosong dari AI.")

            # 6. Proses Render Gambar Slide
            for i, slide in enumerate(slides):
                print(f"\n▶️ Memproses Slide {i} ({slide.get('type', 'unknown')})")

                font_size = config.TITLE_FONT_SIZE if slide.get("type") == "judul" else config.CONTENT_FONT_SIZE

                slide_text = slide.get("teks", "")
                slide_text = slide_text.replace(". ", ".\n\n")
                slide_title = slide.get("slide_title", "")

                # Bersihkan emoji/simbol non-BMP
                slide_text = sanitize_text(slide_text)
                slide_title = sanitize_text(slide_title)

                is_title = slide.get("type") == "judul"

                raw_img = self.image_source.get_image(slide.get("keyword_gambar", "background"))

                # ── AI Visual Layout Director ──────────────────────────
                if use_ai_layout and self.visual_layout_service and self.visual_renderer:
                    final_img = self._render_with_ai_layout(
                        raw_img, slide, slide_text, slide_title, is_title, topic, style, font_size, box_opacity
                    )
                else:
                    # Fallback ke renderer lama
                    final_img = self.renderer.process_slide(
                        raw_img, slide_text, font_size, style, slide_title, is_title, box_opacity=box_opacity
                    )

                filename = os.path.join(self.output_dir, f"slide_{i:02d}.jpg")
                final_img.save(filename, quality=config.JPG_QUALITY)
                print(f"✅ Berhasil disimpan: {filename}")

            print(f"\n🎉 SELESAI! Semua file gambar dan metadata telah disimpan di folder '{self.output_dir}'.")

        except Exception as e:
            print(f"\n❌ Terjadi kesalahan saat eksekusi: {e}")

    def _render_with_ai_layout(self, raw_img, slide: dict, slide_text: str,
                                slide_title: str, is_title: bool, topic: str,
                                style: str, font_size: int, box_opacity: int = None):
        """Render slide menggunakan AI Visual Layout Director.
        Jika AI layout gagal, otomatis fallback ke renderer lama."""
        from PIL import Image

        # 1. Resize/crop gambar ke canvas size (sama seperti renderer lama)
        target_size = (config.CANVAS_WIDTH, config.CANVAS_HEIGHT)
        img_ratio = raw_img.width / raw_img.height
        target_ratio = target_size[0] / target_size[1]

        if img_ratio > target_ratio:
            new_width = int(target_size[1] * img_ratio)
            raw_img = raw_img.resize((new_width, target_size[1]), Image.Resampling.LANCZOS)
        else:
            new_height = int(target_size[0] / img_ratio)
            raw_img = raw_img.resize((target_size[0], new_height), Image.Resampling.LANCZOS)

        left = (raw_img.width - target_size[0]) / 2
        top = (raw_img.height - target_size[1]) / 2
        cropped_img = raw_img.crop((left, top, left + target_size[0], top + target_size[1]))

        # 2. Tentukan teks untuk headline/subtitle
        slide_type = "cover" if is_title else "content"
        headline = slide_title or slide_text if is_title else slide_title
        subtitle = slide_text if not is_title else ""

        # Untuk cover slide, headline = teks utama, subtitle kosong
        if is_title:
            headline = slide_text
            subtitle = ""

        # 3. Panggil AI Visual Layout Service
        try:
            visual_layout = self.visual_layout_service.generate_visual_layout(
                pil_image=cropped_img,
                canvas_width=config.CANVAS_WIDTH,
                canvas_height=config.CANVAS_HEIGHT,
                canvas_format=config.OUTPUT_FORMAT,
                slide_type=slide_type,
                topic=topic,
                headline_text=headline,
                subtitle_text=subtitle,
                target_style=config.VISUAL_LAYOUT_STYLE,
            )

            # 4. Simpan layout JSON untuk debugging
            layout_filename = os.path.join(self.output_dir, f"layout_slide_{slide.get('_index', 0):02d}.json")
            try:
                with open(layout_filename, "w", encoding="utf-8") as f:
                    json.dump(visual_layout, f, ensure_ascii=False, indent=2)
            except Exception:
                pass  # Non-critical

            # 5. Render menggunakan visual renderer
            final_img = self.visual_renderer.render_visual_layout(cropped_img, visual_layout)
            print(f"   🎨 AI Visual Layout berhasil dirender!")
            return final_img

        except Exception as e:
            print(f"   ⚠️ AI Visual Layout gagal ({e}), fallback ke renderer lama.")
            fallback_style = "plain" if style == "beauty" else style
            return self.renderer.process_slide(
                cropped_img, slide_text, font_size, fallback_style, slide_title, is_title, box_opacity=box_opacity
            )
