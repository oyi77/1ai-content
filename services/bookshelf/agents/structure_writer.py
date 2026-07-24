"""Generate book structure / outline via Groq."""
import asyncio
import json
from typing import Optional

from services.bookshelf.openai_provider import get_groq_client
from services.bookshelf.stats import GenerationStatistics

SYSTEM_PROMPT = (
    "You are a helpful assistant that writes book outlines. "
    "Create a structured book outline with chapters and sections. "
    "Return ONLY valid JSON in the following format, with no markdown formatting or code blocks:\n"
    '{\n'
    '  "title": "Book Title Here",\n'
    '  "sections": [\n'
    '    {"title": "Chapter 1: Introduction", "sections": [{"title": "Section 1.1"}, {"title": "Section 1.2"}]},\n'
    '    {"title": "Chapter 2: Main Topic", "sections": [{"title": "Section 2.1"}, {"title": "Section 2.2"}]}\n'
    '  ]\n'
    "}\n"
    "Books contain 5-8 chapters by default, each with 2-4 sections. "
    "For long mode (300+ pages), use nested sections with deeper hierarchy."
)

MODEL = "auto/fast"
TEMPERATURE = 0.3
MAX_TOKENS = 8000


async def generate_structure(
    subject: str,
    *,
    additional_instructions: str = "",
    long_mode: bool = False,
    model: Optional[str] = None,
    groq_client=None,
) -> tuple[GenerationStatistics, str]:
    """Generate a book outline as a JSON string.

    Returns (stats, json_string).
    """
    client = groq_client or get_groq_client()

    user_prompt = (
        f"The subject of the book is:\n<subject>\n{subject}\n</subject>\n\n"
    )
    if additional_instructions:
        user_prompt += f"{additional_instructions}\n\n"
    user_prompt += "Generate a book outline."
    if long_mode:
        user_prompt += " This book should cover the topic in extreme depth with nested chapters and appendices."

    resp = await asyncio.to_thread(
        lambda: client.chat.completions.create(
            model=model or MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=TEMPERATURE,
            max_tokens=MAX_TOKENS,
            response_format={"type": "json_object"},
        )
    )

    raw = (resp.choices[0].message.content or "{}").strip()
    stats = GenerationStatistics(
        prompt_tokens=resp.usage.prompt_tokens if resp.usage else 0,
        completion_tokens=resp.usage.completion_tokens if resp.usage else 0,
        total_tokens=resp.usage.total_tokens if resp.usage else 0,
    )

    # Validate JSON
    try:
        json.loads(raw)
    except json.JSONDecodeError:
        raw = '{"title":"Untitled","sections":[]}'

    return stats, raw
