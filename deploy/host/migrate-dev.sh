#!/usr/bin/env bash
set -Eeuo pipefail
{ set +x; } 2>/dev/null
umask 077

# Apply ordinary pending migrations to the existing post-cutover DEV database.
# This entrypoint never restores, drops, recreates or copies a database.  It uses only the local
# PostgreSQL administrator channel: integrator DDL runs as app_object_owner, while webapp Drizzle
# statements run through the declaration-owner-aware NOLOGIN bcb_dev_migrator.  The declaration
# reconcile is the final mandatory step, so newly-created objects cannot retain migration access.

TARGET_DB="bcb_webapp_dev"
MIGRATOR_ROLE="bcb_dev_migrator"
OBJECT_OWNER_ROLE="app_object_owner"
ADMIN_SOCKET="/var/run/postgresql"
ADMIN_PORT="5432"
REPO_ROOT="$(realpath "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)")"
API_ENV="$REPO_ROOT/.env"
WEBAPP_ENV="$REPO_ROOT/apps/webapp/.env.dev"
DEV_ENV_PARSER="$REPO_ROOT/deploy/host/parse-dev-database-url.mjs"
OWNER_MIGRATOR="$REPO_ROOT/deploy/postgres/privileges/migrate-local.mjs"
INTEGRATOR_MIGRATOR="$REPO_ROOT/deploy/postgres/privileges/migrate-integrator-local.mjs"
RECONCILER="$REPO_ROOT/deploy/postgres/privileges/reconcile-access.mjs"
DRIZZLE_FOLDER="$REPO_ROOT/apps/webapp/db/drizzle-migrations"
D30_ONLINE_INDEX="$REPO_ROOT/deploy/postgres/d30-outgoing-delivery-queue-organization-status-due-online-index.sql"
CREDENTIAL_DIR=""
ACTIVE_CHILD_PID=""

usage() {
  cat <<'EOF'
Usage: bash deploy/host/migrate-dev.sh --preflight|--execute

Validates the exact existing local bcb_webapp_dev target. --execute applies pending
integrator migrations through the local app_object_owner identity, pending webapp
Drizzle statements through the NOLOGIN bcb_dev_migrator and their declared owners,
then atomically reconciles and audits the declaration-owned access state.
EOF
}

