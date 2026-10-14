# Runbook: Failed Payment Callbacks

**Symptoms:** user paid but credits not granted; gateway webhook 5xx in logs; `payments`/`transactions` stuck `pending`; user support message.

## 1. Confirm the gateway's view
Check the gateway dashboard (Tripay / Duitku / NOWPayments — whichever is active in `payment_settings`) for the transaction ref: is it actually settled?

## 2. Trace locally
```bash
# Recent payment attempts
psql "$DATABASE_URL" -c "select id,status,amount,external_id,created_at from transactions order by created_at desc limit 20;"
psql "$DATABASE_URL" -c "select * from payments order by created_at desc limit 20;"
grep -i "webhook\|payment" /var/log/1ai-content.log | tail -50
```
Check whether the webhook arrived at all:
- **No webhook in logs** → gateway delivery problem or wrong callback URL. Verify the callback URL matches `WEBHOOK_URL` and the cf-router route (`:6969`).
- **Webhook arrived, signature failed** → secret mismatch; see [rotate-secrets.md](rotate-secrets.md). Replay after fixing.
- **Webhook arrived, handler errored** → DB/Redis was down at the time (see those runbooks). Safe to replay.

## 3. Replay safely (idempotency)
Webhook handlers must be idempotent (dedupe by external transaction id). To replay:
- Use the gateway's "resend webhook" button (preferred), or
- POST the stored payload to the callback endpoint with a valid signature.
Confirm the transaction flips to `success`/`completed` and credits are granted **once** (not double).

## 4. Manual grant (last resort, logged)
If the gateway is settled but replay is impossible, grant credits manually through the admin UI (it writes an audit entry). Never grant without an audit trail.

## 5. Cleanup
- Abandoned pending transactions (>2h) are auto-failed by the cleanup worker; expired gateway links are marked `expired`.
- If a `pending` row is actually paid, fix it before the cleanup worker flips it.
