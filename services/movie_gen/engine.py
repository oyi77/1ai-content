"""
Async generation engine for movies/short films.

AsyncGenerator-based pipeline with SSE events, mirroring comic_gen/engine.py.
Phases:
  - script_generating → script_ready: LLM generates movie script
  - scene_rendering → scene_rendered: generate scene images
  - audio_rendering → audio_rendered: generate TTS narration
  - video_assembling → complete: assemble final video
"""

import asyncio
import json
import os
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Any, AsyncGenerator, Optional

from services.movie_gen.movie_types import (
    MovieOutput, MovieScript, RenderedScene,
)
from services.movie_gen.script_engine import generate_script, script_to_dict
from services.movie_gen.video_gen import (
    assemble_movie, render_scene_segment, _ensure1920x1080, _ffmpeg,
)


# ── Default config (mirrors comic_gen) ────────────────────────────────
DEFAULT_OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "media", "movies")


async def generate_movie(
    prompt: str,
    *,
    language: str = "en",
    genre: str = "short_film",
    num_scenes: int = 4,
    target_duration: int = 60,
    generate_images: bool = True,
    generate_audio: bool = True,
    generate_video: bool = True,
    output_dir: str = DEFAULT_OUTPUT_DIR,
    bgm_mood: str = "",
    bgm_volume: float = 0.15,
) -> AsyncGenerator[dict[str, Any], None]:
    """
    AsyncGenerator movie pipeline. Yields SSE-compatible dict events:
      - {type: "log", message: "..."}
      - {type: "script_generating"}
      - {type: "script_ready", script: dict, stats: dict}
      - {type: "scene_rendering", scene_id: int, total: int}
      - {type: "scene_rendered", scene_id: int, image_path: str}
      - {type: "audio_rendering", scene_id: int, text: str}
      - {type: "audio_rendered", scene_id: int, audio_path: str}
      - {type: "video_assembling"}
      - {type: "complete", title: str, video_path: str, duration_seconds: float,
         total_scenes: int, num_episodes: int, stats: dict, output: dict}
    """
    run_id = str(int(time.time()))
    run_dir = os.path.join(output_dir, f"movie_{run_id}")
    os.makedirs(run_dir, exist_ok=True)
    images_dir = os.path.join(run_dir, "images")
    audio_dir = os.path.join(run_dir, "audio")
    video_dir = os.path.join(run_dir, "video")
    if generate_images:
        os.makedirs(images_dir, exist_ok=True)
    if generate_audio:
        os.makedirs(audio_dir, exist_ok=True)
    if generate_video:
        os.makedirs(video_dir, exist_ok=True)

    yield {"type": "log", "message": f"Generating movie: {prompt[:80]}..."}

    # ── Phase 1: Script Generation ────────────────────────────────────
    yield {"type": "script_generating"}
    yield {"type": "log", "message": "Generating movie script via LLM..."}
    try:
        script_stats, movie_script = await generate_script(
            prompt, genre=genre, language=language,
            num_scenes=num_scenes, target_duration=target_duration,
        )
    except Exception as e:
        yield {"type": "error", "message": f"Script generation failed: {e}"}
        yield {"type": "complete", "error": str(e), "num_episodes": 0}
        return

    script_dict = script_to_dict(movie_script)
    yield {"type": "script_ready", "script": script_dict, "stats": script_stats}
    yield {"type": "log", "message": f"Script ready: '{movie_script.title}' ({len(movie_script.scenes)} scenes)"}

    scenes = movie_script.scenes
    total_scenes = len(scenes)
    audio_paths: dict[int, str] = {}
    image_paths: dict[int, str] = {}

    # ── Phase 2: Scene Images (optional) ──────────────────────────────
    if generate_images:
        yield {"type": "log", "message": "Generating scene images..."}
        for i, scene in enumerate(scenes):
            yield {"type": "scene_rendering", "scene_id": scene.scene_id, "total": total_scenes}
            yield {"type": "log", "message": f"Rendering scene {scene.scene_id}: {scene.title}"}

            try:
                # Generate a simple scene image using Pillow
                img_path = os.path.join(images_dir, f"scene_{scene.scene_id:03d}.png")
                await asyncio.to_thread(
                    _render_scene_image,
                    scene.description, scene.mood, scene.title, img_path,
                )
                image_paths[scene.scene_id] = img_path
                yield {"type": "scene_rendered", "scene_id": scene.scene_id, "image_path": img_path}
            except Exception as e:
                yield {"type": "log", "message": f"Scene {scene.scene_id} image failed: {e}"}

    # ── Phase 3: Audio Generation (optional) ──────────────────────────
    if generate_audio:
        yield {"type": "log", "message": "Generating narration audio..."}
        tts_engine = _get_tts_engine()

        for i, scene in enumerate(scenes):
            narration_text = scene.narration or scene.description
            if not narration_text:
                narration_text = f"Scene {scene.scene_id}: {scene.title}"
                continue

            yield {"type": "audio_rendering", "scene_id": scene.scene_id, "text": narration_text[:80]}
            try:
                audio_path = os.path.join(audio_dir, f"scene_{scene.scene_id:03d}.mp3")
                await asyncio.to_thread(
                    _generate_narration,
                    tts_engine, narration_text, audio_path, language,
                )
                audio_paths[scene.scene_id] = audio_path
                yield {"type": "audio_rendered", "scene_id": scene.scene_id, "audio_path": audio_path}
            except Exception as e:
                yield {"type": "log", "message": f"Audio for scene {scene.scene_id} failed: {e}"}

    # ── Phase 4: Video Assembly (optional) ────────────────────────────
    final_video_path = ""
    total_duration = 0.0

    if generate_video and image_paths:
        yield {"type": "video_assembling"}
        yield {"type": "log", "message": "Assembling video segments..."}

        try:
            segment_paths = []

            for scene in scenes:
                if scene.scene_id not in image_paths:
                    continue

                img_path = image_paths[scene.scene_id]
                seg_duration = scene.duration_seconds if scene.duration_seconds > 3 else 5.0
                audio_path = audio_paths.get(scene.scene_id)

                seg_path = await render_scene_segment(
                    scene.scene_id, img_path, seg_duration, video_dir,
                    audio_path=audio_path,
                )
                segment_paths.append(seg_path)
                total_duration += seg_duration

            if segment_paths:
                yield {"type": "log", "message": f"Assembling final movie from {len(segment_paths)} segments..."}

                # Merge all narration audio into one file (if we have per-scene audio but no segments with audio)
                merged_audio = None
                if audio_paths and not any(audio_paths.values()):
                    pass  # handled by render_scene_segment
                elif audio_paths:
                    # Build one combined narration track
                    merged_audio = os.path.join(audio_dir, "narration_combined.mp3")
                    await asyncio.to_thread(
                        _merge_audio_files,
                        [audio_paths[s.scene_id] for s in scenes if s.scene_id in audio_paths],
                        merged_audio,
                    )

                # Check for background music
                bgm_path = None
                if bgm_mood:
                    bgm_path = await asyncio.to_thread(
                        _find_or_generate_bgm, bgm_mood, audio_dir,
                    )

                final_video_path = os.path.join(video_dir, "final_movie.mp4")
                await assemble_movie(
                    segment_paths, final_video_path,
                    audio_path=merged_audio,
                    bgm_path=bgm_path,
                    bgm_volume=bgm_volume,
                )

                yield {"type": "log", "message": f"Movie assembled: {final_video_path}"}
        except Exception as e:
            yield {"type": "error", "message": f"Video assembly failed: {e}"}

    # ── Complete ──────────────────────────────────────────────────────
    # Generate a cover image if we have one
    cover_path = ""
    if image_paths:
        first_scene_id = scenes[0].scene_id if scenes else None
        if first_scene_id and first_scene_id in image_paths:
            cover_path = image_paths[first_scene_id]

    movie_output = MovieOutput(
        title=movie_script.title,
        video_path=final_video_path,
        duration_seconds=total_duration,
        total_scenes=total_scenes,
        output_dir=run_dir,
    )

    yield {
        "type": "complete",
        "title": movie_script.title,
        "video_path": final_video_path,
        "duration_seconds": total_duration,
        "total_scenes": total_scenes,
        "num_episodes": total_scenes,
        "cover_path": cover_path,
        "script": script_dict,
        "stats": {
            **script_stats,
            "num_scenes": total_scenes,
            "images_generated": len(image_paths),
            "audio_generated": len(audio_paths),
        },
        "output": {
            "title": movie_script.title,
            "video_path": final_video_path,
            "duration_seconds": total_duration,
            "total_scenes": total_scenes,
            "output_dir": run_dir,
        },
    }


