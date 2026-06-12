#!/usr/bin/env bash
# Provision constituencies + mandals on a database (e.g. PRODUCTION) that only
# has districts seeded. Fixes /[district]/[constituency] 404s (e.g.
# /kurnool/pattikonda).
#
# Uses the idempotent, NON-DESTRUCTIVE seeder (scripts/seed-constituencies.ts +
# scripts/seed-mandals.ts): it upserts the 55 ACs with the clean slugs the
# routes expect, adopts existing rows, and never deletes anything. A pg_dump
# backup is still taken first as a hard rollback.
#
# RUN ON THE SERVER (where the prod DB is reachable), from the repo root:
#   bash infra/provision-constituencies.sh
#
# Requires: postgresql-client (pg_dump/psql), bun, and packages/db/.env
# pointing at the target (prod) database.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT/packages/db"

if [[ -f .env ]]; then
  # shellcheck disable=SC1091
  set -a; source .env; set +a
fi
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is not set (packages/db/.env)." >&2
  exit 1
fi
DB_DISPLAY="$(echo "$DATABASE_URL" | sed -E 's#://([^:]+):[^@]*@#://\1:****@#')"

echo "=================================================================="
echo " Provision constituencies + mandals"
echo " Target DB : $DB_DISPLAY"
echo "=================================================================="

# 0) Read-only diagnostic - what does the target look like RIGHT NOW? --------
echo "==> Current state (read-only):"
psql "$DATABASE_URL" -c "SELECT (SELECT count(*) FROM districts) AS districts, (SELECT count(*) FROM constituencies) AS constituencies, (SELECT count(*) FROM mandals) AS mandals;"
psql "$DATABASE_URL" -c "SELECT slug FROM constituencies WHERE slug LIKE 'pattikonda%' OR \"nameEn\" = 'Pattikonda';"

echo
echo " This will: 1) back up the DB, 2) idempotently upsert the 55 ACs with"
echo " the clean slugs the routes expect. NOTHING is deleted. (Mandals are a"
echo " separate dataset and are NOT touched here.)"
echo
read -r -p "Type 'yes' to proceed against the DB above: " CONFIRM
if [[ "$CONFIRM" != "yes" ]]; then echo "Aborted."; exit 1; fi

# 1) Backup ------------------------------------------------------------------
TS="$(date +%Y%m%d-%H%M%S)"
BACKUP="$REPO_ROOT/constituency-migration-backup-$TS.sql"
echo
echo "==> Backing up to: $BACKUP"
pg_dump "$DATABASE_URL" > "$BACKUP"
echo "    Backup complete ($(du -h "$BACKUP" | cut -f1)). Restore with:"
echo "    psql \"\$DATABASE_URL\" < \"$BACKUP\""

# 2) Seed constituencies (idempotent, non-destructive) -----------------------
echo
echo "==> seed-constituencies.ts"
bunx tsx scripts/seed-constituencies.ts

# 3) Verify ------------------------------------------------------------------
echo
echo "==> Verifying..."
psql "$DATABASE_URL" -c "SELECT count(*) AS constituencies FROM constituencies;"
psql "$DATABASE_URL" -c "SELECT c.slug AS constituency, d.slug AS district FROM constituencies c JOIN districts d ON d.id = c.\"districtId\" WHERE c.slug = 'pattikonda';"

echo
echo "Done. A 'pattikonda / kurnool' row above means the constituency pages"
echo "now resolve. Backup kept at: $BACKUP"
