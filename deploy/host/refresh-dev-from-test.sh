#!/usr/bin/env bash
set -Eeuo pipefail

# Explicit destructive TEST-to-DEV refresh. This is never an ordinary code-only deploy path.
# Recreate the disposable local DEV database from the current TEST database.
# This intentionally never reads PROD or /opt/env. TEST services and TEST DB remain read-only.

SOURCE_DB="bersoncarebot_test"
SOURCE_DATABASE_URL="postgresql:///bersoncarebot_test?host=/var/run/postgresql"
TARGET_DB="bcb_webapp_dev"
TARGET_ROLE="bcb_webapp_dev_user"
REPO_ROOT="$(realpath "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)")"
DEV_ENV="$REPO_ROOT/apps/webapp/.env.dev"
DEV_ENV_PARSER="$REPO_ROOT/deploy/host/parse-dev-database-url.mjs"
DEV_MIGRATE="$REPO_ROOT/deploy/host/migrate-dev.sh"
DEV_POST_REFRESH_UNLOCK="$REPO_ROOT/deploy/host/dev-post-refresh-unlock.sh"
POSTGRES=(sudo -n -u postgres env -i PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin)

if [[ "${1:-}" != "--execute" || $# -ne 1 ]]; then
  cat <<EOF
Usage: bash deploy/host/refresh-dev-from-test.sh --execute

Recreates exactly $TARGET_DB from exactly $SOURCE_DB, then delegates current-branch migrations and runtime closure.
TEST is read-only; PROD is never opened. The target DEV database is destroyed and recreated.
EOF
  exit 2
fi

if [[ "$EUID" -eq 0 ]]; then
  echo "FATAL: run this wrapper as the non-root repository owner; it uses sudo only for PostgreSQL operations" >&2
  exit 1
fi

if [[ -L "$DEV_ENV" || ! -f "$DEV_ENV" ]]; then
  echo "FATAL: DEV env must be a regular non-symlink file" >&2
  exit 1
fi
if [[ "$(realpath "$DEV_ENV")" != "$REPO_ROOT/apps/webapp/.env.dev" ]]; then
  echo "FATAL: DEV env canonical path guard failed" >&2
  exit 1
fi
if [[ -L "$DEV_ENV_PARSER" || ! -f "$DEV_ENV_PARSER" || "$(realpath "$DEV_ENV_PARSER")" != "$REPO_ROOT/deploy/host/parse-dev-database-url.mjs" ]]; then
  echo "FATAL: DEV env parser path guard failed" >&2
  exit 1
fi
if [[ -L "$DEV_MIGRATE" || ! -f "$DEV_MIGRATE" || "$(realpath "$DEV_MIGRATE")" != "$REPO_ROOT/deploy/host/migrate-dev.sh" ]]; then
  echo "FATAL: DEV migration wrapper path guard failed" >&2
  exit 1
fi
if [[ -L "$DEV_POST_REFRESH_UNLOCK" || ! -f "$DEV_POST_REFRESH_UNLOCK" || "$(realpath "$DEV_POST_REFRESH_UNLOCK")" != "$REPO_ROOT/deploy/host/dev-post-refresh-unlock.sh" ]]; then
  echo "FATAL: DEV post-refresh unlock path guard failed" >&2
  exit 1
fi
for command in sudo psql pg_dump pg_restore node realpath; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "FATAL: required command is unavailable: $command" >&2
    exit 1
  }
done

DEV_DATABASE_URL="$(node "$DEV_ENV_PARSER" "$DEV_ENV")" || {
  echo "FATAL: DEV DATABASE_URL data parser rejected the env file" >&2
  exit 1
}
if [[ "$SOURCE_DATABASE_URL" != "postgresql:///$SOURCE_DB?host=/var/run/postgresql" ]]; then
  echo "FATAL: source database URL guard failed" >&2
  exit 1
fi

echo "[refresh-dev] validating the single DEV migration/closure entrypoint before reset"
bash "$DEV_MIGRATE" --preflight

actual_source="$({ "${POSTGRES[@]}" psql -X -v ON_ERROR_STOP=1 "$SOURCE_DATABASE_URL" -Atc 'SELECT current_database();'; } 2>/dev/null)"
if [[ "$actual_source" != "$SOURCE_DB" ]]; then
  echo "FATAL: source database guard failed" >&2
  exit 1
fi

actual_target_before="$(psql "$DEV_DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc 'SELECT current_database();' 2>/dev/null)"
if [[ "$actual_target_before" != "$TARGET_DB" ]]; then
  echo "FATAL: pre-destructive target database guard failed" >&2
  exit 1
fi

role_exists="$("${POSTGRES[@]}" psql -X -v ON_ERROR_STOP=1 -d postgres -Atc \
  "SELECT count(*) FROM pg_roles WHERE rolname = '$TARGET_ROLE';")"
if [[ "$role_exists" != "1" ]]; then
  echo "FATAL: target DEV role is missing" >&2
  exit 1
fi

dump_file="$("${POSTGRES[@]}" mktemp "/tmp/bcb-test-to-dev.XXXXXX.dump")"
cleanup() {
  "${POSTGRES[@]}" rm -f "$dump_file"
}
trap cleanup EXIT

echo "[refresh-dev] dumping current TEST snapshot"
"${POSTGRES[@]}" pg_dump -Fc --no-owner --no-acl --no-comments -d "$SOURCE_DATABASE_URL" -f "$dump_file"

echo "[refresh-dev] recreating exact DEV target"
"${POSTGRES[@]}" psql -X -v ON_ERROR_STOP=1 -d postgres <<SQL
DROP DATABASE IF EXISTS "$TARGET_DB" WITH (FORCE);
CREATE DATABASE "$TARGET_DB"
  OWNER "$TARGET_ROLE"
  TEMPLATE template0
  ENCODING 'UTF8'
  LC_COLLATE 'C.UTF-8'
  LC_CTYPE 'C.UTF-8';
SQL

actual_target="$("${POSTGRES[@]}" psql -X -v ON_ERROR_STOP=1 -d "$TARGET_DB" -Atc 'SELECT current_database();')"
if [[ "$actual_target" != "$TARGET_DB" ]]; then
  echo "FATAL: target database guard failed" >&2
  exit 1
fi

"${POSTGRES[@]}" psql -X -v ON_ERROR_STOP=1 -d "$TARGET_DB" \
  -c 'CREATE EXTENSION IF NOT EXISTS btree_gist;' >/dev/null
"${POSTGRES[@]}" pg_restore \
  --exit-on-error \
  --no-owner \
  --no-acl \
  --no-comments \
  --role="$TARGET_ROLE" \
  -d "$TARGET_DB" \
  "$dump_file"
"${POSTGRES[@]}" psql -X -v ON_ERROR_STOP=1 -d postgres \
  -c "ALTER ROLE \"$TARGET_ROLE\" IN DATABASE \"$TARGET_DB\" SET search_path = public, integrator;" >/dev/null

echo "[refresh-dev] applying current migrations and the canonical DEV runtime closure"
bash "$DEV_MIGRATE" --execute

echo "[refresh-dev] removing copied TEST-only settings locks from DEV"
bash "$DEV_POST_REFRESH_UNLOCK" --execute

echo "[refresh-dev] PASS: DEV now mirrors TEST data plus current branch migrations"
