#!/usr/bin/env bash
set -Eeuo pipefail
{ set +x; } 2>/dev/null
umask 077

# Provision the canonical SaaS isolation diagnostics contour on local bcb_webapp_dev:
# operator LOGIN from SAAS_ISOLATION_OPERATOR_DATABASE_URL, telemetry overlay, health overlay,
# and bootstrap EXECUTE on phone-bind accessors (d3-4 surface; migrate-dev does not re-run d3-4).
# Does not run migrations; use migrate-dev.sh for pending schema changes.

TARGET_DB="bcb_webapp_dev"
REPO_ROOT="$(realpath "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)")"
WEBAPP_ENV="$REPO_ROOT/apps/webapp/.env.dev"
ROOT_ENV="$REPO_ROOT/.env"
SAAS_ISOLATION_TELEMETRY="$REPO_ROOT/deploy/postgres/saas-isolation-telemetry.sql"
SAAS_SYSTEM_HEALTH_DIAGNOSTICS="$REPO_ROOT/deploy/postgres/saas-system-health-diagnostics.sql"
SAAS_ISOLATION_OPERATOR_PROVISIONER="$REPO_ROOT/deploy/host/render-saas-isolation-operator-provisioning.mjs"

PHONE_BIND_LOCK_FN='app.auth_phone_bind_lock_channel_binding(text,text)'
PHONE_BIND_UPSERT_FN='app.auth_phone_bind_upsert_channel_binding(uuid,text,text)'

usage() {
  cat <<'EOF'
Usage: bash deploy/host/provision-dev-saas-diagnostics.sh

Requires apps/webapp/.env.dev with SAAS_ISOLATION_OPERATOR_DATABASE_URL targeting
bcb_webapp_dev (separate diagnostic login whose name contains "operator", password >= 32 bytes).
Applies the same telemetry + curated System Health overlays as deploy-test-saas.sh, grants
bootstrap EXECUTE on phone-bind accessors, then asserts the operator can read curated health.
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
  identity="$(psql "$url" -X -v ON_ERROR_STOP=1 -tAc "SELECT current_user || '|' || current_database();")" ||
    fatal "cannot connect as $label runtime"
  [[ "${identity##*|}" == "$TARGET_DB" ]] ||
    fatal "$label URL must target exact $TARGET_DB (got ${identity##*|})"
  printf '%s\n' "${identity%%|*}"
}

