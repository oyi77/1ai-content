# Monitoring

This directory contains monitoring and observability configuration.

## 📁 Files

| File/Directory | Description |
|----------------|-------------|
| `prometheus.yml` | Prometheus configuration |
| `grafana/` | Grafana dashboards and datasources |

## 🔧 Components

### Prometheus

Prometheus collects metrics from the bot and stores them for querying.

**Port**: 9090

**Metrics Endpoint**: `/metrics`

### Grafana

Grafana visualizes metrics from Prometheus in dashboards.

**Port**: 3002 (default; container :3000)

> ⚠️ **Port collision**: the compose `grafana` service maps host `3002:3000`
> (`docker-compose.yml`), which collides with the bot running on host `:3002`
> (PM2 `1ai-content`, NODE_ENV=production). Before enabling the `monitoring`
> profile on a production host, change the map to a free port (e.g. `"3003:3000"`)
> for both `grafana` and this README.

**Default Login**: admin/admin

## 📊 Dashboards

| Dashboard | Description |
|-----------|-------------|
| `openclaw-bot.json` | Main bot metrics dashboard |

### Key Metrics

- Active Users
- Videos Generated
- Queue Depth
- Error Rate
- API Latency

## 🚀 Running Monitoring Stack

```bash
# Start with monitoring
docker-compose --profile monitoring up -d

# Access services
# Prometheus: http://localhost:9090
# Grafana: http://localhost:3002 (⚠️ collides with bot :3002 — see note above; use :3003 after fixing docker-compose.yml)
```

## 📝 Adding Custom Metrics

1. Add metric collection in code
2. Expose via `/metrics` endpoint
3. Add to Prometheus configuration
4. Create/update Grafana dashboard

---

*See [AGENTS.md](AGENTS.md) for monitoring setup documentation*
