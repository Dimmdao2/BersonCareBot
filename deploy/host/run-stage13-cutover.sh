#!/bin/bash
set -euo pipefail

PROJECT_ROOT=/opt/projects/bersoncarebot
API_ENV_FILE=/opt/env/bersoncarebot/api.prod
WEBAPP_ENV_FILE=/opt/env/bersoncarebot/webapp.prod

DRY_RUN_ONLY=0
if [ "${1:-}" = "--dry-run-only" ]; then
  DRY_RUN_ONLY=1
fi

timestamp() { date +"%Y-%m-%d %H:%M:%S"; }

fail() {
  echo "[$(timestamp)] stage13-cutover: $*" >&2
  exit 1
}

require_file() {
  local path="$1"
  local description="$2"
  if [ ! -f "${path}" ]; then
    fail "${description} not found: ${path}"
  fi
}

if mkdir -p /opt/backups/logs/bersoncarebot 2>/dev/null; then
  LOG_DIR=/opt/backups/logs/bersoncarebot
else
  LOG_DIR=/tmp/bersoncarebot-logs
  mkdir -p "${LOG_DIR}"
fi
LOG_FILE="${LOG_DIR}/stage13-cutover-$(date +%F_%H-%M-%S).log"
exec > >(tee -a "${LOG_FILE}") 2>&1

echo "[$(timestamp)] stage13-cutover started"
echo "[$(timestamp)] log file: ${LOG_FILE}"
echo "[$(timestamp)] mode: $([ "${DRY_RUN_ONLY}" -eq 1 ] && echo 'dry-run-only' || echo 'full-commit')"

require_file "${API_ENV_FILE}" "API env file"
require_file "${WEBAPP_ENV_FILE}" "Webapp env file"

cd "${PROJECT_ROOT}"

set -a
source "${API_ENV_FILE}"
set +a
API_DB_URL="${INTEGRATOR_DATABASE_URL:-${SOURCE_DATABASE_URL:-${DATABASE_URL:-}}}"

set -a
source "${WEBAPP_ENV_FILE}"
set +a
WEBAPP_DB_URL="${DATABASE_URL:-}"

if [ -z "${WEBAPP_DB_URL}" ]; then
  fail "DATABASE_URL (webapp) is empty after loading ${WEBAPP_ENV_FILE}"
fi
if [ -z "${API_DB_URL}" ]; then
  fail "INTEGRATOR_DATABASE_URL/SOURCE_DATABASE_URL/DATABASE_URL (integrator) is empty after loading ${API_ENV_FILE}"
fi

export DATABASE_URL="${WEBAPP_DB_URL}"
export INTEGRATOR_DATABASE_URL="${API_DB_URL}"

run_step() {
  local name="$1"
  shift
  echo ""
  echo "[$(timestamp)] >>> ${name}"
  "$@"
  echo "[$(timestamp)] <<< ${name} [OK]"
}

# Dry-run stage for visibility and early failure before writes.
run_step "backfill-person-domain --dry-run" pnpm --dir apps/webapp run backfill-person-domain -- --dry-run
run_step "backfill-communication-history --dry-run" pnpm --dir apps/webapp run backfill-communication-history -- --dry-run
run_step "backfill-reminders-domain --dry-run" pnpm --dir apps/webapp run backfill-reminders-domain -- --dry-run
run_step "backfill-appointments-domain --dry-run" pnpm --dir apps/webapp run backfill-appointments-domain -- --dry-run
run_step "backfill-subscription-mailing-domain --dry-run" pnpm --dir apps/webapp run backfill-subscription-mailing-domain -- --dry-run

if [ "${DRY_RUN_ONLY}" -eq 0 ]; then
  run_step "backfill-person-domain --commit" pnpm --dir apps/webapp run backfill-person-domain -- --commit
  run_step "backfill-communication-history --commit" pnpm --dir apps/webapp run backfill-communication-history -- --commit
  run_step "backfill-reminders-domain --commit" pnpm --dir apps/webapp run backfill-reminders-domain -- --commit
  run_step "backfill-appointments-domain --commit" pnpm --dir apps/webapp run backfill-appointments-domain -- --commit
  run_step "backfill-subscription-mailing-domain --commit" pnpm --dir apps/webapp run backfill-subscription-mailing-domain -- --commit
else
  echo "[$(timestamp)] skipping --commit stage (dry-run-only mode)"
fi

if [ "${DRY_RUN_ONLY}" -eq 0 ]; then
  run_step "reconcile-person-domain" pnpm --dir apps/webapp run reconcile-person-domain
  run_step "reconcile-communication-domain" pnpm --dir apps/webapp run reconcile-communication-domain
  run_step "reconcile-reminders-domain" pnpm --dir apps/webapp run reconcile-reminders-domain
  run_step "reconcile-appointments-domain" pnpm --dir apps/webapp run reconcile-appointments-domain
  run_step "reconcile-subscription-mailing-domain" pnpm --dir apps/webapp run reconcile-subscription-mailing-domain

  run_step "stage13-gate" pnpm run stage13-gate
else
  echo "[$(timestamp)] skipping reconcile + gate (dry-run-only mode)"
fi

echo ""
echo "[$(timestamp)] stage13-cutover completed successfully"
