#!/usr/bin/env bash
set -Eeuo pipefail
{ set +x; } 2>/dev/null
umask 077

# =============================================================================
# refresh-dev-from-test.sh
#
# Explicit owner-gated entrypoint that replaces the contents of the named DEV database
# `bcb_webapp_dev` with the accepted state of the named TEST database `bersoncarebot_test`.
#
# This is NOT an ordinary development step. Ordinary development keeps the existing DEV database and
# applies pending migrations with `deploy/host/migrate-dev.sh`. This entrypoint exists for one
# owner-gated moment: after a green TEST live acceptance, DEV is brought back onto the accepted data
# and examples in a single repo-managed action (owner decision recorded in
# `docs/_TODO/SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md`, step 6 of the corrective pass).
#
# What crosses the boundary and what does not:
#   crosses  -- accepted TEST product data/examples and the current schema B that carries them
#   stays    -- DEV environment state: DEV rows of every environment-owned system_settings key,
#               DEV's principal-context signing credential, DEV env files, DEV role passwords,
#               DEV declaration-owned ownership/ACL. TEST roles, ACLs and object owners are never
#               copied (`--no-owner --no-acl` on both the dump and the restore); TEST env files are
#               never read; the TEST environment lock objects are dropped on arrival.
#
# It orchestrates existing primitives and adds no second privilege generator, migration runner,
# secret registry or runtime-overlay list:
#   deploy/host/dev-owned-settings-policy.mjs           DEV-owned key policy, derived from the S5-0
#                                                       registry and the TEST environment overlay
#   deploy/postgres/dev-refresh-{capture,restore}-*.sql capture/restore of DEV-owned state
#   deploy/host/parse-dev-database-url.mjs              the four DEV runtime URLs -> reconcile env
#   deploy/postgres/privileges/generate-cli.mjs         shared cluster role baseline + verifier
#   deploy/postgres/privileges/reconcile-access.mjs     the one declaration reconcile + catalog audit
#
# The historical migration chain is never replayed and no disposable/scratch database is created.
#
# Usage:
#   bash deploy/host/refresh-dev-from-test.sh --check
#   bash deploy/host/refresh-dev-from-test.sh --execute --confirm-refresh-dev-from-test
#   bash deploy/host/refresh-dev-from-test.sh --rollback /abs/dev-before.dump \
#        --confirm-refresh-dev-from-test
# =============================================================================

SOURCE_DB="bersoncarebot_test"
TARGET_DB="bcb_webapp_dev"
DEV_TEST_HOST_IP="151.241.228.122"
PROD_HOST_IP="135.106.162.170"
ADMIN_SOCKET="/var/run/postgresql"
ADMIN_PORT="5432"
MIGRATOR_ROLE="bcb_dev_migrator"
OBJECT_OWNER_ROLE="app_object_owner"
CONFIRM_FLAG="--confirm-refresh-dev-from-test"
# The refresh and deploy/host/migrate-dev.sh are the only two entrypoints allowed to mutate the DEV
# database, so they share one host lock instead of inventing a second name that would not exclude
# the other one.
HOST_LOCK="/tmp/bcb-dev-migrate.$(id -u).lock"
DEV_TCP_PORTS=(5200 4200)

REPO_ROOT="$(realpath "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)")"
API_ENV="$REPO_ROOT/.env"
WEBAPP_ENV="$REPO_ROOT/apps/webapp/.env.dev"
DEV_ENV_PARSER="$REPO_ROOT/deploy/host/parse-dev-database-url.mjs"
SETTINGS_POLICY="$REPO_ROOT/deploy/host/dev-owned-settings-policy.mjs"
CAPTURE_SQL="$REPO_ROOT/deploy/postgres/dev-refresh-capture-dev-owned-state.sql"
RESTORE_SQL="$REPO_ROOT/deploy/postgres/dev-refresh-restore-dev-owned-state.sql"
PRIVILEGE_GENERATOR="$REPO_ROOT/deploy/postgres/privileges/generate-cli.mjs"
RECONCILER="$REPO_ROOT/deploy/postgres/privileges/reconcile-access.mjs"

