#!/usr/bin/env bash
# Unified migrations entrypoint:
# - integrator SQL migrations
# - webapp Drizzle migrations
#
# On production host it auto-loads canonical env files when present:
#   /opt/env/bersoncarebot/api.prod
#   /opt/env/bersoncarebot/webapp.prod
#
# You can override paths:
#   API_ENV_FILE=/path/api.prod WEBAPP_ENV_FILE=/path/webapp.prod pnpm migrate

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}"

API_ENV_FILE="${API_ENV_FILE:-/opt/env/bersoncarebot/api.prod}"
WEBAPP_ENV_FILE="${WEBAPP_ENV_FILE:-/opt/env/bersoncarebot/webapp.prod}"

api_exists=0
webapp_exists=0
[[ -f "${API_ENV_FILE}" ]] && api_exists=1
[[ -f "${WEBAPP_ENV_FILE}" ]] && webapp_exists=1

if [[ "${api_exists}" -eq 1 || "${webapp_exists}" -eq 1 ]]; then
  if [[ "${api_exists}" -ne 1 || "${webapp_exists}" -ne 1 ]]; then
    echo "migrate-all: expected both env files or none. api=${API_ENV_FILE} webapp=${WEBAPP_ENV_FILE}" >&2
    exit 1
  fi
  set -a
  # shellcheck disable=SC1090
  source "${API_ENV_FILE}"
  # shellcheck disable=SC1090
  source "${WEBAPP_ENV_FILE}"
  set +a
fi

# --- Cross-app migration order (see taskdb #667) ---
# integrator SaaS migrations (>=20260708) depend on public org tables (org_enrollments,
# be_organizations, be_organization_members) created by webapp; webapp RLS (0169/0170) in turn
# depend on integrator org COLUMNS. The true order is a 3-phase interleave. The 20260707 I0
# pre-declare migration forward-declares the nullable integrator organization_id columns so
# webapp RLS can reference them before the real FK/index/backfill land in the 20260708 I1-I4.
# Do NOT collapse this back to two calls.
#
# Phase 1: integrator base + org-column pre-declare (<20260708), no webapp dep
INTEGRATOR_MIGRATIONS_BEFORE_DATE=20260708 pnpm --dir apps/integrator run migrate
# Phase 2: webapp ALL (creates public org tables; RLS finds pre-declared integrator org cols)
pnpm --dir apps/webapp run migrate
# Phase 3: integrator SaaS (>=20260708): FK + index + backfill from public org tables + NOT NULL
pnpm --dir apps/integrator run migrate
