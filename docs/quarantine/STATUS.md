# @berkahkarya_saas_bot — System Status

> Last updated: 2026-03-22 23:31 WIB by Vilona

---

## 🟢 Live Status

| Component | Status | Notes |
|-----------|--------|-------|
| **Bot Service** | 🟢 Running | systemd, PID via `/mnt/data/openclaw/projects/openclaw-saas-bot/` |
| **PostgreSQL** | 🟢 Connected | `localhost:5432/openclaw` |
| **Redis** | 🟢 Connected | `localhost:6379` |
| **HTTP Server** | 🟢 Listening | `localhost:3000` |
| **Webhook** | 🟢 Live | `https://api-saas.aitradepulse.com/webhook/telegram` |
| **Video Generation** | 🟢 Real Mode | `DEMO_MODE=false`, GeminiGen API key set |
| **Payment - Duitku** | 🟢 Production | Merchant D1821, aktif |
| **Payment - Midtrans** | 🔴 Disabled | Sandbox only — belum live |
| **Payment - Tripay** | 🔴 Disabled | Sandbox only — belum live |

---

## 📊 Real Metrics (per 2026-03-22)

| Metric | Value |
|--------|-------|
| Registered Users | 3 |
| Total Videos Generated | 10 |
| Videos Completed | 9 |
| Videos Processing | 1 |
| Total Transactions | 0 |
| Active Subscriptions | 0 |

---

## 🔧 Config

| Key | Value |
|-----|-------|
| `NODE_ENV` | production |
| `DEMO_MODE` | false |
| `GEMINIGEN_API_KEY` | ✅ Set |
| `DEFAULT_GATEWAY` | duitku |
| `DUITKU_ENVIRONMENT` | production |
| `MIDTRANS_ENVIRONMENT` | sandbox (disabled) |
| `TRIPAY_ENVIRONMENT` | sandbox (disabled) |
| `SUPER_ADMIN_IDS` | 228956686, 5220170786 |

---

## 👥 Registered Users

| ID | Telegram | Username | Balance | Tier |
|----|----------|----------|---------|------|
| 1 | 5220170786 | codergaboets | 0.00 kr | free |
| 2 | 157228659 | alwayscuanbos | 0.60 kr | free |
| 3 | 999999999 | testuser_imgref | 100.00 kr | pro |

---

## 🏗️ Architecture

```
User → Telegram → webhook POST → api-saas.aitradepulse.com
  → Cloudflare Tunnel → localhost:3000 (Fastify + Telegraf)
  → PostgreSQL + Redis + BullMQ
  → GeminiGen API (video) / Duitku (payment)
```

**Video Fallback Chain:**
`GeminiGen → BytePlus → XAI → LaoZhang → EvoLink → Hypereal → SiliconFlow → Fal.ai → Kie.ai`

---

## 📋 Service Files

| File | Path |
|------|------|
| Source | `/mnt/data/openclaw/projects/openclaw-saas-bot/` |
| systemd | `/etc/systemd/system/openclaw-saas-bot.service` |
| Logs | `journalctl -u openclaw-saas-bot -f` |
| DB | `postgresql://postgres:postgres@localhost:5432/openclaw` |

---

## ⚠️ Known Issues / Pending

- [x] Midtrans & Tripay: BLOCKED - butuh live keys production (belum diisi di .env)
- [x] Referral komisi tracking: tersambung penuh ke DB (fixed eligibility for new users)
- [x] Custom prompt dari user: sudah diimplementasikan (terintegrasi di create.ts)
- [x] Subscription auto-renewal: BLOCKED - requires user payment gateway config (diturunkan jadi manual renewal)
- [x] `NODE_ENV` sudah diubah ke `production`
- [x] P2P Credit Transfer: Implemented with 0.5% fee and tests passing.

---

## 🚨 Operations

```bash
# Status
systemctl status openclaw-saas-bot

# Restart
systemctl restart openclaw-saas-bot

# Logs live
journalctl -u openclaw-saas-bot -f

# Health check
curl http://localhost:3000/health

# DB access
psql "postgresql://postgres:postgres@localhost:5432/openclaw"
```
