<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-03 | Updated: 2026-04-03 -->

# src/cover

## Purpose
Ebook cover generation. Calls the AI to produce a visual description prompt, then renders a simple cover PNG (1200×1600) using Pillow with a product-mode-keyed background colour and centred title text.

## Key Files

| File | Description |
|------|-------------|
| `cover_generator.py` | `CoverGenerator` — `generate()` produces `cover/prompt.txt`, `cover/brief.json`, and `cover/cover.png` under `projects/{project_id}/` |

## For AI Agents

### Working In This Directory
- `generate_prompt()` is public and can be called independently to get a text description without rendering
- The rendered image is a placeholder — it uses Pillow only, not a generative image model
- Font path is hardcoded to DejaVu on Linux (`/usr/share/fonts/truetype/dejavu/`); falls back to Pillow's default font silently
- Background colours by `product_mode`: lead_magnet=blue(59,130,246), paid_ebook=dark-blue(30,64,175), bonus_content=green(34,197,94), authority=purple(107,33,168)

### Testing Requirements
- Mock `OmnirouteClient` to avoid real AI calls
- Use `temp_project_dir` to isolate file output
- Assert `cover/cover.png` exists and is a valid image after `generate()`

## Dependencies

### Internal
- `src/ai_client.OmnirouteClient`

### External
- `Pillow>=10` — `Image`, `ImageDraw`, `ImageFont`

<!-- MANUAL: -->
