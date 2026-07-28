<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-01 | Updated: 2026-04-01 -->

# monitoring

## Purpose
Observability stack configuration — Prometheus for metrics scraping and Grafana for dashboards. Used with `docker-compose.yml`.

## Key Files

| File | Description |
|------|-------------|
| `prometheus.yml` | Prometheus scrape targets and intervals |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `grafana/` | Grafana provisioning configs (see `grafana/AGENTS.md`) |

## For AI Agents

### Working In This Directory
- Configs are mounted into Docker containers via docker-compose
- Metrics are exposed by `src/services/metrics.service.ts`

<!-- MANUAL: -->
