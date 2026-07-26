"""
Script engine for movie/short-film generation.

Uses configurable LLM endpoint (Ollama default) to generate structured
movie scripts with scenes, shots, characters, and narration.
Mirrors comic_gen/script_engine.py pattern.
"""

import json
import os
import time
from typing import Optional

from services.movie_gen.movie_types import (
    Character, MovieGenre, MovieScript, Scene, Shot,
)

# ── Configuration (from env, matching comic_gen pattern) ──────────────
BASE_URL = os.environ.get("COMIC_BASE_URL", "http://localhost:11434/v1")
API_KEY = os.environ.get("COMIC_API_KEY", "ollama")
MODEL = os.environ.get("COMIC_MODEL", "qwen3:0.6b")
NUM_CTX = int(os.environ.get("COMIC_NUM_CTX", "4096"))


def _build_client():
    """Build an async OpenAI-compatible client (lazy import for test safety)."""
    from openai import AsyncOpenAI
    return AsyncOpenAI(base_url=BASE_URL, api_key=API_KEY)


SCRIPT_SYSTEM_PROMPT = """You are a professional screenwriter and director. Generate a complete short-film/movie script.

Output ONLY valid JSON with this exact structure:
{
  "title": "Movie title",
  "genre": "short_film",
  "language": "en",
  "logline": "One-sentence logline",
  "synopsis": "Brief synopsis",
  "characters": [
    {"name": "Name", "role": "protagonist/narrator/etc", "description": "Appearance & personality", "voice": ""}
  ],
  "scenes": [
    {
      "scene_id": 1,
      "title": "Scene title",
      "description": "Visual scene description with camera directions",
      "narration": "Voiceover narration text for this scene",
      "location": "Setting/location",
      "characters": ["CharacterName"],
      "shots": [
        {
          "shot_id": 1,
          "description": "Camera framing, action, composition",
          "narration": "Narration for this specific shot",
          "camera_movement": "static/pan/zoom/dolly",
          "duration_seconds": 3.0,
          "mood": "lighting/color mood",
          "sound_effect": ""
        }
      ],
      "mood": "",
      "bg_music_mood": "",
      "duration_seconds": 10.0
    }
  ],
  "style_notes": "Visual style and cinematography direction",
  "target_duration_seconds": 60.0
}

Constraints:
- Keep total scenes between 3-6 for a short film
- Each scene should have 1-3 shots
- Each shot's narration should be 1-3 sentences (spoken audio)
- Duration_seconds should be realistic: 3-15s per scene, 2-8s per shot
- Total target_duration_seconds should be 30-120 for short films
- Make descriptions vivid for image generation
- Narration text must be natural spoken English
- Include specific camera movements and visual details"""


def _clean_json(text: str) -> str:
    """Strip markdown fences and leading/trailing whitespace."""
    text = text.strip()
    if text.startswith("```"):
        # Strip opening fence (```json / ``` etc.)
        first_nl = text.find("\n")
        if first_nl != -1:
            text = text[first_nl:].strip()
        else:
            text = text[3:].strip()
    if text.endswith("```"):
        text = text[:-3].strip()
    return text


