#!/usr/bin/env bash
set -Eeuo pipefail
{ set +x; } 2>/dev/null
umask 077

# Apply the repository's ordinary pending migrations to the existing local DEV database.
# This entrypoint never restores, drops, recreates or copies a database. The only role change it
# may make is a fail-closed temporary bcb_webapp_dev_user -> app_owner membership plus temporary
# BYPASSRLS around `pnpm migrate`; both are revoked and verified on success and failure.

TARGET_DB="bcb_webapp_dev"
TARGET_ROLE="bcb_webapp_dev_user"
APP_OWNER_ROLE="app_owner"
REPO_ROOT="$(realpath "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)")"
DEV_ENV="$REPO_ROOT/apps/webapp/.env.dev"
DEV_ENV_PARSER="$REPO_ROOT/deploy/host/parse-dev-database-url.mjs"
SAFE_MIGRATION_ENV="$REPO_ROOT/deploy/env/empty.local-migration.env"
APP_OWNER_MEMBERSHIP_ADDED=0
APP_OWNER_MEMBERSHIP_GRANTED_THIS_RUN=0
TARGET_ROLE_BYPASS_ENABLED=0
TARGET_ROLE_BYPASS_CHANGED_THIS_RUN=0
CREDENTIAL_DIR=""
ACTIVE_CHILD_PID=""

usage() {
  cat <<'EOF'
Usage: bash deploy/host/migrate-dev.sh --preflight|--execute

Validates the exact existing local bcb_webapp_dev target. --execute then runs the
repository's ordinary pending integrator and webapp migrations without reset/restore
or runtime-overlay changes. It temporarily grants the existing app_owner role and
BYPASSRLS to the DEV migrator only around `pnpm migrate`, then revokes and verifies both.
EOF
}

fatal() {
  printf 'FATAL: %s\n' "$1" >&2
  exit 1
}

postgres_scalar() {
  sudo -n -u postgres psql -X -d postgres -v ON_ERROR_STOP=1 -Atqc "$1"
}

run_tracked() {
  local child_status=0
  setsid --wait "$@" &
  ACTIVE_CHILD_PID=$!
  wait "$ACTIVE_CHILD_PID" || child_status=$?
  ACTIVE_CHILD_PID=""
  return "$child_status"
}

handle_signal() {
  local signal_name="$1"
  local signal_status="$2"
  trap '' INT TERM HUP
  if [[ -n "$ACTIVE_CHILD_PID" ]]; then
    kill "-$signal_name" -- "-$ACTIVE_CHILD_PID" 2>/dev/null ||
      kill "-$signal_name" -- "$ACTIVE_CHILD_PID" 2>/dev/null ||
      true
    wait "$ACTIVE_CHILD_PID" 2>/dev/null || true
    ACTIVE_CHILD_PID=""
  fi
  exit "$signal_status"
}

grant_migrator_app_owner_membership() {
  local attributes membership
  attributes="$(
    postgres_scalar \
      "SELECT rolsuper::text || '|' || rolcreaterole::text || '|' ||
        rolcreatedb::text || '|' || rolcanlogin::text || '|' || rolbypassrls::text
       FROM pg_roles
       WHERE rolname = '$APP_OWNER_ROLE';"
  )" || fatal "cannot inspect DEV app_owner role"
  [[ "$attributes" == "false|false|false|false|true" ]] ||
    fatal "$APP_OWNER_ROLE must be NOSUPERUSER NOCREATEROLE NOCREATEDB NOLOGIN BYPASSRLS"

  membership="$(
    postgres_scalar "SELECT pg_has_role('$TARGET_ROLE', '$APP_OWNER_ROLE', 'member');"
  )" || fatal "cannot inspect DEV app_owner membership"
  [[ "$membership" == "f" ]] ||
    fatal "pre-existing $TARGET_ROLE membership in $APP_OWNER_ROLE"

  # Assume cleanup responsibility before the GRANT starts. If the wrapper is signalled after
  # PostgreSQL commits but before psql returns, EXIT cleanup must still revoke the membership.
  APP_OWNER_MEMBERSHIP_ADDED=1
  APP_OWNER_MEMBERSHIP_GRANTED_THIS_RUN=1
  run_tracked sudo -n -u postgres psql -X -d postgres -v ON_ERROR_STOP=1 \
    -c "GRANT \"$APP_OWNER_ROLE\" TO \"$TARGET_ROLE\";" >/dev/null ||
    fatal "cannot grant temporary DEV app_owner membership"
}

