#!/usr/bin/env bash
# Railway preDeployCommand wrapper — `prisma migrate deploy`, robust against
# BOTH a fresh empty database and a legacy db-push'd (un-migration-tracked) one.
#
# v100 (Prisma 7 cutover): two invariants —
#   1. Run from packages/db, NOT the repo root. In v7 the connection URL and
#      schema path live in prisma.config.ts (the schema's datasource block no
#      longer carries `url`). The config uses RELATIVE paths and the v7 CLI
#      auto-loads prisma.config.ts from the current directory — so prisma must
#      run from packages/db. We drop the `--schema` flag and let the config
#      supply both schema + datasource url.
#   2. Pin `prisma@7.8.0` via npx so the CLI version can't be a stale v6 binary
#      served from a build-cache layer.
#
# v101 (Neon -> Railway Postgres cutover): the migration target is now a FRESH
# Railway-managed Postgres, which is empty. The old script UNCONDITIONALLY ran
# `migrate resolve --applied 0_init` (a baseline for the legacy Neon DB that was
# db-push'd for ~95 versions before migrations existed). On an EMPTY DB that
# baseline is HARMFUL: it records 0_init as applied without creating any tables,
# so the later migrations ALTER tables that don't exist and the deploy dies.
#
# New strategy — try `migrate deploy` first:
#   * Fresh empty DB  -> 0_init + all migrations apply cleanly. Done.
#   * Legacy db-push DB (schema exists, no history) -> 0_init's CREATE TABLEs
#     collide with the existing objects (P3005 / "already exists" / P3009).
#     Detect that, baseline 0_init once, and re-run. From then on the DB is
#     fully migration-tracked and every future deploy is a clean first-try pass.

set -e

cd "$(dirname "$0")/.." || exit 1
cd packages/db || exit 1   # where prisma.config.ts + its relative paths resolve

PRISMA="npx -y prisma@7.8.0"

# migrate deploy acquires a Postgres advisory lock (10s timeout). Two deploys
# racing for it (e.g. a `railway up` quickly followed by a redeploy) can make one
# time out with P1002. Retry a few times on transient failure; migrate deploy is
# idempotent (already-applied migrations are skipped), so retrying is safe.
deploy_with_retry() {
  local attempt=1
  until $PRISMA migrate deploy; do
    if [ "$attempt" -ge 4 ]; then
      echo "[prisma-deploy] migrate deploy failed after $attempt attempts — aborting"
      return 1
    fi
    echo "[prisma-deploy] attempt $attempt failed (likely advisory-lock contention); retrying in $((attempt * 5))s..."
    sleep $((attempt * 5))
    attempt=$((attempt + 1))
  done
  return 0
}

echo "[prisma-deploy] applying pending migrations (first attempt)..."
out=$($PRISMA migrate deploy 2>&1) || true
echo "$out"

if echo "$out" | grep -qiE 'P3009'; then
  # P3009 = a prior deploy left a FAILED migration recorded in _prisma_migrations
  # (a dirty state). Prisma then refuses to apply anything further. The only clean
  # repair is a destructive reset (drop schema + _prisma_migrations, re-apply all).
  # That is DATA-DESTROYING, so it is gated behind an explicit one-shot env flag —
  # never automatic — to guarantee it can't silently wipe a populated production DB.
  if [ "${PRISMA_ALLOW_RESET:-0}" = "1" ]; then
    echo "[prisma-deploy] P3009 dirty state + PRISMA_ALLOW_RESET=1 — performing one-time destructive reset (expected to hold NO data)"
    # Prisma 7's `migrate reset` only takes --force (no --skip-seed; seeding is
    # configured in prisma.config.ts, and this project configures none).
    $PRISMA migrate reset --force
    echo "[prisma-deploy] reset complete — schema rebuilt from migrations"
  else
    echo "[prisma-deploy] P3009 dirty migration state but PRISMA_ALLOW_RESET is unset — refusing to auto-wipe; aborting"
    exit 1
  fi
elif echo "$out" | grep -qiE 'P3005|P3018|already exists'; then
  echo "[prisma-deploy] legacy non-migration-tracked schema detected — baselining 0_init then redeploying"
  $PRISMA migrate resolve --applied 0_init 2>&1 | grep -v 'already recorded' || true
  deploy_with_retry || exit 1
elif echo "$out" | grep -qiE 'Error|P1002|ECONN|timed out'; then
  echo "[prisma-deploy] first attempt hit a transient/non-schema error — retrying with backoff"
  deploy_with_retry || exit 1
else
  echo "[prisma-deploy] migrations applied cleanly on first attempt"
fi