fatal() {
  printf 'FATAL: %s\n' "$1" >&2
  exit 1
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

cleanup_exit() {
  local original_status=$?
  trap - EXIT
  trap '' INT TERM HUP
  if [[ -n "$CREDENTIAL_DIR" ]]; then
    rm -rf -- "$CREDENTIAL_DIR"
  fi
  exit "$original_status"
}

assert_canonical_file() {
  local path="$1"
  local expected="$2"
  local label="$3"
  [[ ! -L "$path" && -f "$path" && "$(realpath "$path")" == "$expected" ]] ||
    fatal "$label path guard failed"
}

postgres_scalar() {
  sudo -n -u postgres psql -X -h "$ADMIN_SOCKET" -p "$ADMIN_PORT" -d "$TARGET_DB" \
    -v ON_ERROR_STOP=1 -Atqc "$1"
}

MODE="${1:-}"
if [[ $# -ne 1 || ( "$MODE" != "--preflight" && "$MODE" != "--execute" ) ]]; then
  usage
  exit 2
fi

[[ "$EUID" -ne 0 ]] || fatal "run this wrapper as the non-root repository owner"
[[ -d "$ADMIN_SOCKET" && ! -L "$ADMIN_SOCKET" ]] || fatal "local PostgreSQL socket guard failed"

assert_canonical_file "$API_ENV" "$REPO_ROOT/.env" "DEV API env"
assert_canonical_file "$WEBAPP_ENV" "$REPO_ROOT/apps/webapp/.env.dev" "DEV webapp env"
assert_canonical_file "$DEV_ENV_PARSER" "$REPO_ROOT/deploy/host/parse-dev-database-url.mjs" "DEV env parser"
assert_canonical_file "$OWNER_MIGRATOR" "$REPO_ROOT/deploy/postgres/privileges/migrate-local.mjs" "owner-ordered migrator"
assert_canonical_file "$INTEGRATOR_MIGRATOR" "$REPO_ROOT/deploy/postgres/privileges/migrate-integrator-local.mjs" "integrator migrator"
assert_canonical_file "$RECONCILER" "$REPO_ROOT/deploy/postgres/privileges/reconcile-access.mjs" "access reconciler"
assert_canonical_file "$D30_ONLINE_INDEX" "$REPO_ROOT/deploy/postgres/d30-outgoing-delivery-queue-organization-status-due-online-index.sql" "D30 online index artifact"
[[ ! -L "$DRIZZLE_FOLDER" && -d "$DRIZZLE_FOLDER" ]] || fatal "Drizzle migrations path guard failed"

for command in flock mktemp node psql realpath setsid sudo; do
  command -v "$command" >/dev/null 2>&1 || fatal "required command is unavailable: $command"
done

exec 9>"/tmp/bcb-dev-migrate.$(id -u).lock"
flock -n 9 || fatal "another DEV migration wrapper is already running"

NODE_BIN_DIR="$(dirname "$(command -v node)")"
SANITIZED_PATH="$NODE_BIN_DIR:/usr/local/bin:/usr/bin:/bin"

CREDENTIAL_DIR="$(mktemp -d /tmp/bcb-dev-migrate-credentials.XXXXXX)" ||
  fatal "cannot create private DEV credential directory"
chmod 700 "$CREDENTIAL_DIR"
trap cleanup_exit EXIT
trap 'handle_signal INT 130' INT
trap 'handle_signal TERM 143' TERM
trap 'handle_signal HUP 129' HUP
RECONCILE_ENV="$CREDENTIAL_DIR/reconcile.env"
node "$DEV_ENV_PARSER" --write-reconcile-env "$API_ENV" "$WEBAPP_ENV" "$RECONCILE_ENV" ||
  fatal "DEV runtime URL parser rejected the canonical env files"

identity="$(postgres_scalar \
  "SELECT current_database() || '|' || pg_catalog.pg_get_userbyid(datdba)
   FROM pg_catalog.pg_database WHERE datname = current_database();")" ||
  fatal "DEV identity probe failed"
[[ "$identity" == "$TARGET_DB|postgres" ]] || fatal "DEV database must be the exact post-cutover target"

migrator_state="$(postgres_scalar \
  "SELECT rolsuper::text || '|' || rolcreaterole::text || '|' || rolcreatedb::text || '|' ||
          rolcanlogin::text || '|' || rolbypassrls::text || '|' || rolinherit::text || '|' ||
          (rolpassword IS NULL)::text || '|' ||
          (SELECT count(*) FROM pg_catalog.pg_auth_members WHERE member = role.oid)::text
     FROM pg_catalog.pg_authid AS role WHERE rolname = '$MIGRATOR_ROLE';")" ||
  fatal "cannot inspect DEV migrator"
[[ "$migrator_state" == "false|false|false|false|false|false|true|0" ]] ||
  fatal "$MIGRATOR_ROLE must be NOSUPERUSER/NOCREATEROLE/NOCREATEDB/NOLOGIN/NOBYPASSRLS/NOINHERIT, passwordless and membership-free"

owner_state="$(postgres_scalar \
  "SELECT rolsuper::text || '|' || rolcreaterole::text || '|' || rolcreatedb::text || '|' ||
          rolcanlogin::text || '|' || rolbypassrls::text || '|' || rolinherit::text
     FROM pg_catalog.pg_roles WHERE rolname = '$OBJECT_OWNER_ROLE';")" ||
  fatal "cannot inspect DEV object owner"
[[ "$owner_state" == "false|false|false|false|false|false" ]] ||
  fatal "$OBJECT_OWNER_ROLE must be a stationary NOLOGIN/NOBYPASSRLS/NOINHERIT owner"

if [[ "$MODE" == "--preflight" ]]; then
  echo "migrate-dev preflight: PASS (post-cutover DEV; no changes made)"
  exit 0
fi

cd "$REPO_ROOT"

# Preserve the repository's cross-app dependency order without using any runtime login.
run_tracked node "$INTEGRATOR_MIGRATOR" \
  --db "$TARGET_DB" --migrator "$MIGRATOR_ROLE" --owner "$OBJECT_OWNER_ROLE" \
  --root "$REPO_ROOT/apps/integrator" --before-date 20260708 --sudo-postgres
run_tracked node "$OWNER_MIGRATOR" \
  --db "$TARGET_DB" \
  --migrator "$MIGRATOR_ROLE" \
  --drizzle-folder "$DRIZZLE_FOLDER" \
  --sudo-postgres
run_tracked node "$INTEGRATOR_MIGRATOR" \
  --db "$TARGET_DB" --migrator "$MIGRATOR_ROLE" --owner "$OBJECT_OWNER_ROLE" \
  --root "$REPO_ROOT/apps/integrator" --sudo-postgres

# 0328 commits first; this hot-table index is an idempotent separate autocommit operation.
run_tracked sudo -n -u postgres env \
  PGOPTIONS="-c role=$OBJECT_OWNER_ROLE" \
  psql -X -h "$ADMIN_SOCKET" -p "$ADMIN_PORT" -d "$TARGET_DB" -v ON_ERROR_STOP=1 \
  -f "$D30_ONLINE_INDEX"

# Reconcile loads only the four already-configured runtime passwords.  It reapplies the exact
# declaration and runs its environment/catalog closure verifiers in the same transaction.
run_tracked sudo -n env -i \
  PATH="$SANITIZED_PATH" \
  HOME=/root \
  RECONCILE_ENV="$RECONCILE_ENV" \
  REPO_ROOT="$REPO_ROOT" \
  TARGET_DB="$TARGET_DB" \
  ADMIN_SOCKET="$ADMIN_SOCKET" \
  ADMIN_PORT="$ADMIN_PORT" \
  bash -c '
    set -Eeuo pipefail
    set -a
    . "$RECONCILE_ENV"
    set +a
    exec node "$REPO_ROOT/deploy/postgres/privileges/reconcile-access.mjs" \
      --env dev --db "$TARGET_DB" --admin-socket "$ADMIN_SOCKET" --admin-port "$ADMIN_PORT"
  '

# Reconcile verifies this too, but keep a wrapper-local stationary-state assertion so the migration
# entrypoint itself fails loudly if its deploy-only identity ever gains a persistent capability.
migrator_state="$(postgres_scalar \
  "SELECT rolcanlogin::text || '|' || rolbypassrls::text || '|' || rolinherit::text || '|' ||
          (rolpassword IS NULL)::text || '|' ||
          (SELECT count(*) FROM pg_catalog.pg_auth_members WHERE member = role.oid)::text
     FROM pg_catalog.pg_authid AS role WHERE rolname = '$MIGRATOR_ROLE';")" ||
  fatal "cannot verify stationary DEV migrator"
[[ "$migrator_state" == "false|false|false|true|0" ]] ||
  fatal "$MIGRATOR_ROLE retained a deploy capability after reconcile"

echo "migrate-dev: PASS (pending migrations applied; declaration reconciled and catalog-audited)"
