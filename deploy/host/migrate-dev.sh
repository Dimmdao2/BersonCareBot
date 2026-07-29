#!/usr/bin/env bash
set -Eeuo pipefail
{ set +x; } 2>/dev/null
umask 077

# Non-destructive schema migration for the already prepared local DEV database.
# This entrypoint never restores, drops, recreates, dumps or refreshes a database.

TARGET_DB="bcb_webapp_dev"
TARGET_ROLE="bcb_webapp_dev_user"
APP_OWNER_ROLE="app_owner"
REPO_ROOT="$(realpath "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)")"
DEV_ENV="$REPO_ROOT/apps/webapp/.env.dev"
DEV_ENV_PARSER="$REPO_ROOT/deploy/host/parse-dev-database-url.mjs"
DEV_RUNTIME_OVERLAY_REHYDRATE="$REPO_ROOT/deploy/host/dev-runtime-overlay-rehydrate.sh"
SAFE_MIGRATION_ENV="$REPO_ROOT/deploy/env/empty.local-migration.env"
C4D_MEDIA_OWNER_ONLINE_INDEX="$REPO_ROOT/deploy/postgres/c4d-platform-lfk-media-owner-online-index.sql"
DRIZZLE_JOURNAL="$REPO_ROOT/apps/webapp/db/drizzle-migrations/meta/_journal.json"
DRIZZLE_0247_MIGRATION="$REPO_ROOT/apps/webapp/db/drizzle-migrations/0247_email_challenge_atomic_attempts.sql"
POSTGRES=(sudo -n -u postgres env -i PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin)

DBROLE_APP_OWNER_MEMBERSHIP_ADDED=0
DBROLE_APP_OWNER_MEMBERSHIP_GRANTED_THIS_RUN=0

