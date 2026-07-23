"""Generate book title via Groq."""
import asyncio
from typing import Optional

from services.bookshelf.groq_provider import get_groq_client
from services.bookshelf.stats import GenerationStatistics

SYSTEM_PROMPT = (
    "You are a helpful assistant that writes book titles. "
    "You return only the title and nothing else. "
    "The title should be attractive to readers, between 7 and 25 words."
)

MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"
TEMPERATURE = 0.7
MAX_TOKENS = 100


async def generate_title(
    subject: str,
    *,
    model: Optional[str] = None,
    groq_client=None,
) -> tuple[GenerationStatistics, str]:
    """Generate a book title for the given subject.

    Returns (stats, title).
    """
    client = groq_client or get_groq_client()

    resp = await asyncio.to_thread(
        lambda: client.chat.completions.create(
            model=model or MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f"Generate a book title about: {subject}"},
            ],
            temperature=TEMPERATURE,
            max_tokens=MAX_TOKENS,
        )
    )

    title = (resp.choices[0].message.content or "").strip()
    stats = GenerationStatistics(
        prompt_tokens=resp.usage.prompt_tokens if resp.usage else 0,
        completion_tokens=resp.usage.completion_tokens if resp.usage else 0,
        total_tokens=resp.usage.total_tokens if resp.usage else 0,
    )

    return stats, title
