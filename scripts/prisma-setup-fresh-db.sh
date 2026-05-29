#!/usr/bin/env bash
# v96p2 — One-time setup for a brand-new database (new Neon project,
# test environment, new operator's local Postgres). Quality audit
# flagged that the prisma-deploy.sh wrapper assumes the production DB
# has been baselined via `db push` for the ~95 versions before
# migrations existed; a fresh DB needs a slightly different path so
# the migration history starts from scratch.
#
# Run this exactly once per fresh database. After it succeeds, the
# regular Railway preDeployCommand (`bash scripts/prisma-deploy.sh`)
# takes over and handles every subsequent deploy.
#
# What it does:
#   * Pushes the schema to the empty DB so the tables exist (Prisma
#     would otherwise reject `migrate deploy` because no migrations
#     have been recorded against the empty `_prisma_migrations`).
#   * Marks the initial migration (0_init) as applied so future
#     `migrate deploy` calls see a baselined history.
#
# Required env:
#   DATABASE_URL — connection string to the empty Postgres DB.

set -e

cd "$(dirname "$0")/.." || exit 1

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[prisma-setup] DATABASE_URL is not set. Aborting." >&2
  exit 1
fi

echo "[prisma-setup] target: ${DATABASE_URL%@*}@<redacted>"
echo "[prisma-setup] step 1: pushing schema to the empty DB..."
npx prisma db push \
  --skip-generate \
  --schema packages/db/prisma/schema.prisma

echo "[prisma-setup] step 2: marking 0_init as applied..."
npx prisma migrate resolve \
  --applied 0_init \
  --schema packages/db/prisma/schema.prisma

echo "[prisma-setup] done. Future deploys can use scripts/prisma-deploy.sh."