usage() {
  cat <<'EOF'
Usage: bash deploy/host/migrate-dev.sh --preflight|--execute

Applies only pending current-branch migrations to the existing local bcb_webapp_dev,
then runs the canonical C4D online-index artifact and DEV runtime-overlay closure.
This command never restores, drops, recreates, dumps or refreshes a database.
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

postgres_scalar() {
  "${POSTGRES[@]}" psql -X -v ON_ERROR_STOP=1 -d postgres -Atqc "$1"
}

cleanup_elevation() {
  local cleanup_status=0
  local bypass_state membership_state

  if [[ "$DBROLE_APP_OWNER_MEMBERSHIP_ADDED" == "1" ]]; then
    "${POSTGRES[@]}" psql -X -v ON_ERROR_STOP=1 -d postgres \
      -c "REVOKE \"$APP_OWNER_ROLE\" FROM \"$TARGET_ROLE\";" >/dev/null || cleanup_status=1
    DBROLE_APP_OWNER_MEMBERSHIP_ADDED=0
  fi

  "${POSTGRES[@]}" psql -X -v ON_ERROR_STOP=1 -d postgres \
    -c "ALTER ROLE \"$TARGET_ROLE\" NOBYPASSRLS;" >/dev/null || cleanup_status=1

  bypass_state="$(postgres_scalar \
    "SELECT rolbypassrls::text FROM pg_roles WHERE rolname = '$TARGET_ROLE';")" || cleanup_status=1
  [[ "$bypass_state" == "false" ]] || cleanup_status=1

  if [[ "$DBROLE_APP_OWNER_MEMBERSHIP_GRANTED_THIS_RUN" == "1" ]]; then
    membership_state="$(postgres_scalar \
      "SELECT pg_has_role('$TARGET_ROLE', '$APP_OWNER_ROLE', 'member');")" || cleanup_status=1
    [[ "$membership_state" == "f" ]] || cleanup_status=1
  fi

  return "$cleanup_status"
}

cleanup_exit() {
  local original_status=$?
  local cleanup_status
  set +e
  cleanup_elevation
  cleanup_status=$?
  if [[ "$original_status" -eq 0 && "$cleanup_status" -ne 0 ]]; then
    exit "$cleanup_status"
  fi
  exit "$original_status"
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
  "$DEV_RUNTIME_OVERLAY_REHYDRATE" \
  "$REPO_ROOT/deploy/host/dev-runtime-overlay-rehydrate.sh" \
  "DEV runtime overlay wrapper"
assert_canonical_file \
  "$SAFE_MIGRATION_ENV" \
  "$REPO_ROOT/deploy/env/empty.local-migration.env" \
  "safe migration env"
assert_canonical_file \
  "$C4D_MEDIA_OWNER_ONLINE_INDEX" \
  "$REPO_ROOT/deploy/postgres/c4d-platform-lfk-media-owner-online-index.sql" \
  "C4D online-index artifact"
assert_canonical_file \
  "$DRIZZLE_JOURNAL" \
  "$REPO_ROOT/apps/webapp/db/drizzle-migrations/meta/_journal.json" \
  "Drizzle journal"
assert_canonical_file \
  "$DRIZZLE_0247_MIGRATION" \
  "$REPO_ROOT/apps/webapp/db/drizzle-migrations/0247_email_challenge_atomic_attempts.sql" \
  "Drizzle 0247 migration"

if grep -Eqv '^[[:space:]]*(#.*)?$' "$SAFE_MIGRATION_ENV"; then
  fatal "safe migration env must contain comments/blank lines only"
fi

for command in bash flock grep node pnpm psql realpath sudo; do
  command -v "$command" >/dev/null 2>&1 || fatal "required command is unavailable: $command"
done

exec 9>"/tmp/bcb-dev-migrate.$(id -u).lock"
flock -n 9 || fatal "another DEV migration wrapper is already running"

CALLER_HOME="$(getent passwd "$(id -un)" | cut -d: -f6)"
NODE_LAUNCHER="$(type -P node)"
PNPM_LAUNCHER="$(type -P pnpm)"
TOOLCHAIN_BIN="$(realpath "$(dirname "$NODE_LAUNCHER")")"
NODE_BIN="$(realpath "$NODE_LAUNCHER")"
PNPM_BIN="$(realpath "$PNPM_LAUNCHER")"
NODE_PREFIX="$(dirname "$TOOLCHAIN_BIN")"
EXPECTED_PNPM_BIN="$NODE_PREFIX/lib/node_modules/corepack/dist/pnpm.js"
if [[ -z "$CALLER_HOME" || ! -d "$CALLER_HOME" \
  || "$NODE_BIN" != "$TOOLCHAIN_BIN/node" \
  || "$(realpath "$(dirname "$PNPM_LAUNCHER")")" != "$TOOLCHAIN_BIN" \
  || "$PNPM_BIN" != "$EXPECTED_PNPM_BIN" ]]; then
  fatal "caller HOME/toolchain guard failed"
fi
SANITIZED_PATH="$TOOLCHAIN_BIN:/usr/local/bin:/usr/bin:/bin"

DEV_DATABASE_URL="$(node "$DEV_ENV_PARSER" "$DEV_ENV")" ||
  fatal "DEV DATABASE_URL data parser rejected the env file"

read -r DRIZZLE_0247_HASH DRIZZLE_0247_WHEN < <(
  node -e '
    const crypto = require("node:crypto");
    const fs = require("node:fs");
    const [journalPath, migrationPath] = process.argv.slice(1);
    const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
    const entry = journal.entries?.find(({ tag }) => tag === "0247_email_challenge_atomic_attempts");
    if (!entry || !Number.isSafeInteger(entry.when)) process.exit(1);
    const hash = crypto.createHash("sha256").update(fs.readFileSync(migrationPath)).digest("hex");
    process.stdout.write(`${hash} ${entry.when}\n`);
  ' "$DRIZZLE_JOURNAL" "$DRIZZLE_0247_MIGRATION"
) || fatal "failed to derive canonical Drizzle 0247 ledger identity"
[[ "$DRIZZLE_0247_HASH" =~ ^[0-9a-f]{64}$ && "$DRIZZLE_0247_WHEN" =~ ^[0-9]+$ ]] ||
  fatal "invalid canonical Drizzle 0247 ledger identity"

reconcile_0247_ledger_drift() {
  local state

  state="$(psql "$DEV_DATABASE_URL" -X -v ON_ERROR_STOP=1 -v drizzle_0247_hash="$DRIZZLE_0247_HASH" -Atqc "
    SELECT CASE
      WHEN to_regclass('drizzle.__drizzle_migrations') IS NULL THEN 'ledger_missing'
      WHEN EXISTS (
        SELECT 1
        FROM drizzle.__drizzle_migrations
        WHERE hash = :'drizzle_0247_hash'
      ) AND EXISTS (
        SELECT 1
        FROM pg_proc p
        WHERE p.oid = 'app.email_auth_increment_email_challenge_attempts(uuid)'::regprocedure
          AND p.prosecdef
          AND p.provolatile = 'v'
          AND p.prosrc LIKE '%FOR UPDATE%'
          AND p.prosrc LIKE '%SET attempts = attempts + 1%'
      ) AND to_regprocedure('app.email_auth_update_email_challenge_attempts(uuid,integer)') IS NULL THEN 'aligned'
      WHEN NOT EXISTS (
        SELECT 1
        FROM drizzle.__drizzle_migrations
        WHERE hash = :'drizzle_0247_hash'
      ) AND EXISTS (
        SELECT 1
        FROM pg_proc p
        WHERE p.oid = 'app.email_auth_increment_email_challenge_attempts(uuid)'::regprocedure
          AND p.prosecdef
          AND p.provolatile = 'v'
          AND p.prosrc LIKE '%FOR UPDATE%'
          AND p.prosrc LIKE '%SET attempts = attempts + 1%'
      ) AND to_regprocedure('app.email_auth_update_email_challenge_attempts(uuid,integer)') IS NULL THEN 'reconcile_ledger'
      WHEN NOT EXISTS (
        SELECT 1
        FROM drizzle.__drizzle_migrations
        WHERE hash = :'drizzle_0247_hash'
      ) AND to_regprocedure('app.email_auth_increment_email_challenge_attempts(uuid)') IS NULL THEN 'unapplied'
      ELSE 'object_drift'
    END;
  ")" || fatal "DEV 0247 ledger/object drift probe failed"

  case "$state" in
    aligned|unapplied)
      return
      ;;
    reconcile_ledger)
      if [[ "$MODE" == "--preflight" ]]; then
        echo "migrate-dev preflight: 0247 object exists without its Drizzle hash; --execute will reconcile the ledger"
        return
      fi
      psql "$DEV_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
        -v drizzle_0247_hash="$DRIZZLE_0247_HASH" \
        -v drizzle_0247_when="$DRIZZLE_0247_WHEN" \
        -c "INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
            SELECT :'drizzle_0247_hash', :'drizzle_0247_when'::bigint
            WHERE NOT EXISTS (
              SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = :'drizzle_0247_hash'
            );" >/dev/null || fatal "failed to reconcile the canonical Drizzle 0247 ledger row"
      echo "migrate-dev: reconciled Drizzle ledger for already-applied 0247 object"
      ;;
    ledger_missing|object_drift)
      fatal "DEV Drizzle 0247 ledger/object drift detected; run bash deploy/host/dev-runtime-overlay-rehydrate.sh --execute, then rerun migrate-dev.sh (do not run pnpm migrate directly)"
      ;;
    *)
      fatal "DEV 0247 ledger/object drift probe returned an invalid state"
      ;;
  esac
}

