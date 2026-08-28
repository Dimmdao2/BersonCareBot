#!/usr/bin/env bash
set -Eeuo pipefail
{ set +x; } 2>/dev/null
umask 077

# Refresh the protected System Health aggregate on local bcb_webapp_dev after migrations.
# In the port-context topology diagnostics use the declared webapp staff port; the retired
# SAAS_ISOLATION_OPERATOR_DATABASE_URL login and manual phone-bind grants do not belong here.
# Does not run migrations or reconcile privileges; use migrate-dev.sh for those steps first.

TARGET_DB="bcb_webapp_dev"
REPO_ROOT="$(realpath "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)")"
WEBAPP_ENV="$REPO_ROOT/apps/webapp/.env.dev"
SAAS_SYSTEM_HEALTH_DIAGNOSTICS="$REPO_ROOT/deploy/postgres/saas-system-health-diagnostics.sql"

usage() {
  cat <<'EOF'
Usage: bash deploy/host/provision-dev-saas-diagnostics.sh

Requires apps/webapp/.env.dev with DATABASE_URL_STAFF targeting bcb_webapp_dev.
Refreshes the curated System Health aggregate for the declaration-owned staff/telemetry contour,
then verifies the role membership and exact protected-function access used by the webapp port.
EOF
}

fatal() {
  printf 'FATAL: %s\n' "$1" >&2
  exit 1
}

validate_pg_identifier() {
  local label="$1"
  local value="$2"
  [[ "$value" =~ ^[A-Za-z_][A-Za-z0-9_]{0,62}$ ]] || fatal "$label is not a valid PostgreSQL identifier: $value"
}

# Strip optional single/double quotes around an env value (webapp .env.dev style).
unquote_env_value() {
  local value="$1"
  if [[ "$value" =~ ^\'(.*)\'$ ]]; then
    printf '%s\n' "${BASH_REMATCH[1]}"
  elif [[ "$value" =~ ^\"(.*)\"$ ]]; then
    printf '%s\n' "${BASH_REMATCH[1]}"
  else
    printf '%s\n' "$value"
  fi
}

postgres_scalar() {
  sudo -n -u postgres psql -X -d "$TARGET_DB" -v ON_ERROR_STOP=1 -Atqc "$1"
}

discover_role_from_url() {
  local label="$1"
  local url="$2"
  local identity
  [[ -n "$url" ]] || fatal "$label database URL is empty"
  identity="$(
    PGSSLROOTCERT="${WEBAPP_DB_TLS_CA_FILE:-}" \
    PGSSLCERT="${WEBAPP_DB_STAFF_CERT_FILE:-}" \
    PGSSLKEY="${WEBAPP_DB_STAFF_KEY_FILE:-}" \
      psql "$url" -X -v ON_ERROR_STOP=1 -tAc "SELECT current_user || '|' || current_database();"
  )" ||
    fatal "cannot connect as $label runtime"
  [[ "${identity##*|}" == "$TARGET_DB" ]] ||
    fatal "$label URL must target exact $TARGET_DB (got ${identity##*|})"
  printf '%s\n' "${identity%%|*}"
}

load_env_files() {
  [[ -r "$WEBAPP_ENV" ]] || fatal "missing webapp env: $WEBAPP_ENV"
  set -a
  # shellcheck disable=SC1090
  . "$WEBAPP_ENV"
  set +a
  STAFF_URL="$(unquote_env_value "${DATABASE_URL_STAFF:-}")"
  [[ -n "$STAFF_URL" ]] || fatal "DATABASE_URL_STAFF is required in $WEBAPP_ENV"
}

assert_repo_files() {
  local path
  for path in "$SAAS_SYSTEM_HEALTH_DIAGNOSTICS"; do
    [[ -r "$path" ]] || fatal "missing repo file: $path"
  done
}

install_saas_system_health_diagnostics_overlay() {
  local staff_runtime_role
  staff_runtime_role="$(discover_role_from_url "webapp staff" "$STAFF_URL")"
  validate_pg_identifier "System Health staff runtime role" "$staff_runtime_role"
  sudo -n -u postgres psql -d "$TARGET_DB" -X -v ON_ERROR_STOP=1 \
    -v system_health_operator_runtime_role="$staff_runtime_role" \
    < "$SAAS_SYSTEM_HEALTH_DIAGNOSTICS"
  echo "   curated System Health diagnostic API: OK"
}

assert_dev_diagnostics_contour() {
  local staff_runtime_role ready
  staff_runtime_role="$(discover_role_from_url "System Health staff" "$STAFF_URL")"
  validate_pg_identifier "assert System Health staff role" "$staff_runtime_role"
  ready="$(postgres_scalar "
SELECT (
  has_schema_privilege('saas_system_health_owner', 'app', 'USAGE')
  AND pg_has_role('${staff_runtime_role}', 'saas_telemetry_operator', 'MEMBER')
  AND has_database_privilege('${staff_runtime_role}', '${TARGET_DB}', 'CONNECT')
  AND has_function_privilege('saas_telemetry_operator', 'app.read_curated_system_health()', 'EXECUTE')
  AND has_function_privilege('saas_telemetry_operator', 'app.read_curated_playback_health()', 'EXECUTE')
  AND NOT has_function_privilege('${staff_runtime_role}', 'app.read_curated_system_health()', 'EXECUTE')
  AND NOT has_function_privilege('${staff_runtime_role}', 'app.read_curated_playback_health()', 'EXECUTE')
)::text;")"
  [[ "$ready" == "true" ]] ||
    fatal "DEV diagnostics contour incomplete (USAGE/membership/CONNECT check failed)"
  echo "   DEV diagnostics contour: OK (staff port -> telemetry role -> curated health)"
}

main() {
  if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
    usage
    exit 0
  fi
  [[ $# -eq 0 ]] || fatal "unexpected arguments: $*"
  assert_repo_files
  load_env_files
  install_saas_system_health_diagnostics_overlay
  assert_dev_diagnostics_contour
  echo "DEV SaaS diagnostics contour provisioned on $TARGET_DB"
}

main "$@"
