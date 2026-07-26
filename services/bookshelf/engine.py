"""Bookshelf orchestration engine — chains agents to generate a complete book."""
import json
import os
from typing import AsyncGenerator, Optional
from openai import OpenAI

from services.bookshelf.openai_provider import get_groq_client
from services.bookshelf.agents.title_writer import generate_title
from services.bookshelf.agents.structure_writer import generate_structure
from services.bookshelf.agents.section_writer import generate_section_content
from services.bookshelf.tools.markdown import assemble_markdown
from services.bookshelf.stats import GenerationStatistics


LOCAL_MODEL_ID = "qwen3:4b"

async def generate_book_pipeline(
    subject: str,
    *,
    additional_instructions: str = "",
    language: str = "en",
    long_mode: bool = False,
    title_model: Optional[str] = None,
    structure_model: Optional[str] = None,
    section_model: Optional[str] = None,
    groq_client: Optional[OpenAI] = None,
) -> AsyncGenerator[dict, None]:
    """Full book generation pipeline: title → structure → sections.

    Yields progress dicts with keys:
      - type: "progress" | "section_content" | "complete" | "error"
      - payload: varies by type
      - stats: cumulative GenerationStatistics dict

    For "section_content" type: payload = {"title": str, "content": str}
    For "complete" type: payload = {"title": str, "structure": dict, "full_markdown": str}
    """
    if groq_client is not None:
        client = groq_client
    elif os.environ.get("BOOKSHELF_LOCAL_URL"):
        from services.bookshelf.openai_provider import get_local_client
        client = get_local_client()
        # llama-server requires exact gguf path as model name
        title_model = title_model or LOCAL_MODEL_ID
        structure_model = structure_model or LOCAL_MODEL_ID
        section_model = section_model or LOCAL_MODEL_ID
    else:
        client = get_groq_client()

    try:
        # --- Step 1: Generate title ---
        yield {"type": "progress", "phase": "title", "message": "Generating book title..."}

        cumulative_stats = GenerationStatistics()
        title_stats, title = await generate_title(
            subject, language=language, model=title_model, groq_client=client,
        )
        cumulative_stats += title_stats

        yield {
            "type": "progress",
            "phase": "title",
            "title": title,
            "stats": cumulative_stats.__dict__,
        }

        # --- Step 2: Generate structure ---
        yield {"type": "progress", "phase": "structure", "message": "Generating book outline..."}
        structure_stats, structure_json = await generate_structure(
            subject,
            additional_instructions=additional_instructions,
            language=language,
            long_mode=long_mode,
            model=structure_model,
            groq_client=client,
        )
        cumulative_stats += structure_stats

        try:
            structure = json.loads(structure_json)
        except json.JSONDecodeError:
            structure = {"title": title, "sections": []}
        # Clean title of wrapping quotes that some models add
        title = structure.get("title", title).strip('"\' ')

        yield {
            "type": "progress",
            "phase": "structure",
            "structure": structure,
            "stats": cumulative_stats.__dict__,
        }

        # --- Step 3: Generate sections ---
        flat_sections = _flatten_sections(structure)
        sections_content: dict[str, str] = {}

        for i, (chapter_title, section_title) in enumerate(flat_sections):
            yield {
                "type": "progress",
                "phase": "section",
                "message": f"Writing section {i + 1}/{len(flat_sections)}: {section_title}",
                "current": i + 1,
                "total": len(flat_sections),
                "stats": cumulative_stats.__dict__,
            }

            section_stats, content = await generate_section_content(
                section_title,
                additional_instructions=additional_instructions,
                language=language,
                book_title=title,
                model=section_model,
                groq_client=client,
            )
            sections_content[section_title] = content
            cumulative_stats += section_stats

            yield {
                "type": "section_content",
                "payload": {"title": section_title, "content": content},
                "stats": cumulative_stats.__dict__,
            }
        # --- Step 4: Assemble markdown ---
        full_md = assemble_markdown(title, structure, sections_content)

        yield {
            "type": "complete",
            "payload": {
                "title": title,
                "structure": structure,
                "full_markdown": full_md,
            },
            "stats": cumulative_stats.__dict__,
        }

    except Exception as e:
        yield {
            "type": "error",
            "message": str(e),
            "stats": cumulative_stats.__dict__,
        }


def _flatten_sections(structure: dict) -> list[tuple[str, str]]:
    """Flatten nested structure into (chapter_title, section_title) pairs."""
    flat: list[tuple[str, str]] = []
    for chapter in structure.get("sections", []):
        chapter_title = chapter.get("title", "Untitled Chapter")
        sub_sections = chapter.get("sections", [])
        if not sub_sections:
            flat.append((chapter_title, chapter_title))
        else:
            for section in sub_sections:
                section_title = section.get("title", "Untitled Section")
                flat.append((chapter_title, section_title))
    return flat