enable_migrator_bypass() {
  local bypass
  bypass="$(
    postgres_scalar "SELECT rolbypassrls::text FROM pg_roles WHERE rolname = '$TARGET_ROLE';"
  )" || fatal "cannot inspect DEV migrator BYPASSRLS"
  [[ "$bypass" == "false" ]] || fatal "pre-existing $TARGET_ROLE BYPASSRLS"

  # Assume cleanup responsibility before ALTER ROLE starts for the same commit-before-signal case
  # covered by the temporary membership cleanup.
  TARGET_ROLE_BYPASS_ENABLED=1
  TARGET_ROLE_BYPASS_CHANGED_THIS_RUN=1
  run_tracked sudo -n -u postgres psql -X -d postgres -v ON_ERROR_STOP=1 \
    -c "ALTER ROLE \"$TARGET_ROLE\" BYPASSRLS;" >/dev/null ||
    fatal "cannot enable temporary DEV migrator BYPASSRLS"
}

cleanup_elevation() {
  local cleanup_status=0 membership bypass
  if [[ "$TARGET_ROLE_BYPASS_ENABLED" == "1" ]]; then
    if sudo -n -u postgres psql -X -d postgres -v ON_ERROR_STOP=1 \
      -c "ALTER ROLE \"$TARGET_ROLE\" NOBYPASSRLS;" >/dev/null; then
      TARGET_ROLE_BYPASS_ENABLED=0
    else
      cleanup_status=1
    fi
  fi

  if [[ "$APP_OWNER_MEMBERSHIP_ADDED" == "1" ]]; then
    if sudo -n -u postgres psql -X -d postgres -v ON_ERROR_STOP=1 \
      -c "REVOKE \"$APP_OWNER_ROLE\" FROM \"$TARGET_ROLE\";" >/dev/null; then
      APP_OWNER_MEMBERSHIP_ADDED=0
    else
      cleanup_status=1
    fi
  fi

  if [[ "$APP_OWNER_MEMBERSHIP_GRANTED_THIS_RUN" == "1" ]]; then
    membership="$(
      postgres_scalar "SELECT pg_has_role('$TARGET_ROLE', '$APP_OWNER_ROLE', 'member');"
    )" || cleanup_status=1
    [[ "$membership" == "f" ]] || cleanup_status=1
  fi
  if [[ "$TARGET_ROLE_BYPASS_CHANGED_THIS_RUN" == "1" ]]; then
    bypass="$(
      postgres_scalar "SELECT rolbypassrls::text FROM pg_roles WHERE rolname = '$TARGET_ROLE';"
    )" || cleanup_status=1
    [[ "$bypass" == "false" ]] || cleanup_status=1
  fi
  return "$cleanup_status"
}

cleanup_exit() {
  local original_status=$? cleanup_status=0
  trap - EXIT
  trap '' INT TERM HUP
  set +e
  cleanup_elevation
  cleanup_status=$?
  if [[ -n "$CREDENTIAL_DIR" ]]; then
    rm -rf -- "$CREDENTIAL_DIR"
  fi
  if [[ "$original_status" -ne 0 ]]; then
    exit "$original_status"
  fi
  exit "$cleanup_status"
}

assert_canonical_file() {
  local path="$1"
  local expected="$2"
  local label="$3"
  [[ ! -L "$path" && -f "$path" && "$(realpath "$path")" == "$expected" ]] ||
    fatal "$label path guard failed"
}

