#!/usr/bin/env bash
# Unified migrations entrypoint:
# - integrator SQL migrations
# - webapp Drizzle migrations
#
# On production host it requires and loads the canonical env files:
#   /opt/env/bersoncarebot/api.prod
#   /opt/env/bersoncarebot/webapp.prod
#
# Existing env files are accepted only as the exact canonical PROD, TEST, or local DEV empty-env pair.
# Canonical PROD/TEST/explicit DEV always require both exact env files. No-env is selected only when both env-path
# variables are genuinely unset; explicit empty, missing, or noncanonical paths fail before DATABASE_URL is used.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATABASE_URL_GUARD="$REPO_ROOT/scripts/validate-migration-database-url.mjs"
readonly DATABASE_URL_GUARD
cd "${REPO_ROOT}"

is_canonical_prod_host() {
  local current_hostname address
  current_hostname="$(hostname -s 2>/dev/null || true)"
  [ "$current_hostname" = "adelaide" ] || return 1
  for address in $(hostname -I 2>/dev/null || true); do
    [ "$address" = "135.106.162.170" ] && return 0
  done
  return 1
}

has_local_ipv4() {
  local expected="$1" address
  for address in $(hostname -I 2>/dev/null || true); do
    [ "$address" = "$expected" ] && return 0
  done
  return 1
}

assert_database_url_target() {
  local url="$1" expected_database="$2"
  printf '%s' "$url" | node "$DATABASE_URL_GUARD" canonical "$expected_database"
}

assert_non_prod_database_url() {
  local url="$1"
  printf '%s' "$url" |
    SAAS_DISPOSABLE_ALLOWED_HOSTS="${SAAS_DISPOSABLE_ALLOWED_HOSTS:-}" \
      node "$DATABASE_URL_GUARD" no-env
}

PROD_API_ENV=/opt/env/bersoncarebot/api.prod
PROD_WEBAPP_ENV=/opt/env/bersoncarebot/webapp.prod
TEST_API_ENV=/opt/env/bersoncarebot/api.test
TEST_WEBAPP_ENV=/opt/env/bersoncarebot/webapp.test
SAFE_LOCAL_MIGRATION_ENV="$REPO_ROOT/deploy/env/empty.local-migration.env"
api_env_explicit=0
webapp_env_explicit=0
[[ ${API_ENV_FILE+x} ]] && api_env_explicit=1
[[ ${WEBAPP_ENV_FILE+x} ]] && webapp_env_explicit=1

if is_canonical_prod_host; then
  if [[ "$api_env_explicit" -eq 1 || "$webapp_env_explicit" -eq 1 ]]; then
    if [[ "$api_env_explicit" -ne 1 || "$webapp_env_explicit" -ne 1 ]]; then
      echo "migrate-all: explicit PROD env selection requires both API_ENV_FILE and WEBAPP_ENV_FILE" >&2
      exit 1
    fi
    if [[ "$API_ENV_FILE" != "$PROD_API_ENV" || "$WEBAPP_ENV_FILE" != "$PROD_WEBAPP_ENV" ]]; then
      echo "migrate-all: canonical PROD requires exact api.prod/webapp.prod paths" >&2
      exit 1
    fi
  else
    API_ENV_FILE="$PROD_API_ENV"
    WEBAPP_ENV_FILE="$PROD_WEBAPP_ENV"
  fi
  migration_target=prod
else
  if [[ "$api_env_explicit" -eq 1 || "$webapp_env_explicit" -eq 1 ]]; then
    if [[ "$api_env_explicit" -ne 1 || "$webapp_env_explicit" -ne 1 ]]; then
      echo "migrate-all: explicit env selection requires both API_ENV_FILE and WEBAPP_ENV_FILE" >&2
      exit 1
    fi
    case "${API_ENV_FILE}|${WEBAPP_ENV_FILE}" in
      "${TEST_API_ENV}|${TEST_WEBAPP_ENV}")
        has_local_ipv4 151.241.228.122 || {
          echo "migrate-all: canonical TEST env is allowed only on local IPv4 151.241.228.122" >&2
          exit 1
        }
        migration_target=test
        ;;
      "${SAFE_LOCAL_MIGRATION_ENV}|${SAFE_LOCAL_MIGRATION_ENV}")
        has_local_ipv4 151.241.228.122 || {
          echo "migrate-all: local DEV migration env is allowed only on the DEV/TEST host" >&2
          exit 1
        }
        migration_target=dev
        ;;
      *)
        echo "migrate-all: explicit env paths must be the exact canonical TEST or DEV pair" >&2
        exit 1
        ;;
    esac
  else
    API_ENV_FILE=
    WEBAPP_ENV_FILE=
    migration_target=no-env
  fi
fi
readonly migration_target

api_exists=0
webapp_exists=0
[[ -n "${API_ENV_FILE}" && ( -e "${API_ENV_FILE}" || -L "${API_ENV_FILE}" ) ]] && api_exists=1
[[ -n "${WEBAPP_ENV_FILE}" && ( -e "${WEBAPP_ENV_FILE}" || -L "${WEBAPP_ENV_FILE}" ) ]] && webapp_exists=1

case "$migration_target" in
  prod|test|dev)
    if [[ "${api_exists}" -ne 1 || "${webapp_exists}" -ne 1 ]]; then
      echo "migrate-all: canonical ${migration_target^^} requires both exact env files" >&2
      exit 1
    fi
    if [[ ! -f "${API_ENV_FILE}" || -L "${API_ENV_FILE}" ]]; then
      echo "migrate-all: API env must be a regular non-symlink file: ${API_ENV_FILE}" >&2
      exit 1
    fi
    if [[ ! -f "${WEBAPP_ENV_FILE}" || -L "${WEBAPP_ENV_FILE}" ]]; then
      echo "migrate-all: webapp env must be a regular non-symlink file: ${WEBAPP_ENV_FILE}" >&2
      exit 1
    fi
    set -a
    # shellcheck disable=SC1090
    source "${API_ENV_FILE}"
    # shellcheck disable=SC1090
    source "${WEBAPP_ENV_FILE}"
    set +a
    ;;
  no-env)
    if [[ "${api_exists}" -eq 1 || "${webapp_exists}" -eq 1 ]]; then
      echo "migrate-all: refusing non-canonical existing env files" >&2
      exit 1
    fi
    ;;
esac

case "$migration_target" in
  prod)
    : "${DATABASE_URL:?migrate-all: canonical PROD env must provide DATABASE_URL}"
    assert_database_url_target "$DATABASE_URL" bersoncarebot
    ;;
  test)
    : "${DATABASE_URL:?migrate-all: canonical TEST env must provide DATABASE_URL}"
    assert_database_url_target "$DATABASE_URL" bersoncarebot_test
    ;;
  dev)
    : "${DATABASE_URL:?migrate-all: local DEV wrapper must provide DATABASE_URL}"
    assert_database_url_target "$DATABASE_URL" bcb_webapp_dev
    ;;
  no-env)
    if [[ -n "${DATABASE_URL:-}" ]]; then
      database_target_kind="$(assert_non_prod_database_url "$DATABASE_URL")"
      if [[ "$database_target_kind" == "runtime" ]] && ! has_local_ipv4 151.241.228.122; then
        echo "migrate-all: no-env DEV/TEST runtime database requires local IPv4 151.241.228.122" >&2
        exit 1
      fi
    elif ! has_local_ipv4 151.241.228.122; then
      echo "migrate-all: empty no-env mode is allowed only on the canonical DEV/TEST host" >&2
      exit 1
    fi
    ;;
esac

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
