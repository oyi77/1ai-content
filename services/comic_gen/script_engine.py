"""
Script Engine — LLM-based comic/manga/manhwa script generation.

Generates structured scripts with characters, episodes, pages, panel
descriptions, dialogue, and narration for any comic format.
"""

import asyncio
import json
import os
import re
from typing import Optional

from json_repair import repair_json

from openai import OpenAI

from services.bookshelf.language import get_language_instruction
from services.comic_gen.comic_types import (
    ComicFormat, ComicScript, Character, Episode, Page, Panel,
    SpeechBubble, PanelShape,
)

# Default LLM config — override via env vars
COMIC_BASE_URL = os.environ.get("COMIC_BASE_URL", "http://localhost:11434/v1")
COMIC_API_KEY = os.environ.get("COMIC_API_KEY") or ""
COMIC_MODEL = os.environ.get("COMIC_MODEL", "qwen3:0.6b")
NUM_CTX = int(os.environ.get("COMIC_NUM_CTX", "4096"))
TEMPERATURE = 0.7
MAX_TOKENS = 8000

# ── Format-specific prompting ──────────────────────────────────────────

def _format_guide(fmt: ComicFormat) -> str:
    guides = {
        ComicFormat.COMIC: (
            "Format: Western comic book.\n"
            "  - Left-to-right reading order.\n"
            "  - Full color, dynamic panel layouts.\n"
            "  - 4-9 panels per page typical.\n"
            "  - Speech bubbles with tails, narration boxes.\n"
            "  - Bold outlines, action-oriented compositions.\n"
            "  - Standard page dimensions (~6.625×10.25 inches / ~636×984 px at 96dpi)."
        ),
        ComicFormat.MANGA: (
            "Format: Japanese manga (manga).\n"
            "  - Right-to-left reading order (pages flow ←).\n"
            "  - Black & white / grayscale art.\n"
            "  - 3-7 panels per page.\n"
            "  - Speed lines, screen tones, expressive faces.\n"
            "  - Speech bubbles with tails (right-aligned text for RTL).\n"
            "  - Page gutter on the left for binding.\n"
            "  - B5 tankobon size (~182×257 mm)."
        ),
        ComicFormat.MANHWA: (
            "Format: Korean webtoon (manhwa).\n"
            "  - Vertical scroll layout (infinite canvas).\n"
            "  - Full color, digital painting style.\n"
            "  - 1-3 panels per 'screen' (a page slice).\n"
            "  - Cinematic compositions, dramatic lighting.\n"
            "  - Text overlays (no speech bubble tails needed).\n"
            "  - Wide-screen aspect (~800×1280 px per screen).\n"
            "  - Designed for phone scrolling — each 'page' fits a mobile viewport."
        ),
    }
    return guides.get(fmt, guides[ComicFormat.COMIC])


def _build_generation_prompt(
    prompt: str,
    fmt: ComicFormat,
    language: str,
    num_episodes: int,
    pages_per_episode: int,
) -> str:
    lang_instruction = get_language_instruction(language)
    format_spec = _format_guide(fmt)

    return f"""You are a professional comic/manga/manhwa writer and storyboard artist.

{lang_instruction}

## Task
Create a complete comic script based on the following concept:

"{prompt}"

## Format
{format_spec}

Generate {num_episodes} episode(s) with approximately {pages_per_episode} pages each.

## Output format
Return ONLY valid JSON (no markdown, no code fences):

{{
  "title": "Story title",
  "synopsis": "One-paragraph story summary (2-3 sentences)",
  "style_notes": "Visual direction, art style, color palette, mood",
  "cover_description": "Detailed description of the cover image / splash page",
  "characters": [
    {{
      "name": "Character name",
      "role": "protagonist / antagonist / side / supporting",
      "appearance": "Detailed physical description (height, build, hair, eyes, distinguishing features, clothing style)",
      "personality": "Personality traits, speech mannerisms, quirks",
      "color_scheme": "Key colors associated with this character (for color formats)"
    }}
  ],
  "episodes": [
    {{
      "episode_number": 1,
      "title": "Episode title",
      "summary": "What happens in this episode",
      "pages": [
        {{
          "page_number": 1,
          "layout_type": "auto / splash / grid / staggered / webtoon",
          "panels": [
            {{
              "panel_id": 1,
              "shape": "wide / square / tall / full",
              "scene_description": "Detailed visual description of what to draw (characters, positions, background, camera angle, composition, lighting)",
              "narration": "Narration / caption text (empty string if none)",
              "character_positions": "Where each character is in the frame",
              "background": "Background / environment description",
              "action": "What's happening / movement / action",
              "mood": "Atmosphere / emotion / lighting mood",
              "dialogue": [
                {{
                  "speaker": "Character name (or 'NARRATOR' for narration)",
                  "text": "Exactly what the character says",
                  "position_hint": "auto / top / bottom / left / right"
                }}
              ]
            }}
          ]
        }}
      ]
    }}
  ]
}}

## Rules
1. Each page MUST have at least 1 panel and at most 12 panels.
2. For manga: {pages_per_episode} pages per episode, panels GOTO right-to-left.
3. Dialogue must feel natural and serve the story.
4. Scene descriptions must be vivid enough for an artist to draw from.
5. {format_spec}
"""


