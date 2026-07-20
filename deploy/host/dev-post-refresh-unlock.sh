#!/usr/bin/env bash
set -Eeuo pipefail

# Remove only TEST-only system_settings lock objects copied into the mutable DEV DB.
# This is safe to invoke independently after a previous TEST -> DEV refresh.

TARGET_DB="bcb_webapp_dev"
REPO_ROOT="$(realpath "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)")"
DEV_ENV="$REPO_ROOT/apps/webapp/.env.dev"
DEV_ENV_PARSER="$REPO_ROOT/deploy/host/parse-dev-database-url.mjs"
UNLOCK_SQL="$REPO_ROOT/deploy/postgres/dev-post-refresh-unlock.sql"

if [[ "${1:-}" != "--execute" || $# -ne 1 ]]; then
  cat <<EOF
Usage: bash deploy/host/dev-post-refresh-unlock.sh --execute

Removes only the copied TEST system_settings lock triggers/functions from exactly $TARGET_DB.
It does not restore a dump, recreate a database, or open TEST/PROD.
EOF
  exit 2
fi

if [[ "$EUID" -eq 0 ]]; then
  echo "FATAL: run this DEV-only wrapper as the non-root repository owner" >&2
  exit 1
fi

assert_canonical_file() {
  local path="$1"
  local expected="$2"
  local label="$3"
  if [[ -L "$path" || ! -f "$path" || "$(realpath "$path")" != "$expected" ]]; then
    echo "FATAL: $label path guard failed" >&2
    exit 1
  fi
}

assert_canonical_file "$DEV_ENV" "$REPO_ROOT/apps/webapp/.env.dev" "DEV env"
assert_canonical_file "$DEV_ENV_PARSER" "$REPO_ROOT/deploy/host/parse-dev-database-url.mjs" "DEV env parser"
assert_canonical_file "$UNLOCK_SQL" "$REPO_ROOT/deploy/postgres/dev-post-refresh-unlock.sql" "DEV unlock SQL"

for command in node psql realpath getent id cut dirname env; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "FATAL: required command is unavailable: $command" >&2
    exit 1
  }
done

CALLER_HOME="$(getent passwd "$(id -un)" | cut -d: -f6)"
NODE_BIN="$(type -P node)"
PSQL_BIN="$(type -P psql)"
NODE_TOOLCHAIN_BIN="$(realpath "$(dirname "$NODE_BIN")")"
if [[ -z "$CALLER_HOME" || ! -d "$CALLER_HOME" ]]; then
  echo "FATAL: caller HOME guard failed" >&2
  exit 1
fi
SANITIZED_PATH="$NODE_TOOLCHAIN_BIN:/usr/local/bin:/usr/bin:/bin"

DEV_DATABASE_URL="$("$NODE_BIN" "$DEV_ENV_PARSER" "$DEV_ENV")" || {
  echo "FATAL: DEV DATABASE_URL data parser rejected the env file" >&2
  exit 1
}

run_dev_psql() {
  env -i \
    PATH="$SANITIZED_PATH" \
    HOME="$CALLER_HOME" \
    PGPASSFILE=/dev/null \
    PGCONNECT_TIMEOUT=10 \
    "$PSQL_BIN" "$DEV_DATABASE_URL" -X -v ON_ERROR_STOP=1 "$@"
}

actual_database="$(run_dev_psql -Atc 'SELECT current_database();' 2>/dev/null)"
if [[ "$actual_database" != "$TARGET_DB" ]]; then
  echo "FATAL: exact DEV database guard failed" >&2
  exit 1
fi

echo "[dev-post-refresh] removing copied TEST-only system_settings locks from exact DEV target"
run_dev_psql --single-transaction --file="$UNLOCK_SQL" >/dev/null

verified_database="$(run_dev_psql -Atc 'SELECT current_database();' 2>/dev/null)"
if [[ "$verified_database" != "$TARGET_DB" ]]; then
  echo "FATAL: post-unlock DEV database guard failed" >&2
  exit 1
fi

echo "[dev-post-refresh] PASS: exact DEV target is mutable; TEST/PROD were not opened"