# ── Helper: Render a scene image from description ─────────────────────

def _render_scene_image(
    description: str,
    mood: str,
    title: str,
    output_path: str,
) -> None:
    """Render a simple scene image from the description using Pillow."""
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        raise ImportError("Pillow required for scene image generation: pip install Pillow")

    # Create a 1920x1080 canvas in dark cinematic style
    img = Image.new("RGB", (1920, 1080), (20, 20, 30))
    draw = ImageDraw.Draw(img)

    # Background gradient impression
    for y in range(1080):
        # Dark blue-gray gradient
        r = max(10, 20 - y // 80)
        g = max(10, 20 - y // 80)
        b = max(25, 40 - y // 60)
        draw.line([(0, y), (1919, y)], fill=(r, g, b))

    # Title text
    try:
        font_large = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 48)
        font_small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 24)
    except Exception:
        font_large = ImageFont.load_default()
        font_small = ImageFont.load_default()

    # Scene title
    bbox = draw.textbbox((0, 0), title, font=font_large)
    tx = (1920 - (bbox[2] - bbox[0])) // 2
    ty = 80
    draw.text((tx, ty), title, fill=(220, 220, 240), font=font_large)

    # Mood indicator
    if mood:
        bbox = draw.textbbox((0, 0), f"Mood: {mood}", font=font_small)
        draw.text(
            (50, ty + 60),
            f"Mood: {mood}",
            fill=(180, 180, 200),
            font=font_small,
        )

    # Scene description (wrap to fit width)
    words = description.split()
    lines = []
    current_line = ""
    for word in words:
        test = current_line + " " + word if current_line else word
        bbox = draw.textbbox((0, 0), test, font=font_small)
        w = bbox[2] - bbox[0]
        if w > 1700 and current_line:
            lines.append(current_line)
            current_line = word
        else:
            current_line = test
    if current_line:
        lines.append(current_line)

    y_pos = ty + 120
    for line in lines[:15]:
        draw.text((80, y_pos), line, fill=(200, 200, 220), font=font_small)
        y_pos += 32

    # Bottom bar
    draw.rectangle([(0, 1040), (1919, 1080)], fill=(40, 40, 50))
    draw.text((30, 1045), f"AI-Generated Scene — {title}", fill=(150, 150, 170), font=font_small)

    img.save(output_path, "PNG")


# ── Helper: TTS audio generation ──────────────────────────────────────

def _get_tts_engine():
    """Lazy-load TTS engine from services/tts/."""
    try:
        from services.tts import TTSEngine
        return TTSEngine()
    except ImportError:
        return None


def _generate_narration(
    engine: Any,
    text: str,
    output_path: str,
    language: str = "en",
) -> None:
    """Generate TTS audio file for given text."""
    if engine is None:
        raise RuntimeError("TTS engine not available")

    if hasattr(engine, "generate"):
        engine.generate(text, output_path, lang=language)
    elif hasattr(engine, "synthesize"):
        engine.synthesize(text, output_path, language=language)
    else:
        raise RuntimeError("TTS engine has no generate/synthesize method")


def _merge_audio_files(
    audio_paths: list[str],
    output_path: str,
) -> None:
    """Concatenate multiple audio files into one."""
    if not audio_paths:
        raise ValueError("No audio files to merge")

    # Build concat list
    concat_file = tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False, dir="/tmp")
    for p in audio_paths:
        if os.path.exists(p):
            concat_file.write(f"file '{p}'\n")
    concat_file.close()

    try:
        _ffmpeg(
            "-f", "concat",
            "-safe", "0",
            "-i", concat_file.name,
            "-c", "copy",
            output_path,
        )
    finally:
        os.unlink(concat_file.name)