identity="$(psql "$DEV_DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atqc \
  "SELECT current_user || '|' || current_database();")" || fatal "DEV identity probe failed"
[[ "$identity" == "$TARGET_ROLE|$TARGET_DB" ]] || fatal "DEV identity must be exact owner and database"

database_owner="$(psql "$DEV_DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atqc \
  "SELECT pg_catalog.pg_get_userbyid(datdba) FROM pg_database WHERE datname = current_database();")" ||
  fatal "DEV database owner probe failed"
[[ "$database_owner" == "$TARGET_ROLE" ]] || fatal "DEV database owner must be $TARGET_ROLE"

target_attributes="$(postgres_scalar \
  "SELECT rolsuper::text || '|' || rolcreaterole::text || '|' || rolcreatedb::text || '|' || rolcanlogin::text || '|' || rolbypassrls::text FROM pg_roles WHERE rolname = '$TARGET_ROLE';")"
[[ "$target_attributes" == "false|false|false|true|false" ]] ||
  fatal "$TARGET_ROLE must be NOSUPERUSER NOCREATEROLE NOCREATEDB LOGIN NOBYPASSRLS"

app_owner_attributes="$(postgres_scalar \
  "SELECT rolsuper::text || '|' || rolcreaterole::text || '|' || rolcreatedb::text || '|' || rolcanlogin::text || '|' || rolbypassrls::text FROM pg_roles WHERE rolname = '$APP_OWNER_ROLE';")"
[[ "$app_owner_attributes" == "false|false|false|false|true" ]] ||
  fatal "$APP_OWNER_ROLE must be NOSUPERUSER NOCREATEROLE NOCREATEDB NOLOGIN BYPASSRLS"

