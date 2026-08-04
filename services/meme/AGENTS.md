# services/meme — Impact-style meme PNG renderer

**Purpose:** Render top/bottom-text memes as 800x600 PNGs using Pillow only.
Layout presets are pure geometry/colors (no image assets); an optional
`image_url` is fetched with httpx (10s timeout) and cover-fit pasted as the
base image, falling back to the template bg color on any failure.

**Engine API (`MemeEngine`, services/meme/engine.py):**
- `generate(template_id="default", top_text="", bottom_text="", image_url=None, output_dir=None) -> dict`
  Returns `{success: bool, image_path, template_id, width, height, image_url: bool}`.
  Unknown `template_id` falls back to `"default"`. Text is uppercased,
  word-wrapped, centered with black stroke; font size shrinks to fit.
  Default output: `tempfile.mkdtemp(prefix="meme_")`.

**HTTP endpoint:** `POST /meme/generate` (services/routers/meme.py, tag `meme`,
body `MemeRequest`: template_id, top_text, bottom_text, image_url, output_dir).

**Test command:** `cd services && python3 -m pytest tests/test_meme_api.py -q`

**Reuse anchors:** DI getter `get_meme()` (services/di.py, key `"meme"`);
router pattern from services/routers/faceless.py; test pattern from
services/tests/test_faceless_api.py.
