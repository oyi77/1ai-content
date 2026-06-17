<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-03 | Updated: 2026-04-03 -->

# docker

## Purpose
Container runtime scripts. The entrypoint creates required directories, optionally loads `.env`, and starts the Streamlit server.

## Key Files

| File | Description |
|------|-------------|
| `entrypoint.sh` | Bash entrypoint: creates `/app/data` and `/app/projects`, sources `.env` if present, then exec's `streamlit run app/main.py` on port 8501 |

## For AI Agents

### Working In This Directory
- The container expects `/app/data` and `/app/projects` to be writable (created by entrypoint or bind-mounted)
- `.env` is optional — if absent the app falls back to `OMNIROUTE_BASE_URL` default (`http://localhost:20128/v1`)
- The top-level `Dockerfile` and `docker-compose.yml` reference this script

<!-- MANUAL: -->