load_env_files() {
  [[ -r "$WEBAPP_ENV" ]] || fatal "missing webapp env: $WEBAPP_ENV"
  [[ -r "$ROOT_ENV" ]] || fatal "missing root env: $ROOT_ENV"
  set -a
  # shellcheck disable=SC1090
  . "$WEBAPP_ENV"
  set +a
  WEBAPP_BOOTSTRAP_URL="$(unquote_env_value "${DATABASE_URL_NONSTAFF:-${DATABASE_URL:-}}")"
  OPERATOR_URL="$(unquote_env_value "${SAAS_ISOLATION_OPERATOR_DATABASE_URL:-}")"
  API_RUNTIME_URL="$(
    node -e "
      const fs = require('node:fs');
      const text = fs.readFileSync(process.argv[1], 'utf8');
      const match = text.match(/^DATABASE_URL=(.*)$/m);
      if (!match) process.exit(2);
      let value = match[1].trim();
      if (
        (value.startsWith(\"'\") && value.endsWith(\"'\")) ||
        (value.startsWith('\"') && value.endsWith('\"'))
      ) {
        value = value.slice(1, -1);
      }
      process.stdout.write(value);
    " "$ROOT_ENV"
  )" || fatal "root .env must define DATABASE_URL for integrator/api runtime discovery"
  [[ -n "$OPERATOR_URL" ]] ||
    fatal "SAAS_ISOLATION_OPERATOR_DATABASE_URL is required in $WEBAPP_ENV"
  export SAAS_ISOLATION_OPERATOR_DATABASE_URL="$OPERATOR_URL"
}

assert_repo_files() {
  local path
  for path in \
    "$SAAS_ISOLATION_TELEMETRY" \
    "$SAAS_SYSTEM_HEALTH_DIAGNOSTICS" \
    "$SAAS_ISOLATION_OPERATOR_PROVISIONER"; do
    [[ -r "$path" ]] || fatal "missing repo file: $path"
  done
}

provision_operator_login() {
  SAAS_ISOLATION_OPERATOR_DATABASE_URL="$OPERATOR_URL" \
    node "$SAAS_ISOLATION_OPERATOR_PROVISIONER" | sudo -n -u postgres psql -d "$TARGET_DB" -X -q -v ON_ERROR_STOP=1
  echo "   SaaS isolation diagnostic login: provisioned/rotated from DEV env"
}

install_saas_isolation_telemetry_overlay() {
  local webapp_runtime_role api_runtime_role operator_runtime_role
  webapp_runtime_role="$(discover_role_from_url "webapp bootstrap" "$WEBAPP_BOOTSTRAP_URL")"
  api_runtime_role="$(discover_role_from_url "integrator/api" "$API_RUNTIME_URL")"
  operator_runtime_role="$(discover_role_from_url "SaaS isolation operator" "$OPERATOR_URL")"
  validate_pg_identifier "webapp telemetry runtime role" "$webapp_runtime_role"
  validate_pg_identifier "api telemetry runtime role" "$api_runtime_role"
  validate_pg_identifier "telemetry operator role" "$operator_runtime_role"
  sudo -n -u postgres psql -d "$TARGET_DB" -X -v ON_ERROR_STOP=1 \
    -v telemetry_webapp_runtime_role="$webapp_runtime_role" \
    -v telemetry_api_runtime_role="$api_runtime_role" \
    -v telemetry_operator_runtime_role="$operator_runtime_role" \
    < "$SAAS_ISOLATION_TELEMETRY"
  echo "   SaaS isolation telemetry closed API: OK"
}

install_saas_system_health_diagnostics_overlay() {
  local operator_runtime_role
  operator_runtime_role="$(discover_role_from_url "System Health operator" "$OPERATOR_URL")"
  validate_pg_identifier "System Health operator role" "$operator_runtime_role"
  sudo -n -u postgres psql -d "$TARGET_DB" -X -v ON_ERROR_STOP=1 \
    -v system_health_operator_runtime_role="$operator_runtime_role" \
    < "$SAAS_SYSTEM_HEALTH_DIAGNOSTICS"
  echo "   curated System Health diagnostic API: OK"
}

# migrate-dev does not re-apply d3-4; phone-bind accessors from 0371 must still reach the
# bare NOINHERIT bootstrap login that createOrBind uses (stampBootstrapPrincipal, no SET ROLE).
grant_bootstrap_phone_bind_accessor_execute() {
  local webapp_runtime_role
  webapp_runtime_role="$(discover_role_from_url "webapp bootstrap" "$WEBAPP_BOOTSTRAP_URL")"
  validate_pg_identifier "webapp bootstrap role for phone-bind EXECUTE" "$webapp_runtime_role"
  sudo -n -u postgres psql -d "$TARGET_DB" -X -v ON_ERROR_STOP=1 \
    -v bootstrap_role="$webapp_runtime_role" <<'SQL'
\set ON_ERROR_STOP on
SELECT 1 / (to_regprocedure('app.auth_phone_bind_lock_channel_binding(text,text)') IS NOT NULL)::int;
SELECT 1 / (to_regprocedure('app.auth_phone_bind_upsert_channel_binding(uuid,text,text)') IS NOT NULL)::int;
SELECT format(
  'GRANT EXECUTE ON FUNCTION app.auth_phone_bind_lock_channel_binding(text, text) TO %I',
  :'bootstrap_role'
) \gexec
SELECT format(
  'GRANT EXECUTE ON FUNCTION app.auth_phone_bind_upsert_channel_binding(uuid, text, text) TO %I',
  :'bootstrap_role'
) \gexec
SQL
  echo "   bootstrap phone-bind accessor EXECUTE: OK ($webapp_runtime_role)"
}

assert_dev_diagnostics_contour() {
  local operator_runtime_role webapp_runtime_role ready curated_ok lock_exec upsert_exec
  operator_runtime_role="$(discover_role_from_url "System Health operator" "$OPERATOR_URL")"
  webapp_runtime_role="$(discover_role_from_url "webapp bootstrap" "$WEBAPP_BOOTSTRAP_URL")"
  validate_pg_identifier "assert operator role" "$operator_runtime_role"
  validate_pg_identifier "assert bootstrap role" "$webapp_runtime_role"
  ready="$(postgres_scalar "
SELECT (
  has_schema_privilege('saas_system_health_owner', 'app', 'USAGE')
  AND pg_has_role('${operator_runtime_role}', 'saas_telemetry_operator', 'MEMBER')
  AND has_database_privilege('${operator_runtime_role}', '${TARGET_DB}', 'CONNECT')
)::text;")"
  [[ "$ready" == "true" ]] ||
    fatal "DEV diagnostics contour incomplete (USAGE/membership/CONNECT check failed)"
  curated_ok="$(psql "$OPERATOR_URL" -X -v ON_ERROR_STOP=1 -tAc \
    "SELECT (app.read_curated_system_health() ? 'mediaPreview')::text;")"
  [[ "$curated_ok" == "true" ]] ||
    fatal "operator cannot read curated system health (app.read_curated_system_health)"
  lock_exec="$(postgres_scalar "SELECT has_function_privilege('${webapp_runtime_role}', '${PHONE_BIND_LOCK_FN}', 'EXECUTE')::text;")"
  upsert_exec="$(postgres_scalar "SELECT has_function_privilege('${webapp_runtime_role}', '${PHONE_BIND_UPSERT_FN}', 'EXECUTE')::text;")"
  [[ "$lock_exec" == "true" && "$upsert_exec" == "true" ]] ||
    fatal "bootstrap login lacks EXECUTE on phone-bind accessors (re-run after 0371+)"
  echo "   DEV diagnostics contour: OK (operator curated health + bootstrap phone-bind EXECUTE)"
}

main() {
  if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
    usage
    exit 0
  fi
  [[ $# -eq 0 ]] || fatal "unexpected arguments: $*"
  assert_repo_files
  load_env_files
  provision_operator_login
  install_saas_isolation_telemetry_overlay
  install_saas_system_health_diagnostics_overlay
  grant_bootstrap_phone_bind_accessor_execute
  assert_dev_diagnostics_contour
  echo "DEV SaaS diagnostics contour provisioned on $TARGET_DB"
}

main "$@"
