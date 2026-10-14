# Runbook: Rotate Secrets

**Secrets in play:** `JWT_SECRET`, `ADMIN_PASSWORD`, `BOT_TOKEN`, payment gateway keys/secrets, Redis/Postgres passwords, webhook secrets. CI flags anything committed by mistake via the Gitleaks job (`.gitleaks.toml`).

## 1. Generate the new value (where applicable)
```bash
openssl rand -hex 32
```
For provider-issued secrets (bot token, gateway keys), generate from the provider dashboard, not locally. Telegram bot token: @BotFather.

## 2. Update the source of truth
Edit `.env` (or the secrets store that feeds it). For Docker secrets, update `secrets/` files.

## 3. Propagate per secret
| Secret | Rotation impact |
|--------|-----------------|
| `JWT_SECRET` | Invalidates all existing user sessions (they re-login via Telegram auth). |
| `ADMIN_PASSWORD` | Invalidates admin tokens — recompute the HMAC used by `/health/*` callers and login cookies. |
| `BOT_TOKEN` | Set via @BotFather; old token stops working immediately. Update `.env`, restart. |
| Gateway keys | Update `payment_settings` / `.env`, then replay a test webhook; rotate in the gateway dashboard too. |
| `WEBHOOK_SECRET` | Re-register the Telegram webhook if it embeds the secret path. |
| DB/Redis passwords | Update both the service side and every client `.env`/connection string at once; restart app after. |

## 4. Restart + verify
```bash
sudo systemctl restart 1ai-content
curl -s http://127.0.0.1:3002/readyz
# log in as admin, run an end-to-end (generate image or check payment test flow)
```

## 5. If a secret was exposed (committed, logged)
1. Rotate it immediately (above).
2. Revoke the old value at the provider.
3. Check access logs for abuse in the exposure window (admin actions, payments, API keys used).
4. Add a Gitleaks allowlist entry only for genuine false positives — never for real secrets. Test placeholders are already allowlisted (`tests/`, `*.example`, CI placeholders).
