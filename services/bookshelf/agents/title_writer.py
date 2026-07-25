"""Generate book title via Groq."""
import re
import asyncio
from typing import Optional

from services.bookshelf.language import get_language_instruction
from services.bookshelf.openai_provider import get_groq_client
from services.bookshelf.stats import GenerationStatistics
SYSTEM_PROMPT = (
    "You are a helpful assistant that writes book titles. "
    "You return only the title and nothing else. "
    "The title should be attractive to readers, between 7 and 25 words."
)
MODEL = "reka/reka-edge"
TEMPERATURE = 0.7
MAX_TOKENS = 100


async def generate_title(
    subject: str,
    *,
    language: str = "en",
    model: Optional[str] = None,
    groq_client=None,
) -> tuple[GenerationStatistics, str]:
    """Generate a book title for the given subject.

    Returns (stats, title).
    """
    client = groq_client or get_groq_client()

    lang_instruction = get_language_instruction(language)
    system_content = f"{SYSTEM_PROMPT}\n\n{lang_instruction}"

    resp = await asyncio.to_thread(
        lambda: client.chat.completions.create(
            model=model or MODEL,
            messages=[
                {"role": "system", "content": system_content},
                {"role": "user", "content": f"Generate a book title about: {subject}"},
            ],
            temperature=TEMPERATURE,
            max_tokens=MAX_TOKENS,
        )
    )

    title = (resp.choices[0].message.content or "").strip()
    title = re.sub(r'\n*<reasoning>.*?</reasoning>\n*', '', title, count=1, flags=re.DOTALL).strip()
    title = re.sub(r'\*+', '', title).strip()
    stats = GenerationStatistics(
        prompt_tokens=resp.usage.prompt_tokens if resp.usage else 0,
        completion_tokens=resp.usage.completion_tokens if resp.usage else 0,
        total_tokens=resp.usage.total_tokens if resp.usage else 0,
    )

    return stats, title
