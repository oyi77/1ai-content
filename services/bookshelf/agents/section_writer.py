"""Generate section/chapter content via sync OpenAI client in thread.
Uses asyncio.to_thread with the sync client to avoid event-loop
incompatibilities with async httpx streaming. Returns (stats, content).
"""
from typing import Optional
import asyncio

from services.bookshelf.openai_provider import get_groq_client
from services.bookshelf.stats import GenerationStatistics

SYSTEM_PROMPT = (
    "Kamu adalah penulis novel dan cerita fiksi Indonesia yang berbakat. "
    "Tulis konten bab yang mendetail, menarik, dengan narasi yang hidup, dialog alami, "
    "dan alur cerita yang memikat. "
    "Gunakan format markdown untuk struktur (heading, daftar, blok kutipan jika sesuai). "
    "Setiap bab harus komprehensif (400-800 kata). "
    "Jika ada instruksi tambahan, pertimbangkan dengan sangat penting."
)
MODEL = "reka/reka-edge"
TEMPERATURE = 0.7
MAX_TOKENS = 6000



async def generate_section_content(
    section_title: str,
    *,
    additional_instructions: str = "",
    book_title: str = "",
    model: Optional[str] = None,
    groq_client=None,
) -> tuple[str, GenerationStatistics]:
    """Generate section content via sync OpenAI client in thread.

    Returns (stats, content). Uses asyncio.to_thread with the sync client
    to avoid event-loop incompatibilities with async httpx streaming.
    """
    client = groq_client or get_groq_client()

    # Build the user prompt
    user_parts = []
    if book_title:
        user_parts.append(f'Ini untuk buku: "{book_title}"')
    user_parts.append(f'Tulis konten untuk:\n<section_title>\n{section_title}\n</section_title>')
    if additional_instructions:
        user_parts.append(f"\nInstruksi Tambahan:\n{additional_instructions}")
    user_prompt = "\n\n".join(user_parts)

    model_id = model or MODEL

    def _generate():
        resp = client.chat.completions.create(
            model=model_id,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=TEMPERATURE,
            max_tokens=MAX_TOKENS,
        )
        return resp

    resp = await asyncio.to_thread(_generate)
    content = (resp.choices[0].message.content or "").strip()
    stats = GenerationStatistics(
        prompt_tokens=resp.usage.prompt_tokens if resp.usage else 0,
        completion_tokens=resp.usage.completion_tokens if resp.usage else 0,
        total_tokens=resp.usage.total_tokens if resp.usage else 0,
    )
    return stats, content