MODE=""
CONFIRMED=0
ROLLBACK_DUMP=""
WORK_DIR=""
KEYS_DIR=""
CREDENTIAL_DIR=""
ACTIVE_CHILD_PID=""
DESTRUCTIVE_PHASE_STARTED=0
REFRESH_COMPLETE=0
TARGET_CONNECTION_LIMIT=""
API_ENV_DIGEST=""
WEBAPP_ENV_DIGEST=""

usage() {
  cat <<'EOF'
Usage: bash deploy/host/refresh-dev-from-test.sh --check
       bash deploy/host/refresh-dev-from-test.sh --execute --confirm-refresh-dev-from-test
       bash deploy/host/refresh-dev-from-test.sh --rollback <absolute-dump> \
            --confirm-refresh-dev-from-test

--check    Proves host, database and writer readiness and resolves the DEV-owned state policy.
           It changes nothing: no dump, no drop, no restore, no reconcile, no env write.
--execute  Destructive. Replaces bcb_webapp_dev with the accepted bersoncarebot_test state and
           puts DEV-owned environment state back. Requires the confirmation flag above.
--rollback Destructive. Restores bcb_webapp_dev from a pre-refresh snapshot this script produced,
           then reruns the declaration reconcile. Requires the confirmation flag above.

The refresh never reads TEST or PROD env files, never copies TEST roles/ACLs/owners, never writes
DEV env files and never replays the historical migration chain.
EOF
}

fatal() {
  printf 'FATAL: refresh-dev-from-test: %s\n' "$1" >&2
  exit 1
}