def _normalize_script_data(data: dict) -> dict:
    """Sanitize LLM output fields — contract is list-of-dicts for dialogue."""
    for ep in data.get("episodes") or []:
        for pg in ep.get("pages") or []:
            for pn in pg.get("panels") or []:
                raw = pn.get("dialogue")
                if isinstance(raw, dict):
                    pn["dialogue"] = [raw]
                elif isinstance(raw, str):
                    pn["dialogue"] = [{"speaker": "Narrator", "text": raw}]
                elif not isinstance(raw, list):
                    pn["dialogue"] = []
                for field in ("scene_description", "narration", "character_positions",
                             "background", "action", "mood"):
                    if not isinstance(pn.get(field), str):
                        pn[field] = str(pn[field]) if pn.get(field) else ""
    return data


def _clean_json(text: str) -> str:
    """Extract and clean the outermost JSON object from LLM output."""
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1] if "\n" in text else text[3:]
    fb = text.find("{")
    if fb >= 0:
        text = text[fb:]
    lb = text.rfind("}")
    if lb >= 0:
        text = text[:lb + 1]
    text = re.sub(r",\s*}", "}", text)
    text = re.sub(r",\s*]", "]", text)
    return text

def _parse_json(text: str) -> dict:
    """Parse JSON with automatic repair fallback."""
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    try:
        repaired = repair_json(text)
        return json.loads(repaired)
    except Exception:
        raise ValueError(f"JSON parse failed after repair. Last 200 chars: {text[-200:]!r}")


def _parse_script(raw: str, fmt: ComicFormat) -> ComicScript:
    cleaned = _clean_json(raw)
    data = _parse_json(cleaned)
    data = _normalize_script_data(data)

    def _get_text(d):
        t = d.get("text")
        if isinstance(t, list):
            return " ".join(str(x) for x in t if x)
        return str(t) if t else ""

    characters = [
        Character(
            name=c["name"],
            role=c.get("role", ""),
            appearance=c.get("appearance", ""),
            personality=c.get("personality", ""),
            color_scheme=c.get("color_scheme", ""),
        )
        for c in data.get("characters", [])
    ]

    episodes = []
    for ep_data in data.get("episodes", []):
        pages = []
        for pg_data in ep_data.get("pages", []):
            panels = []
            for pn_data in pg_data.get("panels", []):
                dialogue = [
                    SpeechBubble(
                        speaker=d.get("speaker", ""),
                        text=_get_text(d),
                        position_hint=d.get("position_hint", "auto"),
                    )
                    for d in pn_data.get("dialogue", [])
                ]
                try:
                    shape = PanelShape(pn_data.get("shape", "square"))
                except ValueError:
                    shape = PanelShape.SQUARE

                panels.append(Panel(
                    panel_id=pn_data.get("panel_id", 1),
                    shape=shape,
                    scene_description=pn_data.get("scene_description", ""),
                    narration=pn_data.get("narration", ""),
                    dialogue=dialogue,
                    character_positions=pn_data.get("character_positions", ""),
                    background=pn_data.get("background", ""),
                    action=pn_data.get("action", ""),
                    mood=pn_data.get("mood", ""),
                ))
            pages.append(Page(
                page_number=pg_data.get("page_number", 1),
                panels=panels,
                layout_type=pg_data.get("layout_type", "auto"),
            ))
        episodes.append(Episode(
            episode_number=ep_data.get("episode_number", 1),
            title=ep_data.get("title", ""),
            pages=pages,
            summary=ep_data.get("summary", ""),
        ))

    return ComicScript(
        title=data.get("title", "Untitled"),
        format=fmt,
        language="en",
        synopsis=data.get("synopsis", ""),
        characters=characters,
        episodes=episodes,
        style_notes=data.get("style_notes", ""),
        cover_description=data.get("cover_description", ""),
    )