def _find_or_generate_bgm(mood: str, output_dir: str) -> str:
    """
    Try to find/fetch/generate background music.
    Falls back to a simple tone if no music gen available.
    Returns path to audio file or empty string.
    """
    bgm_path = os.path.join(output_dir, "bgm.mp3")

    try:
        from services.music import MusicGenerator
        gen = MusicGenerator()
        gen.generate(mood=mood, output_path=bgm_path, duration=30)
        if os.path.exists(bgm_path):
            return bgm_path
    except Exception:
        pass

    # Generate a simple ambient tone as fallback
    try:
        _generate_ambient_tone(bgm_path, mood)
        return bgm_path
    except Exception:
        pass

    return ""


def _generate_ambient_tone(output_path: str, mood: str) -> None:
    """Generate a simple ambient audio tone using ffmpeg."""
    # Map mood to frequency and waveform
    mood_freq = {
        "dark": (80, "sine"),
        "sad": (100, "triangle"),
        "calm": (200, "sine"),
        "peaceful": (180, "sine"),
        "happy": (260, "sine"),
        "upbeat": (320, "sine"),
        "epic": (150, "sine"),
        "dramatic": (120, "sine"),
        "mysterious": (90, "triangle"),
        "romantic": (220, "sine"),
        "tense": (70, "triangle"),
        "fun": (280, "sine"),
    }
    freq = 200
    for key, val in mood_freq.items():
        if key in mood.lower():
            freq = val[0]
            break

    _ffmpeg(
        "-f", "lavfi",
        "-i", f"sine=frequency={freq}:duration=30",
        "-af", "volume=0.3,aecho=0.8:0.7:40:0.5",
        "-ac", "2",
        "-ar", "44100",
        output_path,
    )