note() {
  printf 'refresh-dev-from-test: %s\n' "$1"
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

destroy_work_dir() {
  [[ -n "$WORK_DIR" ]] || return 0
  sudo -n -u postgres find "$WORK_DIR" -type f -exec shred -u -- {} + >/dev/null 2>&1 || true
  sudo -n -u postgres rm -rf -- "$WORK_DIR" >/dev/null 2>&1 || true
  WORK_DIR=""
}

cleanup_exit() {
  local original_status=$?
  trap - EXIT
  trap '' INT TERM HUP
  [[ -z "$CREDENTIAL_DIR" ]] || rm -rf -- "$CREDENTIAL_DIR"
  [[ -z "$KEYS_DIR" ]] || rm -rf -- "$KEYS_DIR"
  if [[ "$DESTRUCTIVE_PHASE_STARTED" == 1 && "$REFRESH_COMPLETE" != 1 ]]; then
    # The destructive phase started and did not finish. The target stays fail-closed at
    # CONNECTION LIMIT 0 and the pre-refresh snapshot is deliberately NOT shredded: it is the only
    # way back. Say exactly where it is and exactly how to use it.
    close_target || printf 'FATAL: refresh-dev-from-test: could not leave %s at CONNECTION LIMIT 0\n' \
      "$TARGET_DB" >&2
    printf 'refresh-dev-from-test: DEV is NOT usable. Recover with:\n' >&2
    printf '  bash %s --rollback %s %s\n' \
      "$REPO_ROOT/deploy/host/refresh-dev-from-test.sh" \
      "${WORK_DIR:-<snapshot directory was already removed>}/dev-before.dump" \
      "$CONFIRM_FLAG" >&2
    printf 'refresh-dev-from-test: shred %s yourself once DEV is proven healthy.\n' \
      "${WORK_DIR:-<none>}" >&2
    [[ "$original_status" -ne 0 ]] || original_status=70
  else
    destroy_work_dir
  fi
  exit "$original_status"
}

assert_canonical_file() {
  local path="$1"
  local label="$2"
  [[ ! -L "$path" && -f "$path" && "$(realpath "$path")" == "$path" ]] ||
    fatal "$label path guard failed: $path"
}

postgres_scalar() {
  local database="$1"
  shift
  sudo -n -u postgres psql -X -h "$ADMIN_SOCKET" -p "$ADMIN_PORT" -d "$database" \
    -v ON_ERROR_STOP=1 -Atqc "$1"
}

close_target() {
  sudo -n -u postgres psql -X -h "$ADMIN_SOCKET" -p "$ADMIN_PORT" -d postgres \
    -v ON_ERROR_STOP=1 -c \
    "ALTER DATABASE \"$TARGET_DB\" CONNECTION LIMIT 0;
     SELECT pg_terminate_backend(pid) FROM pg_catalog.pg_stat_activity
      WHERE datname = '$TARGET_DB' AND pid <> pg_backend_pid();" >/dev/null 2>&1
}

file_digest() {
  sha256sum -- "$1" | cut -d' ' -f1
}

# ---------------------------------------------------------------------------
# Argument parsing. The two database names are constants: there is no argument that can name a
# database, so no invocation can point this script at PROD, at TEST as the target, or at a
# disposable database.
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --check|--execute)
      [[ -z "$MODE" ]] || { usage >&2; exit 2; }
      MODE="${1#--}"
      shift
      ;;
    --rollback)
      [[ -z "$MODE" ]] || { usage >&2; exit 2; }
      [[ $# -ge 2 && -n "${2:-}" && "${2:0:2}" != "--" ]] || { usage >&2; exit 2; }
      MODE=rollback
      ROLLBACK_DUMP="$2"
      shift 2
      ;;
    "$CONFIRM_FLAG")
      CONFIRMED=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      usage >&2
      exit 2
      ;;
  esac
done

[[ -n "$MODE" ]] || { usage >&2; exit 2; }
if [[ "$MODE" == check && "$CONFIRMED" == 1 ]]; then
  fatal "$CONFIRM_FLAG is a destructive confirmation and is not accepted by --check"
fi
if [[ "$MODE" != check && "$CONFIRMED" != 1 ]]; then
  fatal "destructive $MODE of $TARGET_DB requires $CONFIRM_FLAG"
fi

# ---------------------------------------------------------------------------
# Identity gates. Every one of them runs in --check too, and none of them writes anything.
# ---------------------------------------------------------------------------
[[ "$EUID" -ne 0 ]] || fatal 'run this wrapper as the non-root repository owner'

for command in awk createdb dropdb find flock hostname mktemp node pg_dump pg_restore psql \
  realpath setsid sha256sum shred ss sudo wc; do
  command -v "$command" >/dev/null 2>&1 || fatal "required command is unavailable: $command"
done

hostname -I | tr ' ' '\n' | grep -Fxq "$DEV_TEST_HOST_IP" ||
  fatal "refusing outside the documented DEV/TEST host $DEV_TEST_HOST_IP"
if hostname -I | tr ' ' '\n' | grep -Fxq "$PROD_HOST_IP"; then
  fatal "this host answers for PROD $PROD_HOST_IP; the refresh has no PROD path and refuses here"
fi

[[ "$SOURCE_DB" != "$TARGET_DB" ]] || fatal 'source and target database must not be the same name'
[[ -d "$ADMIN_SOCKET" && ! -L "$ADMIN_SOCKET" ]] || fatal 'local PostgreSQL socket guard failed'

assert_canonical_file "$API_ENV" 'DEV API env'
assert_canonical_file "$WEBAPP_ENV" 'DEV webapp env'
assert_canonical_file "$DEV_ENV_PARSER" 'DEV env parser'
assert_canonical_file "$SETTINGS_POLICY" 'DEV-owned settings policy'
assert_canonical_file "$CAPTURE_SQL" 'DEV-owned state capture SQL'
assert_canonical_file "$RESTORE_SQL" 'DEV-owned state restore SQL'
assert_canonical_file "$PRIVILEGE_GENERATOR" 'privilege generator'
assert_canonical_file "$RECONCILER" 'access reconciler'
# The DEV env files are the repository's own; nothing under /opt/env (TEST or PROD) is ever read.
for env_path in "$API_ENV" "$WEBAPP_ENV"; do
  [[ "$env_path" == "$REPO_ROOT/"* ]] || fatal "DEV env must live in this checkout: $env_path"
done

exec 9>"$HOST_LOCK"
flock -n 9 || fatal 'another DEV database wrapper (refresh or migrate-dev) is already running'

# The connection is proven local before any identity claim is trusted.
local_connection="$(postgres_scalar postgres "SELECT (inet_server_addr() IS NULL)::text;")" ||
  fatal 'local PostgreSQL admin probe failed'
[[ "$local_connection" == true ]] || fatal 'admin channel is not the local unix socket'

target_identity="$(postgres_scalar postgres \
  "SELECT datname || '|' || pg_catalog.pg_get_userbyid(datdba) || '|' || datallowconn::text
     FROM pg_catalog.pg_database WHERE datname = '$TARGET_DB';")" ||
  fatal 'DEV identity probe failed'
[[ "$target_identity" == "$TARGET_DB|postgres|true" ]] ||
  fatal "DEV target must be the exact post-cutover $TARGET_DB owned by postgres"

source_identity="$(postgres_scalar postgres \
  "SELECT datname || '|' || datallowconn::text || '|' || datistemplate::text
     FROM pg_catalog.pg_database WHERE datname = '$SOURCE_DB';")" ||
  fatal 'TEST identity probe failed'
[[ "$source_identity" == "$SOURCE_DB|true|false" ]] ||
  fatal "TEST source must be the exact connectable $SOURCE_DB in this local cluster"

source_current="$(postgres_scalar "$SOURCE_DB" 'SELECT current_database();')" ||
  fatal 'TEST connectivity probe failed'
[[ "$source_current" == "$SOURCE_DB" ]] || fatal 'TEST connectivity probe returned another database'

migrator_state="$(postgres_scalar "$TARGET_DB" \
  "SELECT rolcanlogin::text || '|' || rolbypassrls::text || '|' || rolinherit::text || '|' ||
          (rolpassword IS NULL)::text
     FROM pg_catalog.pg_authid AS role WHERE rolname = '$MIGRATOR_ROLE';")" ||
  fatal 'cannot inspect DEV migrator'
[[ "$migrator_state" == "false|false|false|true" ]] ||
  fatal "$MIGRATOR_ROLE must stay NOLOGIN/NOBYPASSRLS/NOINHERIT and passwordless"

owner_state="$(postgres_scalar "$TARGET_DB" \
  "SELECT rolcanlogin::text || '|' || rolbypassrls::text || '|' || rolinherit::text
     FROM pg_catalog.pg_roles WHERE rolname = '$OBJECT_OWNER_ROLE';")" ||
  fatal 'cannot inspect DEV object owner'
[[ "$owner_state" == "false|false|false" ]] ||
  fatal "$OBJECT_OWNER_ROLE must be a stationary NOLOGIN/NOBYPASSRLS/NOINHERIT owner"

# ---------------------------------------------------------------------------
# Exactly one DEV writer. The wrapper never kills anything: DEV processes on this host are started
# by hand (there are no bersoncarebot-*-dev units), so the operator owns them and gets a named
# action instead of a broad pkill.
# ---------------------------------------------------------------------------
for port in "${DEV_TCP_PORTS[@]}"; do
  if [[ -n "$(ss -H -ltn "sport = :$port" 2>/dev/null || true)" ]]; then
    fatal "a DEV process is still listening on 127.0.0.1:$port. Stop it first (pnpm run dev:stop, \
and stop any worker/scheduler you started by hand), then rerun. This wrapper never kills processes."
  fi
done

foreign_backends="$(postgres_scalar postgres \
  "SELECT count(*)::text FROM pg_catalog.pg_stat_activity
    WHERE datname = '$TARGET_DB' AND pid <> pg_backend_pid() AND usename <> 'postgres';")" ||
  fatal 'DEV backend probe failed'
if [[ "$foreign_backends" != 0 ]]; then
  connected_roles="$(postgres_scalar postgres \
    "SELECT COALESCE(string_agg(DISTINCT usename, ','), '')
       FROM pg_catalog.pg_stat_activity
      WHERE datname = '$TARGET_DB' AND pid <> pg_backend_pid() AND usename <> 'postgres';")" || true
  fatal "$foreign_backends application backend(s) are still connected to $TARGET_DB \
(roles: ${connected_roles:-unknown}). Stop the DEV server/worker that owns them and rerun. \
This wrapper never terminates application backends outside its own destructive phase."
fi

# ---------------------------------------------------------------------------
# Private working state. Key lists are repository-public identifiers and live in a world-readable
# directory so the postgres-owned psql can \copy them. Everything that can carry a value lives in
# the postgres-owned directory that the invoking user cannot read at all.
# ---------------------------------------------------------------------------
trap cleanup_exit EXIT
trap 'handle_signal INT 130' INT
trap 'handle_signal TERM 143' TERM
trap 'handle_signal HUP 129' HUP
KEYS_DIR="$(mktemp -d /tmp/bcb-dev-refresh-keys.XXXXXX)" || fatal 'cannot create key list directory'
chmod 755 "$KEYS_DIR"
CREDENTIAL_DIR="$(mktemp -d /tmp/bcb-dev-refresh-credentials.XXXXXX)" ||
  fatal 'cannot create private DEV credential directory'
chmod 700 "$CREDENTIAL_DIR"

DEV_OWNED_KEY_FILE="$KEYS_DIR/dev-owned-keys.txt"
REGISTRY_KEY_FILE="$KEYS_DIR/registry-keys.txt"
node "$SETTINGS_POLICY" --dev-owned-keys >"$DEV_OWNED_KEY_FILE" ||
  fatal 'DEV-owned settings policy could not be derived from the registry and the TEST overlay'
node "$SETTINGS_POLICY" --registry-keys >"$REGISTRY_KEY_FILE" ||
  fatal 'settings registry key list could not be derived'
chmod 644 "$DEV_OWNED_KEY_FILE" "$REGISTRY_KEY_FILE"
[[ -s "$DEV_OWNED_KEY_FILE" && -s "$REGISTRY_KEY_FILE" ]] ||
  fatal 'DEV-owned settings policy resolved to an empty key list'

RECONCILE_ENV="$CREDENTIAL_DIR/reconcile.env"
node "$DEV_ENV_PARSER" --write-reconcile-env "$API_ENV" "$WEBAPP_ENV" "$RECONCILE_ENV" ||
  fatal 'DEV runtime URL parser rejected the canonical env files'
API_ENV_DIGEST="$(file_digest "$API_ENV")"
WEBAPP_ENV_DIGEST="$(file_digest "$WEBAPP_ENV")"

assert_env_untouched() {
  [[ "$(file_digest "$API_ENV")" == "$API_ENV_DIGEST" ]] ||
    fatal 'DEV API env changed during the refresh; this wrapper must never write env files'
  [[ "$(file_digest "$WEBAPP_ENV")" == "$WEBAPP_ENV_DIGEST" ]] ||
    fatal 'DEV webapp env changed during the refresh; this wrapper must never write env files'
}

NODE_BIN_DIR="$(dirname "$(command -v node)")"
SANITIZED_PATH="$NODE_BIN_DIR:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

reconcile_declaration() {
  # The one declaration reconcile in this repository. It reapplies the exact declared ownership,
  # ACLs, policies, memberships and the four DEV login passwords, and it ends the same transaction
  # with --port-context-verify, --env-verify and --catalog-closure-verify. That verified commit is
  # the proof of the final role/privilege state; this wrapper renders no privileges of its own.
  run_tracked bash -c '
    set -Eeuo pipefail
    node --experimental-strip-types "$1" --shared-role-baseline |
      sudo -n -u postgres psql -X -1 -h "$2" -p "$3" -d postgres -v ON_ERROR_STOP=1
    node --experimental-strip-types "$1" --shared-role-verify |
      sudo -n -u postgres psql -X -1 -h "$2" -p "$3" -d postgres -v ON_ERROR_STOP=1
  ' bash "$PRIVILEGE_GENERATOR" "$ADMIN_SOCKET" "$ADMIN_PORT"

  run_tracked bash -o pipefail -c '
    node --experimental-strip-types "$1" --db "$2" --relation-wall-registry-seed-only |
      sudo -n -u postgres psql -X -1 -h "$3" -p "$4" -d "$2" -v ON_ERROR_STOP=1
  ' bash "$PRIVILEGE_GENERATOR" "$TARGET_DB" "$ADMIN_SOCKET" "$ADMIN_PORT"

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

  local stationary
  stationary="$(postgres_scalar "$TARGET_DB" \
    "SELECT rolcanlogin::text || '|' || rolbypassrls::text || '|' || rolinherit::text || '|' ||
            (rolpassword IS NULL)::text || '|' ||
            (SELECT count(*) FROM pg_catalog.pg_auth_members WHERE member = role.oid)::text
       FROM pg_catalog.pg_authid AS role WHERE rolname = '$MIGRATOR_ROLE';")" ||
    fatal 'cannot verify stationary DEV migrator after reconcile'
  [[ "$stationary" == "false|false|false|true|0" ]] ||
    fatal "$MIGRATOR_ROLE retained a capability after reconcile"
}

open_work_dir() {
  WORK_DIR="$(sudo -n -u postgres mktemp -d /tmp/bcb-dev-refresh.XXXXXX)" ||
    fatal 'cannot create the private postgres-owned working directory'
  [[ "$WORK_DIR" == /tmp/bcb-dev-refresh.* ]] || fatal 'working directory path guard failed'
  sudo -n -u postgres chmod 700 "$WORK_DIR" || fatal 'cannot lock down the working directory'
}

verify_custom_archive() {
  local archive="$1"
  local label="$2"
  sudo -n -u postgres test -f "$archive" || fatal "$label was not written"
  sudo -n -u postgres pg_restore --list "$archive" >/dev/null ||
    fatal "$label is not a readable PostgreSQL custom archive"
  [[ "$(sudo -n -u postgres head -c5 -- "$archive")" == PGDMP ]] ||
    fatal "$label does not carry the custom-archive magic"
  sudo -n -u postgres chmod 600 "$archive" || fatal "cannot lock down $label"
}

restore_target_from_archive() {
  # Shared destructive restore body for the refresh and for the rollback. Callers set
  # DESTRUCTIVE_PHASE_STARTED before calling.
  local archive="$1"
  shift
  sudo -n -u postgres psql -X -h "$ADMIN_SOCKET" -p "$ADMIN_PORT" -d postgres -v ON_ERROR_STOP=1 -c \
    "ALTER DATABASE \"$TARGET_DB\" CONNECTION LIMIT 0;
     SELECT pg_terminate_backend(pid) FROM pg_catalog.pg_stat_activity
      WHERE datname = '$TARGET_DB' AND pid <> pg_backend_pid();" >/dev/null ||
    fatal 'could not close the DEV target before the restore'
  run_tracked sudo -n -u postgres dropdb -h "$ADMIN_SOCKET" -p "$ADMIN_PORT" \
    --if-exists "$TARGET_DB" || fatal 'could not drop the DEV target'
  run_tracked sudo -n -u postgres createdb -h "$ADMIN_SOCKET" -p "$ADMIN_PORT" \
    --owner=postgres --template=template0 "$TARGET_DB" || fatal 'could not recreate the DEV target'
  sudo -n -u postgres psql -X -h "$ADMIN_SOCKET" -p "$ADMIN_PORT" -d "$TARGET_DB" \
    -v ON_ERROR_STOP=1 >/dev/null <<'SQL' || fatal 'could not install the base extensions'
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
SQL
  run_tracked sudo -n -u postgres pg_restore --exit-on-error --no-comments \
    --role=postgres --dbname="$TARGET_DB" "$@" "$archive" ||
    fatal 'restore into the DEV target failed'
}

reopen_target() {
  sudo -n -u postgres psql -X -h "$ADMIN_SOCKET" -p "$ADMIN_PORT" -d postgres -v ON_ERROR_STOP=1 \
    -c "ALTER DATABASE \"$TARGET_DB\" CONNECTION LIMIT ${TARGET_CONNECTION_LIMIT};" >/dev/null ||
    fatal 'could not restore the DEV connection limit'
}

capture_target_connection_limit() {
  TARGET_CONNECTION_LIMIT="$(postgres_scalar postgres \
    "SELECT datconnlimit::text FROM pg_catalog.pg_database WHERE datname = '$TARGET_DB';")" ||
    fatal 'could not capture the DEV connection limit'
  [[ "$TARGET_CONNECTION_LIMIT" =~ ^-?[0-9]+$ ]] || fatal 'DEV connection limit probe is unusable'
  [[ "$TARGET_CONNECTION_LIMIT" != 0 ]] ||
    fatal "$TARGET_DB is already fail-closed at CONNECTION LIMIT 0; finish the previous recovery first"
}

# ---------------------------------------------------------------------------
# --check ends here. Nothing above wrote to a database, an env file or a dump.
# ---------------------------------------------------------------------------
if [[ "$MODE" == check ]]; then
  dev_owned_key_count="$(wc -l <"$DEV_OWNED_KEY_FILE")"
  registry_key_count="$(wc -l <"$REGISTRY_KEY_FILE")"
  capture_target_connection_limit
  assert_env_untouched
  note "check: PASS (host=$DEV_TEST_HOST_IP source=$SOURCE_DB target=$TARGET_DB \
dev_owned_keys=$dev_owned_key_count registry_keys=$registry_key_count \
target_connection_limit=$TARGET_CONNECTION_LIMIT; no DEV writer; nothing changed)"
  note "check: run the refresh with --execute $CONFIRM_FLAG"
  exit 0
fi

# ---------------------------------------------------------------------------
# --rollback: recover the target from a snapshot this script produced.
# ---------------------------------------------------------------------------
if [[ "$MODE" == rollback ]]; then
  [[ "$ROLLBACK_DUMP" = /* ]] || fatal 'the rollback snapshot path must be absolute'
  [[ ! -L "$ROLLBACK_DUMP" ]] || fatal 'the rollback snapshot must not be a symlink'
  verify_custom_archive "$ROLLBACK_DUMP" 'rollback snapshot'
  TARGET_CONNECTION_LIMIT="$(postgres_scalar postgres \
    "SELECT datconnlimit::text FROM pg_catalog.pg_database WHERE datname = '$TARGET_DB';")" ||
    fatal 'could not read the DEV connection limit'
  [[ "$TARGET_CONNECTION_LIMIT" =~ ^-?[0-9]+$ ]] || fatal 'DEV connection limit probe is unusable'
  [[ "$TARGET_CONNECTION_LIMIT" != 0 ]] || TARGET_CONNECTION_LIMIT=-1

  note 'rollback: restoring the DEV target from the pre-refresh snapshot'
  DESTRUCTIVE_PHASE_STARTED=1
  # The snapshot is DEV's own pg_dump, so its owners and ACLs are DEV's own and are restored as-is.
  restore_target_from_archive "$ROLLBACK_DUMP"
  note 'rollback: declaration reconcile and catalog audit'
  reconcile_declaration
  reopen_target
  assert_env_untouched
  REFRESH_COMPLETE=1
  note "rollback: PASS ($TARGET_DB restored from the snapshot; declaration reconciled and \
catalog-audited; connection limit $TARGET_CONNECTION_LIMIT). The snapshot file was left in place."
  exit 0
fi

# ---------------------------------------------------------------------------
# --execute
# ---------------------------------------------------------------------------
capture_target_connection_limit
open_work_dir

DEV_SNAPSHOT="$WORK_DIR/dev-before.dump"
TEST_TRANSPORT="$WORK_DIR/test-source.dump"
DEV_SETTINGS="$WORK_DIR/dev-owned-settings.tsv"
DEV_SIGNING_SECRET="$WORK_DIR/dev-signing-secret.tsv"
DEV_HAS_SIGNING_SECRET="$WORK_DIR/dev-has-signing-secret.txt"

note 'execute: capturing DEV-owned environment state'
# The repository lives under /home/dev with mode 0700, so the postgres OS user cannot open a repo
# path. Every repository SQL primitive is therefore read by this user and handed to psql on stdin,
# the same way migrate-dev.sh and reconcile-access.mjs already do it.
run_tracked sudo -n -u postgres psql -X -h "$ADMIN_SOCKET" -p "$ADMIN_PORT" -d "$TARGET_DB" \
  -v ON_ERROR_STOP=1 \
  -v dev_owned_key_file="$DEV_OWNED_KEY_FILE" \
  -v registry_key_file="$REGISTRY_KEY_FILE" \
  -v settings_out="$DEV_SETTINGS" \
  -v signing_secret_out="$DEV_SIGNING_SECRET" \
  -v has_signing_secret_out="$DEV_HAS_SIGNING_SECRET" \
  <"$CAPTURE_SQL" >/dev/null ||
  fatal 'capture of DEV-owned environment state failed'
for captured in "$DEV_SETTINGS" "$DEV_SIGNING_SECRET" "$DEV_HAS_SIGNING_SECRET"; do
  sudo -n -u postgres test -f "$captured" || fatal 'capture did not produce its output files'
  sudo -n -u postgres chmod 600 "$captured" || fatal 'cannot lock down the captured DEV state'
done
DEV_OWNED_ROWS="$(sudo -n -u postgres wc -l -- "$DEV_SETTINGS" | awk '{print $1}')" ||
  fatal 'cannot count the captured DEV-owned rows'
[[ "$DEV_OWNED_ROWS" =~ ^[0-9]+$ && "$DEV_OWNED_ROWS" -gt 0 ]] ||
  fatal "DEV carries no environment-owned settings row; refusing to hand TEST environment state to DEV on an empty capture"
DEV_HAD_SIGNING_SECRET="$(sudo -n -u postgres cat "$DEV_HAS_SIGNING_SECRET")" ||
  fatal 'cannot read the signing-secret presence marker'
[[ "$DEV_HAD_SIGNING_SECRET" == true || "$DEV_HAD_SIGNING_SECRET" == false ]] ||
  fatal 'signing-secret presence marker is unusable'

note 'execute: taking the protected pre-refresh DEV snapshot'
run_tracked sudo -n -u postgres pg_dump -Fc -h "$ADMIN_SOCKET" -p "$ADMIN_PORT" \
  -d "$TARGET_DB" -f "$DEV_SNAPSHOT" || fatal 'pre-refresh DEV snapshot failed'
verify_custom_archive "$DEV_SNAPSHOT" 'pre-refresh DEV snapshot'

note 'execute: dumping the accepted TEST state without roles, ACLs or owners'
run_tracked sudo -n -u postgres pg_dump -Fc --no-owner --no-acl -h "$ADMIN_SOCKET" -p "$ADMIN_PORT" \
  -d "$SOURCE_DB" -f "$TEST_TRANSPORT" || fatal 'TEST transport dump failed'
verify_custom_archive "$TEST_TRANSPORT" 'TEST transport dump'

note 'execute: replacing the DEV target (destructive phase begins)'
DESTRUCTIVE_PHASE_STARTED=1
restore_target_from_archive "$TEST_TRANSPORT" --no-owner --no-acl

note 'execute: returning DEV-owned environment state'
run_tracked sudo -n -u postgres psql -X -h "$ADMIN_SOCKET" -p "$ADMIN_PORT" -d "$TARGET_DB" \
  -v ON_ERROR_STOP=1 \
  -v dev_owned_key_file="$DEV_OWNED_KEY_FILE" \
  -v registry_key_file="$REGISTRY_KEY_FILE" \
  -v settings_in="$DEV_SETTINGS" \
  -v signing_secret_in="$DEV_SIGNING_SECRET" \
  -v dev_had_signing_secret="$DEV_HAD_SIGNING_SECRET" \
  <"$RESTORE_SQL" >/dev/null ||
  fatal 'restore of DEV-owned environment state failed'

test_lock_present="$(postgres_scalar "$TARGET_DB" \
  "SELECT (to_regprocedure('public.system_settings_test_lock_guard()') IS NOT NULL)::text;")" ||
  fatal 'could not verify that the TEST environment lock is gone'
[[ "$test_lock_present" == false ]] ||
  fatal 'the TEST environment lock survived into DEV'

note 'execute: declaration reconcile, ACL rebuild and catalog audit'
reconcile_declaration
reopen_target
assert_env_untouched

REFRESH_COMPLETE=1
note "execute: PASS (source=$SOURCE_DB target=$TARGET_DB \
dev_owned_settings_preserved=$DEV_OWNED_ROWS dev_signing_secret_repinned=$DEV_HAD_SIGNING_SECRET \
connection_limit=$TARGET_CONNECTION_LIMIT; TEST roles/ACLs/owners not copied; \
declaration reconciled and catalog-audited)"
note "execute: apply any migrations this checkout adds on top of the accepted TEST schema with \
bash deploy/host/migrate-dev.sh --preflight, then --execute"