preexisting_app_owner_membership="$(postgres_scalar \
  "SELECT pg_has_role('$TARGET_ROLE', '$APP_OWNER_ROLE', 'member');")"
[[ "$preexisting_app_owner_membership" == "f" ]] ||
  fatal "pre-existing $TARGET_ROLE membership in $APP_OWNER_ROLE requires incident cleanup"

# Reuse the existing exact DEV role/topology preflight before any privilege or schema write.
bash "$DEV_RUNTIME_OVERLAY_REHYDRATE" --preflight

# The DEV runtime overlay can already have re-created 0247's replacement function while the
# Drizzle hash is absent. Reconcile only that proven applied-object/hash pair before migration.
reconcile_0247_ledger_drift

if [[ "$MODE" == "--preflight" ]]; then
  echo "migrate-dev preflight: PASS (exact local DEV; no changes made)"
  exit 0
fi

trap cleanup_exit EXIT

"${POSTGRES[@]}" psql -X -v ON_ERROR_STOP=1 -d postgres \
  -c "GRANT \"$APP_OWNER_ROLE\" TO \"$TARGET_ROLE\";" >/dev/null
DBROLE_APP_OWNER_MEMBERSHIP_ADDED=1
DBROLE_APP_OWNER_MEMBERSHIP_GRANTED_THIS_RUN=1
"${POSTGRES[@]}" psql -X -v ON_ERROR_STOP=1 -d postgres \
  -c "ALTER ROLE \"$TARGET_ROLE\" BYPASSRLS;" >/dev/null

(
  cd "$REPO_ROOT"
  env -i \
    PATH="$SANITIZED_PATH" \
    HOME="$CALLER_HOME" \
    PNPM_HOME="$TOOLCHAIN_BIN" \
    NODE_ENV=development \
    CI=1 \
    DATABASE_URL="$DEV_DATABASE_URL" \
    API_ENV_FILE="$SAFE_MIGRATION_ENV" \
    WEBAPP_ENV_FILE="$SAFE_MIGRATION_ENV" \
    PGOPTIONS="-c role=$TARGET_ROLE" \
    PGHOST=127.0.0.1 \
    PGPORT=5432 \
    PGDATABASE="$TARGET_DB" \
    PGUSER="$TARGET_ROLE" \
    PGPASSFILE=/dev/null \
    PGCONNECT_TIMEOUT=10 \
    bash --noprofile --norc -c '
      set -Eeuo pipefail
      [[ "$(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atqc "SELECT current_user || '\''|'\'' || current_database();")" == "bcb_webapp_dev_user|bcb_webapp_dev" ]] || {
        echo "FATAL: sanitized migration child target guard failed" >&2
        exit 1
      }
      pnpm run migrate
      psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
        -f deploy/postgres/c4d-platform-lfk-media-owner-online-index.sql
    '
)

cleanup_elevation

# Reuse the canonical P2-B handoff and single shared runtime-overlay chain after migrations.
bash "$DEV_RUNTIME_OVERLAY_REHYDRATE" --execute

expected_drizzle_count="$(node -e '
  const fs = require("node:fs");
  const journal = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  if (!Array.isArray(journal.entries) || journal.entries.length < 1) process.exit(1);
  process.stdout.write(String(journal.entries.length));
' "$DRIZZLE_JOURNAL")" || fatal "failed to read Drizzle journal"

postcheck="$(psql "$DEV_DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atqc \
  "SELECT
     current_user,
     current_database(),
     (SELECT count(*) FROM drizzle.__drizzle_migrations),
     (SELECT count(*) FROM integrator.schema_migrations),
     to_regclass('public.idx_media_files_owner') IS NOT NULL;")" || fatal "DEV post-migration ledger check failed"
IFS='|' read -r post_user post_db drizzle_count integrator_count c4d_ready <<<"$postcheck"
[[ "$post_user" == "$TARGET_ROLE" && "$post_db" == "$TARGET_DB" ]] || fatal "DEV postcheck target drift"
[[ "$drizzle_count" =~ ^[0-9]+$ && "$drizzle_count" -ge "$expected_drizzle_count" ]] ||
  fatal "Drizzle migration ledger is behind the current journal"
[[ "$integrator_count" =~ ^[0-9]+$ && "$integrator_count" -ge 1 ]] ||
  fatal "integrator migration ledger is missing or empty"
[[ "$c4d_ready" == "t" ]] || fatal "C4D media owner online index is missing"

echo "migrate-dev: PASS (non-destructive schema migration and runtime closure complete)"