def _parse_script(raw: dict) -> MovieScript:
    """Parse raw LLM output dict into a MovieScript."""
    scenes = []
    for s in raw.get("scenes", []):
        shots = []
        for sh in s.get("shots", []):
            shots.append(Shot(
                shot_id=sh.get("shot_id", 1),
                description=sh.get("description", ""),
                narration=sh.get("narration", ""),
                camera_movement=sh.get("camera_movement", "static"),
                duration_seconds=float(sh.get("duration_seconds", 3.0)),
                mood=sh.get("mood", ""),
                sound_effect=sh.get("sound_effect", ""),
            ))
        scenes.append(Scene(
            scene_id=s.get("scene_id", 1),
            title=s.get("title", ""),
            description=s.get("description", ""),
            narration=s.get("narration", ""),
            location=s.get("location", ""),
            characters=s.get("characters", []),
            shots=shots,
            mood=s.get("mood", ""),
            bg_music_mood=s.get("bg_music_mood", ""),
            duration_seconds=float(s.get("duration_seconds", 10.0)),
        ))

    characters = []
    for c in raw.get("characters", []):
        characters.append(Character(
            name=c.get("name", ""),
            role=c.get("role", ""),
            description=c.get("description", ""),
            voice=c.get("voice", ""),
        ))

    return MovieScript(
        title=raw.get("title", "Untitled"),
        genre=MovieGenre(raw.get("genre", "short_film")),
        language=raw.get("language", "en"),
        logline=raw.get("logline", ""),
        synopsis=raw.get("synopsis", ""),
        characters=characters,
        scenes=scenes,
        style_notes=raw.get("style_notes", ""),
        target_duration_seconds=float(raw.get("target_duration_seconds", 60.0)),
    )


def script_to_dict(script: MovieScript) -> dict:
    """Convert MovieScript to a JSON-serializable dict."""
    return {
        "title": script.title,
        "genre": script.genre.value if hasattr(script.genre, "value") else script.genre,
        "language": script.language,
        "logline": script.logline,
        "synopsis": script.synopsis,
        "characters": [
            {"name": c.name, "role": c.role, "description": c.description, "voice": c.voice}
            for c in script.characters
        ],
        "scenes": [
            {
                "scene_id": s.scene_id,
                "title": s.title,
                "description": s.description,
                "narration": s.narration,
                "location": s.location,
                "characters": s.characters,
                "mood": s.mood,
                "bg_music_mood": s.bg_music_mood,
                "duration_seconds": s.duration_seconds,
                "shots": [
                    {
                        "shot_id": sh.shot_id,
                        "description": sh.description,
                        "narration": sh.narration,
                        "camera_movement": sh.camera_movement,
                        "duration_seconds": sh.duration_seconds,
                        "mood": sh.mood,
                        "sound_effect": sh.sound_effect,
                    }
                    for sh in s.shots
                ],
            }
            for s in script.scenes
        ],
        "style_notes": script.style_notes,
        "target_duration_seconds": script.target_duration_seconds,
    }


async def generate_script(
    prompt: str,
    *,
    genre: str = "short_film",
    language: str = "en",
    num_scenes: int = 4,
    target_duration: int = 60,
) -> tuple[dict, MovieScript]:
    """Generate a movie script via LLM."""
    client = _build_client()

    user_prompt = (
        f"Generate a {genre} in {language} for this concept:\n\n{prompt}\n\n"
        f"Target: {num_scenes} scenes, ~{target_duration} seconds total.\n"
        "Output ONLY valid JSON with no markdown formatting."
    )

    start = time.time()
    response = await client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": SCRIPT_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.7,
        max_tokens=4096,
        extra_body={"num_ctx": NUM_CTX} if BASE_URL != "https://api.openai.com/v1" else {},
    )
    elapsed = time.time() - start

    raw_text = response.choices[0].message.content or "{}"
    cleaned = _clean_json(raw_text)

    # Try standard JSON parse first
    try:
        raw_dict = json.loads(cleaned)
    except json.JSONDecodeError:
        # Fallback: try json_repair
        try:
            from json_repair import repair_json
            fixed = repair_json(cleaned)
            raw_dict = json.loads(fixed)
        except Exception:
            raise ValueError(f"Failed to parse script JSON. Raw output:\n{raw_text[:500]}")

    script = _parse_script(raw_dict)

    stats = {
        "model": MODEL,
        "elapsed_seconds": round(elapsed, 2),
        "prompt_tokens": response.usage.prompt_tokens if response.usage else 0,
        "completion_tokens": response.usage.completion_tokens if response.usage else 0,
        "num_scenes": len(script.scenes),
        "total_shots": sum(len(s.shots) for s in script.scenes),
    }

    return stats, script