async def generate_script(
    prompt: str,
    *,
    fmt: ComicFormat = ComicFormat.COMIC,
    language: str = "en",
    num_episodes: int = 1,
    pages_per_episode: int = 4,
    model: Optional[str] = None,
) -> tuple[dict, ComicScript]:
    """Generate a complete comic/manga/manhwa script via LLM.

    Args:
        prompt: Story concept / premise.
        fmt: Target format (COMIC, MANGA, MANHWA).
        language: Language code for content.
        num_episodes: How many episodes/chapters.
        pages_per_episode: Pages per episode.
        model: Override model ID (default: COMIC_MODEL env var or phi3:mini).

    Config env vars:
        COMIC_BASE_URL  — OpenAI-compatible endpoint (default: http://localhost:11434/v1).
        COMIC_API_KEY   — API key if needed (default: empty, fine for Ollama).
        COMIC_MODEL     — Model name (default: phi3:mini).

    Returns:
        (stats_json, ComicScript) where stats_json has token usage.
    """
    client = OpenAI(api_key=COMIC_API_KEY or "ollama", base_url=COMIC_BASE_URL)
    system_prompt = _build_generation_prompt(
        prompt, fmt, language, num_episodes, pages_per_episode,
    )

    extra = {"num_ctx": NUM_CTX}
    def _call():
        # Primary: text-based JSON prompting (works with most models)
        try:
            return client.chat.completions.create(
                model=model or COMIC_MODEL,
                messages=[
                    {"role": "system", "content": "You are a professional comic writer and storyboard artist. Generate complete, structured comic scripts in JSON format. Return ONLY valid JSON, no markdown."},
                    {"role": "user", "content": system_prompt},
                ],
                temperature=TEMPERATURE,
                max_tokens=MAX_TOKENS,
                extra_body=extra,
            )
        except Exception:
            # Fallback: use response_format for models that enforce JSON natively
            return client.chat.completions.create(
                model=model or COMIC_MODEL,
                messages=[
                    {"role": "system", "content": "You are a professional comic writer and storyboard artist. Generate complete, structured comic scripts in JSON format."},
                    {"role": "user", "content": system_prompt},
                ],
                temperature=TEMPERATURE,
                max_tokens=MAX_TOKENS,
                response_format={"type": "json_object"},
                extra_body=extra,
            )

    resp = await asyncio.to_thread(_call)
    raw = resp.choices[0].message.content or "{}"

    script = _parse_script(raw, fmt)
    script.language = language

    stats = {
        "prompt_tokens": resp.usage.prompt_tokens if resp.usage else 0,
        "completion_tokens": resp.usage.completion_tokens if resp.usage else 0,
        "total_tokens": resp.usage.total_tokens if resp.usage else 0,
    }

    return stats, script


def script_to_dict(script: ComicScript) -> dict:
    """Convert ComicScript to a JSON-serializable dict."""
    fmt = script.format.value if isinstance(script.format, ComicFormat) else script.format
    return {
        "title": script.title,
        "format": fmt,
        "style_notes": script.style_notes,
        "cover_description": script.cover_description,
        "characters": [
            {
                "name": c.name,
                "role": c.role,
                "appearance": c.appearance,
                "personality": c.personality,
                "color_scheme": c.color_scheme,
            }
            for c in script.characters
        ],
        "episodes": [
            {
                "episode_number": ep.episode_number,
                "title": ep.title,
                "summary": ep.summary,
                "pages": [
                    {
                        "page_number": pg.page_number,
                        "layout_type": pg.layout_type,
                        "panels": [
                            {
                                "panel_id": p.panel_id,
                                "shape": p.shape.value,
                                "scene_description": p.scene_description,
                                "narration": p.narration,
                                "character_positions": p.character_positions,
                                "background": p.background,
                                "action": p.action,
                                "mood": p.mood,
                                "dialogue": [
                                    {
                                        "speaker": d.speaker,
                                        "text": d.text,
                                        "position_hint": d.position_hint,
                                    }
                                    for d in p.dialogue
                                ],
                            }
                            for p in pg.panels
                        ],
                    }
                    for pg in ep.pages
                ],
            }
            for ep in script.episodes
        ],
    }
