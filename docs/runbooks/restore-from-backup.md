# Runbook: Restore from Backup

**When:** data loss, corrupt migration, catastrophic outage. Restore is destructive — get owner sign-off first.

## 1. Stop writers
```bash
sudo systemctl stop 1ai-content          # app (bot + API + workers)
# stop anything else writing to this DB (cron jobs, scripts)
```
Do not leave the bot running against a DB you're about to replace.

## 2. Locate the backup
```bash
ls -lah ~/projects/1ai-content/backups/    # or the configured backup target
# Backup script: scripts/backup.sh  (npm run backup)
```
Pick the newest backup taken **before** the incident. Verify it's readable and non-trivial in size.

## 3. Restore
```bash
# From a pg_dump custom-format backup:
pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" backups/<file>.dump
# From a plain SQL dump:
psql "$DATABASE_URL" < backups/<file>.sql
```
`--clean --if-exists` drops existing objects first — confirm you're pointing at the right DB.

## 4. Migrations
After restore, align Prisma's view with the schema:
```bash
npx prisma migrate status
npx prisma migrate deploy     # apply any migrations newer than the backup
```

## 5. Restart + verify
```bash
sudo systemctl start 1ai-content
curl -s http://127.0.0.1:3002/readyz     # 200
curl -s "http://127.0.0.1:3002/health/db" -H "Authorization: Bearer $TOKEN"
```
- Spot-check recent users/transactions exist.
- `/health/jobs` — resolve jobs that were mid-flight when the outage started.
- Reconcile payments made between the backup timestamp and now (see [failed-payment-callbacks.md](failed-payment-callbacks.md)).

## 6. Post-mortem
Record: data window lost, why the backup was the right point, and whether backup frequency should increase.
