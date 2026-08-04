# services/infographic

## Purpose
Render labeled numeric data points (`{label, value}`) into a shareable
1200x1600 infographic PNG. Pure Pillow — no LLM, no network.

## Engine API
`InfographicEngine(font_path=DejaVuSans-Bold.ttf, output_base=None)`
- `generate(title, data_points, chart_kind="bar", theme="dark", output_dir=None) -> dict`
  - `data_points`: list of `{"label": str, "value": float}` (1..12; empty → RuntimeError)
  - `chart_kind`: `"bar"` (horizontal bars) | `"stat"` (big-number cards, 2 cols)
  - `theme`: `"dark"` (#0f1420) | `"light"` (#fafafa)
  - Returns `{"success": True, image_path, width, height, data_points: N, chart_kind, theme}`

## HTTP Endpoint (router services/routers/infographic.py)
- `POST /infographic/generate` — body `InfographicRequest` (title, data_points
  required; chart_kind/theme/output_dir optional). 500 wrapped on engine error.

## Test
`cd services && python3 -m pytest tests/test_infographic_api.py -q`

## Reuse Anchors
- DI getter `get_infographic()` (key `"infographic"`) in services/di.py.
- Router/tests mirror services/routers/faceless.py & tests/test_faceless_api.py.
- Font: `/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf` (verified).