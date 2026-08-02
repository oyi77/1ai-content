"""Quick test: section streaming with reka/reka-flash-3 via OmniRoute."""
import asyncio
import json
import os
import sys

PROJ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJ)  # add project root so 'services' is importable

os.environ["OMNIROUTE_BASE_URL"] = "http://localhost:20128/v1"
os.environ["OMNIROUTE_API_KEY"] = os.environ.get("OMNIROUTE_API_KEY", "")

from services.bookshelf.agents.section_writer import generate_section_content


async def main():
    stats, content = await generate_section_content(
        "Introduction: What is AI-Powered Marketing",
        additional_instructions="Keep it brief, 2-3 paragraphs.",
        book_title="The AI Marketing Revolution",
        model="reka/reka-flash-3",
    )
    print(f"\n\n=== STATS ===\n{stats.model_dump_json()}")
    print(content)
    print(f"\n\n=== {len(content)} CHARS ===")
    print(content[:500])


if __name__ == "__main__":
    asyncio.run(main())