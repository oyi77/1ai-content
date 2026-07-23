"""Generate section/chapter content via Groq (streaming)."""
from typing import AsyncGenerator, Optional

from services.bookshelf.groq_provider import get_async_groq_client
from services.bookshelf.stats import GenerationStatistics

SYSTEM_PROMPT = (
    "You are an expert author writing a non-fiction book. "
    "Write detailed, engaging chapter content with clear explanations, examples, and insights. "
    "Use markdown formatting for structure (headings, lists, code blocks where appropriate). "
    "Each section should be comprehensive (400-800 words). "
    "If additional instructions are provided, consider them very important."
)

MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"
TEMPERATURE = 0.3
MAX_TOKENS = 8000


async def generate_section_content(
    section_title: str,
    *,
    additional_instructions: str = "",
    book_title: str = "",
    model: Optional[str] = None,
    groq_client=None,
) -> AsyncGenerator[str, None]:
    """Stream section content token by token.

    Uses Groq AsyncGroq client for non-blocking streaming.
    Yields content text chunks and a final __STATS__ sentinel with token usage.
    """
    client = groq_client or get_async_groq_client()

    # Build the user prompt
    user_parts = []
    if book_title:
        user_parts.append(f'This is for the book: "{book_title}"')
    user_parts.append(f'Write the content for:\n<section_title>\n{section_title}\n</section_title>')
    if additional_instructions:
        user_parts.append(f"\nAdditional Instructions:\n{additional_instructions}")
    user_prompt = "\n\n".join(user_parts)

    stream = await client.chat.completions.create(
        model=model or MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        temperature=TEMPERATURE,
        max_tokens=MAX_TOKENS,
        stream=True,
        stream_options={"include_usage": True},
    )

    async for chunk in stream:
        if chunk.choices and chunk.choices[0].delta and chunk.choices[0].delta.content:
            yield chunk.choices[0].delta.content

        if chunk.usage:
            stats = GenerationStatistics(
                prompt_tokens=chunk.usage.prompt_tokens or 0,
                completion_tokens=chunk.usage.completion_tokens or 0,
                total_tokens=chunk.usage.total_tokens or 0,
            )
            yield f"\n__STATS__:{stats.__dict__}\n"
