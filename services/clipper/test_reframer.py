#!/usr/bin/env python3
"""Functional tests for services/clipper/reframer.py using a synthetic test video."""

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from services.clipper.reframer import Reframer
TEST_FFMPEG = "/usr/bin/ffmpeg"  # system ffmpeg has subtitles+drawtext filters
TESTDIR = tempfile.mkdtemp(prefix="reframer_test_")
print(f"Test dir: {TESTDIR}")


def _make_test_video(path: str, duration: int = 10, w: int = 1920, h: int = 1080):
    """Generate a synthetic 16:9 test video with color bars and timestamp."""
    subprocess.run(
        [
            TEST_FFMPEG, "-y",
            "-f", "lavfi", "-i",
            f"testsrc=duration={duration}:size={w}x{h}:rate=30",
            "-f", "lavfi", "-i",
            f"sine=frequency=440:duration={duration}",
            "-c:v", "libx264", "-crf", "28", "-preset", "ultrafast",
            "-c:a", "aac", "-b:a", "64k",
            "-pix_fmt", "yuv420p",
            "-shortest",
            path,
        ],
        capture_output=True, text=True, check=True,
    )
    return path


# ── Setup ──────────────────────────────────────────────────

print("Creating test video...")
src = _make_test_video(os.path.join(TESTDIR, "src.mp4"), duration=10)

r = Reframer(ffmpeg_path=TEST_FFMPEG)
ok = 0
fail = 0


def _assert(condition, label):
    global ok, fail
    if condition:
        ok += 1
        print(f"  ✓ {label}")
    else:
        fail += 1
        print(f"  ✗ {label}")


# ── Test 1: extract_clip ──────────────────────────────────

print("\n[Test 1] extract_clip")
clip = os.path.join(TESTDIR, "clip.mp4")
r.extract_clip(src, 2.0, 5.0, clip)
assert os.path.exists(clip), "clip output missing"
# Verify duration ~3s
result = subprocess.run(
    ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
     "-of", "csv=p=0", clip],
    capture_output=True, text=True,
)
dur = float(result.stdout.strip())
_assert(2.8 < dur < 3.2, f"clip duration ≈3s (got {dur:.2f}s)")
ok_before = ok


# ── Test 2: reframe_to_vertical ───────────────────────────

print("\n[Test 2] reframe_to_vertical")
vvid = os.path.join(TESTDIR, "vertical.mp4")
r.reframe_to_vertical(src, vvid)
assert os.path.exists(vvid), "vertical output missing"
result = subprocess.run(
    ["ffprobe", "-v", "quiet", "-show_entries", "stream=width,height",
     "-select_streams", "v:0", "-of", "csv=p=0", vvid],
    capture_output=True, text=True,
)
parts = result.stdout.strip().split(",")
w, h = int(parts[0]), int(parts[1])
# 1920x1080 source → crop to 9:16 → 607x1080 (1080*9/16=607.5, truncated)
_assert(w < 700 and h == 1080, f"vertical dims {w}x{h} (expect ~607x1080)")
ok_before = ok


# ── Test 3: reframe_to_vertical_with_face ──────────────────

print("\n[Test 3] reframe_to_vertical_with_face")
face_vid = os.path.join(TESTDIR, "face_vertical.mp4")
r.reframe_to_vertical_with_face(src, face_vid)
assert os.path.exists(face_vid), "face crop output missing"
ok_before = ok


# ── Test 4: generate_karaoke_subtitles ────────────────────

print("\n[Test 4] generate_karaoke_subtitles")
segments = [
    {
        "start": 1.0,
        "end": 4.0,
        "words": [
            {"start": 1.0, "end": 1.5, "word": "Hello"},
            {"start": 1.5, "end": 2.2, "word": "world"},
            {"start": 2.2, "end": 3.0, "word": "this"},
            {"start": 3.0, "end": 4.0, "word": "rocks"},
        ],
    },
    {
        "start": 5.0,
        "end": 8.0,
        "words": [
            {"start": 5.0, "end": 6.0, "word": "Second"},
            {"start": 6.0, "end": 7.0, "word": "line"},
            {"start": 7.0, "end": 8.0, "word": "here"},
        ],
    },
]

for style in ("default", "hormozi", "tiktok"):
    ass_path = os.path.join(TESTDIR, f"subs_{style}.ass")
    r.generate_karaoke_subtitles(segments, ass_path, style=style)
    assert os.path.exists(ass_path), f"{style} ASS missing"

    content = open(ass_path).read()
    _assert("[V4+ Styles]" in content, f"{style}: has V4+ Styles header")
    _assert("\\k" in content, f"{style}: contains \\k karaoke tags")
    _assert("Hello" in content, f"{style}: contains word 'Hello'")
    _assert("Second" in content, f"{style}: contains word 'Second'")
    _assert("[Events]" in content, f"{style}: has Events section")

    # Count dialogue lines
    dialogue_count = content.count("Dialogue:")
    _assert(dialogue_count == 2, f"{style}: 2 dialogue events ({dialogue_count})")
    print()


# ── Test 5: burn_subtitles ────────────────────────────────

print("\n[Test 5] burn_subtitles")
burned = os.path.join(TESTDIR, "burned.mp4")
ass_file = os.path.join(TESTDIR, "subs_default.ass")
r.burn_subtitles(src, ass_file, burned)
assert os.path.exists(burned), "burned output missing"
# Burned video should be similar duration
result = subprocess.run(
    ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
     "-of", "csv=p=0", burned],
    capture_output=True, text=True,
)
dur = float(result.stdout.strip())
_assert(9.0 < dur < 11.0, f"burned video duration ≈10s (got {dur:.2f}s)")
ok_before = ok


# ── Test 6: generate_thumbnail ────────────────────────────

print("\n[Test 6] generate_thumbnail")
thumb = os.path.join(TESTDIR, "thumb.jpg")
r.generate_thumbnail(src, 3.0, thumb)
assert os.path.exists(thumb), "thumbnail output missing"
sz = os.path.getsize(thumb)
_assert(sz > 1000, f"thumbnail has content ({sz} bytes)")

thumb_titled = os.path.join(TESTDIR, "thumb_titled.jpg")
r.generate_thumbnail(src, 3.0, thumb_titled, title="My Title Here")
assert os.path.exists(thumb_titled), "titled thumbnail missing"
sz2 = os.path.getsize(thumb_titled)
_assert(sz2 > 1000, f"titled thumbnail has content ({sz2} bytes)")
ok_before = ok


# ── Test 7: error cases ───────────────────────────────────

print("\n[Test 7] error cases")
try:
    Reframer("/nonexistent/ffmpeg")
    _assert(False, "should raise for missing ffmpeg")
except RuntimeError:
    _assert(True, "raises RuntimeError for missing ffmpeg")

try:
    r._get_style_preset("nonexistent")
    _assert(False, "should raise for bad preset")
except ValueError:
    _assert(True, "raises ValueError for unknown preset")


# ── Summary ───────────────────────────────────────────────

print(f"\n{'='*50}")
print(f"Results: {ok} passed, {fail} failed")
if fail:
    sys.exit(1)
else:
    print("All tests passed ✓")
