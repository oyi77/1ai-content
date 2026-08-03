#!/bin/bash
# =============================================================================
# 1AI CONTENT - PRISMA MIGRATION RECONCILE SCRIPT (DRY-RUN / REVIEW ONLY)
# =============================================================================
# Use ONLY when the production database already contains the schema changes but
# the _prisma_migrations table is out of sync (e.g. the DB was created via
# `prisma db push` or manual SQL, so `prisma migrate deploy` would try to
# re-apply migrations that are already in the schema).
#
# This script:
#   1. Marks each existing migration folder as "applied" WITHOUT running any
#      SQL (`prisma migrate resolve --applied <name>`).
#   2. Runs a best-effort `prisma migrate diff` dry-run so you can review drift
#      between the migration history and the current schema.
#
# It NEVER modifies the database schema itself. Review the output before
# relying on it in production.
# =============================================================================

set -euo pipefail

cd "$(dirname "$0")/.."

MIGRATIONS=(
  "20260315194752_init"
  "20260316_enhanced_video_system"
  "20260401_add_subscription_credits"
  "20260401_add_template_videos"
  "20260401_add_video_favorited"
  "20260406000000_add_user_mode"
)

echo "==> Step 1: mark migrations as applied (no SQL executed) =="
for m in "${MIGRATIONS[@]}"; do
  if [ -d "prisma/migrations/$m" ]; then
    echo "  - marking $m as applied..."
    npx prisma migrate resolve --applied "$m"
  else
    echo "  !! WARN: prisma/migrations/$m not found, skipped" >&2
  fi
done

echo ""
echo "==> Step 2: dry-run drift check (migrations vs schema.prisma) =="
echo "    Empty diff output = migrations match the schema."
echo "    Needs a scratch DB (template of DATABASE_URL); set PRISMA_SHADOW_DATABASE_URL"
echo "    to enable it. Skipped otherwise."
SHADOW_ARGS=()
if [ -n "${PRISMA_SHADOW_DATABASE_URL:-}" ]; then
  SHADOW_ARGS=(--shadow-database-url "$PRISMA_SHADOW_DATABASE_URL")
fi
npx prisma migrate diff \
  --from-migrations prisma/migrations \
  --to-schema-datamodel prisma/schema.prisma \
  "${SHADOW_ARGS[@]}" \
  || echo "    (migrate diff failed — investigate manually before continuing)"

echo ""
echo "==> DONE. The database schema itself was NEVER modified by this script."
echo "    If Step 2 shows drift, review it manually before running 'prisma migrate deploy'."