MODE="${1:-}"
if [[ $# -ne 1 || ( "$MODE" != "--preflight" && "$MODE" != "--execute" ) ]]; then
  usage
  exit 2
fi

[[ "$EUID" -ne 0 ]] || fatal "run this wrapper as the non-root repository owner"

assert_canonical_file "$DEV_ENV" "$REPO_ROOT/apps/webapp/.env.dev" "DEV env"
assert_canonical_file "$DEV_ENV_PARSER" "$REPO_ROOT/deploy/host/parse-dev-database-url.mjs" "DEV env parser"
assert_canonical_file \
  "$SAFE_MIGRATION_ENV" \
  "$REPO_ROOT/deploy/env/empty.local-migration.env" \
  "safe migration env"

if grep -Eqv '^[[:space:]]*(#.*)?$' "$SAFE_MIGRATION_ENV"; then
  fatal "safe migration env must contain comments/blank lines only"
fi

for command in flock getent mktemp node pnpm psql realpath setsid sudo; do
  command -v "$command" >/dev/null 2>&1 || fatal "required command is unavailable: $command"
done

exec 9>"/tmp/bcb-dev-migrate.$(id -u).lock"
flock -n 9 || fatal "another DEV migration wrapper is already running"

CALLER_HOME="$(getent passwd "$(id -un)" | cut -d: -f6)"
[[ -n "$CALLER_HOME" && -d "$CALLER_HOME" ]] || fatal "caller HOME guard failed"

NODE_BIN_DIR="$(dirname "$(command -v node)")"
PNPM_BIN_DIR="$(dirname "$(command -v pnpm)")"
SANITIZED_PATH="$NODE_BIN_DIR:$PNPM_BIN_DIR:/usr/local/bin:/usr/bin:/bin"

CREDENTIAL_DIR="$(mktemp -d /tmp/bcb-dev-migrate-credentials.XXXXXX)" ||
  fatal "cannot create private DEV credential directory"
chmod 700 "$CREDENTIAL_DIR"
trap cleanup_exit EXIT
trap 'handle_signal INT 130' INT
trap 'handle_signal TERM 143' TERM
trap 'handle_signal HUP 129' HUP
PGPASS_FILE="$CREDENTIAL_DIR/pgpass"
node "$DEV_ENV_PARSER" --write-pgpass "$DEV_ENV" "$PGPASS_FILE" ||
  fatal "DEV DATABASE_URL data parser rejected the env file"

identity="$(
  env -i \
    PATH="$SANITIZED_PATH" \
    PGHOST=127.0.0.1 \
    PGPORT=5432 \
    PGUSER="$TARGET_ROLE" \
    PGDATABASE="$TARGET_DB" \
    PGPASSFILE="$PGPASS_FILE" \
    PGCONNECT_TIMEOUT=10 \
    psql -X -v ON_ERROR_STOP=1 -Atqc \
      "SELECT current_user || '|' || current_database() || '|' ||
        pg_catalog.pg_get_userbyid(datdba)
       FROM pg_database
       WHERE datname = current_database();"
)" || fatal "DEV identity probe failed"
[[ "$identity" == "$TARGET_ROLE|$TARGET_DB|$TARGET_ROLE" ]] ||
  fatal "DEV identity must be exact owner and database"

if [[ "$MODE" == "--preflight" ]]; then
  echo "migrate-dev preflight: PASS (exact local DEV; no changes made)"
  exit 0
fi

DEV_DATABASE_URL="$(node "$DEV_ENV_PARSER" "$DEV_ENV")" ||
  fatal "DEV DATABASE_URL data parser rejected the env file"

grant_migrator_app_owner_membership
enable_migrator_bypass

cd "$REPO_ROOT"
run_tracked env -i \
  PATH="$SANITIZED_PATH" \
  HOME="$CALLER_HOME" \
  PNPM_HOME="$PNPM_BIN_DIR" \
  NODE_ENV=development \
  CI=1 \
  DATABASE_URL="$DEV_DATABASE_URL" \
  API_ENV_FILE="$SAFE_MIGRATION_ENV" \
  WEBAPP_ENV_FILE="$SAFE_MIGRATION_ENV" \
  PGCONNECT_TIMEOUT=10 \
  pnpm run migrate

cleanup_elevation || fatal "failed to revoke temporary DEV app_owner membership"

echo "migrate-dev: PASS (ordinary pending migrations applied to existing DEV)"
