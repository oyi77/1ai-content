# services/interactive/

## Purpose
Pure-python branching-video manifest builder. Validates a choice graph of video nodes and
writes a deterministic `interactive/v1` manifest.json (no subprocess, no network, no media).

## Engine API (`services/interactive/engine.py`, class `InteractiveEngine`)
- `validate_graph(start_id, nodes) -> list[str]` — `nodes` = list of dicts
  `{id, text, choices: list[str], media?}`. Returns `[]` if valid, else error strings
  (duplicate ids, unknown start_id, dangling choice targets, unreachable nodes via BFS).
- `build(title, start_id, nodes, output_dir=None) -> dict` — validates; on errors returns
  `{"success": False, "errors": [...]}`. Else writes manifest.json into `output_dir` (or a
  fresh `/tmp/interactive_*` tempdir) and returns `{success: True, manifest_path, title,
  nodes: N, reachable: N}`.

## HTTP endpoint
- `POST /video/interactive` (services/routers/interactive.py, `interactive_router`, body
  `InteractiveRequest`) → delegates to `get_interactive().build(...)`. 500 wrap on exception.

## Test command
- `cd services && python3 -m pytest tests/test_interactive_api.py -q`

## Reuse anchors
- Model: `InteractiveNode` / `InteractiveRequest` in `services/api_models.py` (source of
  truth for fields). DI: `get_interactive()` in `services/di.py` (key `"interactive"`).
- Router/test patterns: `services/routers/faceless.py`, `services/tests/test_faceless_api.py`.
