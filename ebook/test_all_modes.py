#!/usr/bin/env python3
"""Live end-to-end test: generates a minimal ebook for every product mode."""

import sqlite3
import sys
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from src.db.schema import create_tables
from src.pipeline.orchestrator import PipelineOrchestrator

DB_PATH = "data/test_all_modes.db"
PROJECTS_DIR = "projects_test"

conn = sqlite3.connect(DB_PATH)
create_tables(conn)
conn.close()

MODES = [
    ("lead_magnet", "How to build an email list fast", 1),
    ("paid_ebook", "Mastering personal finance in your 30s", 1),
    ("bonus_content", "Advanced tips for our premium users", 1),
    ("authority", "Why I became the go-to expert in my niche", 1),
    ("novel", "A lone detective hunts a shapeshifter", 1),
    ("short_story", "A time traveler stuck in 1920s Paris", 1),
    ("memoir", "Growing up between two cultures", 1),
    ("how_to_guide", "How to set up a home server in one day", 1),
    ("textbook", "Introduction to machine learning concepts", 1),
    ("academic_paper", "The impact of social media on teen mental health", 1),
    ("manga", "A student discovers she can rewind time", 1),
    ("manhwa", "Office worker reincarnated as a slime", 1),
    ("manhua", "The last cultivator in a modern city", 1),
    ("comics", "A retired superhero pulled back in for one last job", 1),
]

results = []

for mode, idea, chapters in MODES:
    print(f"\n{'='*60}")
    print(f"MODE: {mode} | chapters={chapters}")
    print(f"IDEA: {idea}")
    print("=" * 60)

    try:
        conn = sqlite3.connect(DB_PATH)
        conn.execute(
            "INSERT INTO projects (title, idea, product_mode, target_language, chapter_count, status) VALUES (?,?,?,?,?,?)",
            (idea[:50], idea, mode, "en", chapters, "draft"),
        )
        conn.commit()
        project_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        conn.close()

        orchestrator = PipelineOrchestrator(db_path=DB_PATH, projects_dir=PROJECTS_DIR)

        def on_progress(pct, msg):
            print(f"  [{pct:3d}%] {msg}")

        result = orchestrator.run_full_pipeline(project_id, on_progress=on_progress)
        results.append((mode, "✅ PASS", str(result.get("exports", {}))[:80]))
        print(f"  RESULT: {result.get('exports', {})}")

    except Exception as e:
        tb = traceback.format_exc()
        results.append((mode, "❌ FAIL", str(e)[:120]))
        print(f"  ERROR: {e}")
        print(tb[-500:])

print("\n\n" + "=" * 60)
print("SUMMARY")
print("=" * 60)
for mode, status, detail in results:
    print(f"{status}  {mode:<20}  {detail}")

passed = sum(1 for _, s, _ in results if "PASS" in s)
print(f"\n{passed}/{len(MODES)} modes passed")
