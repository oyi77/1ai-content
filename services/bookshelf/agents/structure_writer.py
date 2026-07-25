"""Generate book structure / outline via Groq."""
import re
import asyncio
import json
from typing import Optional

from services.bookshelf.language import get_language_instruction
from services.bookshelf.openai_provider import get_groq_client
from services.bookshelf.stats import GenerationStatistics
SYSTEM_PROMPT = (
    "You are a helpful assistant that writes book outlines. "
    "Create a structured book outline with chapters and sections. "
    "Return ONLY valid JSON in the following format, with no markdown formatting or code blocks:\n"
    '{\n'
    '  "title": "Book Title Here",\n'
    '  "sections": [\n'
    '    {"title": "Chapter 1: Introduction", "content": "Brief overview of the topic", "sections": [{"title": "Section 1.1", "content": "Key concepts explained"}, {"title": "Section 1.2", "content": "Practical applications"}]},\n'
    '    {"title": "Chapter 2: Main Topic", "content": "Deep dive into core subject", "sections": [{"title": "Section 2.1", "content": "Fundamental principles"}, {"title": "Section 2.2", "content": "Advanced techniques"}]}\n'
    '  ]\n'
    "}\n"
    "Books contain 2-3 chapters by default, each with 1-2 sections. "
    "For long mode (300+ pages), use 5-8 chapters each with 2-4 sections. "
    "Every section MUST have both \"title\" and \"content\" fields. "
    "Do NOT use colons inside title values — keep titles concise and put descriptions in the content field."
)
MODEL = "reka/reka-edge"
TEMPERATURE = 0.3
MAX_TOKENS = 8000

async def generate_structure(
    subject: str,
    *,
    additional_instructions: str = "",
    long_mode: bool = False,
    language: str = "en",
    model: Optional[str] = None,
    groq_client=None,
) -> tuple[GenerationStatistics, str]:
    """Generate a book outline as a JSON string.

    Returns (stats, json_string).
    """
    client = groq_client or get_groq_client()

    lang_instruction = get_language_instruction(language)
    system_content = f"{SYSTEM_PROMPT}\n\n{lang_instruction}"

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
                {"role": "system", "content": system_content},
                {"role": "user", "content": user_prompt},
            ],
            temperature=TEMPERATURE,
            max_tokens=MAX_TOKENS,
        )
    )

    raw = (resp.choices[0].message.content or "{}").strip()
    # Strip reasoning tags (handles any model that outputs them)
    raw = re.sub(r'\n*<reasoning>.*?</reasoning>\n*', '', raw, count=1, flags=re.DOTALL).strip()
    # Strip markdown bold (but NOT single asterisks inside JSON values)
    raw = re.sub(r'\*\*(.*?)\*\*', r'\1', raw).strip()
    stats = GenerationStatistics(
        prompt_tokens=resp.usage.prompt_tokens if resp.usage else 0,
        completion_tokens=resp.usage.completion_tokens if resp.usage else 0,
        total_tokens=resp.usage.total_tokens if resp.usage else 0,
    )

    # Robust JSON extraction — model may wrap JSON in prose or code blocks
    def _extract_json(text: str) -> dict:
        text = text.strip()
        # Remove markdown code fences
        text = re.sub(r'^```(?:json)?\s*', '', text, flags=re.MULTILINE)
        text = re.sub(r'\s*```$', '', text, flags=re.MULTILINE)
        # Find first { and last }
        start = text.find('{')
        end = text.rfind('}')
        if start != -1 and end != -1:
            text = text[start : end + 1]
        try:
            return json.loads(text)
        except json.JSONDecodeError as e:
            # Last resort: try to recover by cleaning control characters
            cleaned = re.sub(r'[\x00-\x1f\x7f]', '', text)
            try:
                return json.loads(cleaned)
            except json.JSONDecodeError:
                # Return minimal valid structure
                print(f"[WARN] Structure JSON parse failed: {e}")
                return {"title": "Untitled", "sections": []}

    parsed = _extract_json(raw)
    # Re-serialize to get clean JSON string
    raw = json.dumps(parsed, ensure_ascii=False)
    return stats, raw
