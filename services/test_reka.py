"""Quick test: section streaming with reka/reka-flash-3 via OmniRoute."""
import asyncio
import json
import os
import sys

PROJ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJ)  # add project root so 'services' is importable

os.environ["OMNIROUTE_BASE_URL"] = "http://localhost:20128/v1"
os.environ["OMNIROUTE_API_KEY"] = "sk-a690d0287e21a9e0-5110fc-5d4ca9fc"

from services.bookshelf.agents.section_writer import generate_section_content


async def main():
    content_parts = []
    async for chunk in generate_section_content(
        "Introduction: What is AI-Powered Marketing",
        additional_instructions="Keep it brief, 2-3 paragraphs.",
        book_title="The AI Marketing Revolution",
        model="reka/reka-flash-3",
    ):
        if chunk.startswith("__STATS__:"):
            stats_str = chunk.replace("__STATS__:", "").strip()
            print(f"\n\n=== STATS ===\n{stats_str}")
        else:
            content_parts.append(chunk)
            print(chunk, end="", flush=True)

    full = "".join(content_parts)
    print(f"\n\n=== {len(full)} CHARS ===")
    print(full[:500])


if __name__ == "__main__":
    asyncio.run(main())