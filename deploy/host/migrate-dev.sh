#!/usr/bin/env bash
set -Eeuo pipefail
{ set +x; } 2>/dev/null
umask 077

# Apply the repository's ordinary pending migrations to the existing local DEV database.
# This entrypoint never restores, drops, recreates, copies or rewires database roles.

TARGET_DB="bcb_webapp_dev"
TARGET_ROLE="bcb_webapp_dev_user"
REPO_ROOT="$(realpath "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)")"
DEV_ENV="$REPO_ROOT/apps/webapp/.env.dev"
DEV_ENV_PARSER="$REPO_ROOT/deploy/host/parse-dev-database-url.mjs"
SAFE_MIGRATION_ENV="$REPO_ROOT/deploy/env/empty.local-migration.env"

usage() {
  cat <<'EOF'
Usage: bash deploy/host/migrate-dev.sh --preflight|--execute

Validates the exact existing local bcb_webapp_dev target. --execute then runs the
repository's ordinary pending integrator and webapp migrations without reset/restore
or role/ACL/runtime-overlay changes.
EOF
}

fatal() {
  printf 'FATAL: %s\n' "$1" >&2
  exit 1
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

for command in flock getent mktemp node pnpm psql realpath; do
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
trap 'rm -rf -- "$CREDENTIAL_DIR"' EXIT
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

(
  cd "$REPO_ROOT"
  env -i \
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
)

echo "migrate-dev: PASS (ordinary pending migrations applied to existing DEV)"
