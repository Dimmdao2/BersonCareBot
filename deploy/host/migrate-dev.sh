#!/usr/bin/env bash
set -Eeuo pipefail
{ set +x; } 2>/dev/null
umask 077

# Apply ordinary pending migrations to the existing post-cutover DEV database.
# This entrypoint never restores, drops, recreates or copies a database.  It uses only the local
# PostgreSQL administrator channel: integrator DDL runs as app_object_owner, while webapp Drizzle
# statements run through the declaration-owner-aware NOLOGIN bcb_dev_migrator. Preflight compiles
# pending webapp DDL in one transaction and rolls it back. The declaration reconcile is the final
# mandatory execute step, so newly-created objects cannot retain migration access.

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
PRIVILEGE_GENERATOR="$REPO_ROOT/deploy/postgres/privileges/generate-cli.mjs"
PORT_CONTEXT_ENV_UPDATER="$REPO_ROOT/deploy/host/update-dev-port-context-env.mjs"
DRIZZLE_FOLDER="$REPO_ROOT/apps/webapp/db/drizzle-migrations"
CREDENTIAL_DIR=""
ACTIVE_CHILD_PID=""

usage() {
  cat <<'EOF'
Usage: bash deploy/host/migrate-dev.sh --preflight|--execute
         [--apply-out-of-order <tag>]... [--reapply <tag>]...

Validates the exact existing local bcb_webapp_dev target. --preflight executes pending
webapp Drizzle DDL through the NOLOGIN bcb_dev_migrator and its declared owners in a
single transaction ending in ROLLBACK. --execute applies pending integrator and webapp
migrations, then atomically reconciles and audits the declaration-owned access state.

The two recovery options are forwarded verbatim to the owner-ordered migrator, which is the
only thing that accepts them; they exist so a ledger that has drifted from the journal
(--apply-out-of-order) or from the catalog (--reapply) can be repaired through this whole
route -- preflight, reconcile and port-context env included -- instead of beside it.

--reapply names a migration the ledger claims but the database does not answer for, and
sends it through the wrapper again. It is only available with --execute, because the
declaration reconcile that follows is what gives a rebuilt definer function back its
attestation seam and its EXECUTE grant.
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
if [[ $# -lt 1 || ( "$MODE" != "--preflight" && "$MODE" != "--execute" ) ]]; then
  usage
  exit 2
fi
shift
# Nothing but the two named recovery options may ride along, and each one must name its tag: the
# migrator refuses a tag it has not itself reported as stranded or drifted, so a stale flag left in
# a command line cannot quietly re-run anything.
#
# --reapply lives here and not on the wrapper because rebuilding an object from its migration file
# rebuilds only what the file says. A declaration-owned definer function is more than that: the
# attestation wrapper in its body and the EXECUTE grant for the role that calls it arrive with the
# privilege declaration. Reapplied by the bare wrapper, the function comes back without either -- the
# recovery leaves the object weaker than the hole it repaired. This entrypoint always reconciles the
# declaration as its last execute step, which is what makes the recovery whole.
#
# The tag pattern accepts both naming schemes on purpose: a recovery names a tag that is ALREADY in
# the ledger, and the ledger still carries the frozen historical NNNN_ names alongside the current
# timestamp scheme. This is the one place old names stay legal; new migrations are never named that way.
RECOVERY_ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply-out-of-order|--reapply)
      [[ $# -ge 2 && -n "${2:-}" && "${2:0:2}" != "--" ]] || { usage; exit 2; }
      [[ "$2" =~ ^[0-9]{4}[a-z0-9]*_[a-z0-9_]+$ || "$2" =~ ^[0-9]{8}T[0-9]{6}_[a-z0-9_]+$ ]] \
        || fatal "$1 tag is not a migration name: $2"
      RECOVERY_ARGS+=("$1" "$2")
      shift 2
      ;;
    *)
      usage
      exit 2
      ;;
  esac
done
if [[ "$MODE" == "--preflight" && ${#RECOVERY_ARGS[@]} -gt 0 ]]; then
  fatal 'a recovery option is not a validation: run it with --execute so the declaration reconcile follows'
fi
# The wrapper refuses a recovery option without this marker, so a bare `node migrate-local.mjs
# --reapply` can no longer strip a definer function of its seam and its EXECUTE grant and call it a repair.
export BCB_MIGRATION_ENTRYPOINT=migrate-dev.sh

[[ "$EUID" -ne 0 ]] || fatal "run this wrapper as the non-root repository owner"
[[ -d "$ADMIN_SOCKET" && ! -L "$ADMIN_SOCKET" ]] || fatal "local PostgreSQL socket guard failed"

assert_canonical_file "$API_ENV" "$REPO_ROOT/.env" "DEV API env"
assert_canonical_file "$WEBAPP_ENV" "$REPO_ROOT/apps/webapp/.env.dev" "DEV webapp env"
assert_canonical_file "$DEV_ENV_PARSER" "$REPO_ROOT/deploy/host/parse-dev-database-url.mjs" "DEV env parser"
assert_canonical_file "$OWNER_MIGRATOR" "$REPO_ROOT/deploy/postgres/privileges/migrate-local.mjs" "owner-ordered migrator"
assert_canonical_file "$INTEGRATOR_MIGRATOR" "$REPO_ROOT/deploy/postgres/privileges/migrate-integrator-local.mjs" "integrator migrator"
assert_canonical_file "$RECONCILER" "$REPO_ROOT/deploy/postgres/privileges/reconcile-access.mjs" "access reconciler"
assert_canonical_file "$PRIVILEGE_GENERATOR" "$REPO_ROOT/deploy/postgres/privileges/generate-cli.mjs" "privilege generator"
assert_canonical_file "$PORT_CONTEXT_ENV_UPDATER" "$REPO_ROOT/deploy/host/update-dev-port-context-env.mjs" "DEV port-context env updater"
[[ ! -L "$DRIZZLE_FOLDER" && -d "$DRIZZLE_FOLDER" ]] || fatal "Drizzle migrations path guard failed"

for command in flock mktemp node psql realpath setsid sudo; do
  command -v "$command" >/dev/null 2>&1 || fatal "required command is unavailable: $command"
done

exec 9>"/tmp/bcb-dev-migrate.$(id -u).lock"
flock -n 9 || fatal "another DEV migration wrapper is already running"

NODE_BIN_DIR="$(dirname "$(command -v node)")"
SANITIZED_PATH="$NODE_BIN_DIR:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

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
  run_tracked node "$OWNER_MIGRATOR" \
    --db "$TARGET_DB" \
    --migrator "$MIGRATOR_ROLE" \
    --drizzle-folder "$DRIZZLE_FOLDER" \
    --sudo-postgres \
    --rollback-only \
    ${RECOVERY_ARGS[@]+"${RECOVERY_ARGS[@]}"}
  echo "migrate-dev preflight: PASS (post-cutover DEV; rollback-only webapp DDL validation complete)"
  exit 0
fi

cd "$REPO_ROOT"

# Cluster roles are shared by DEV and TEST and may be added by the declaration between ordinary
# deploys. Install the declaration baseline explicitly before a migration can assign ownership or
# the per-database reconciler can grant a newly introduced capability to one of the four port logins.
run_tracked bash -c '
  set -Eeuo pipefail
  node --experimental-strip-types "$1" --shared-role-baseline |
    sudo -n -u postgres psql -X -1 -d postgres -v ON_ERROR_STOP=1
  node --experimental-strip-types "$1" --shared-role-verify |
    sudo -n -u postgres psql -X -1 -d postgres -v ON_ERROR_STOP=1
' bash "$PRIVILEGE_GENERATOR"

# Preserve the repository's cross-app dependency order without using any runtime login.
run_tracked node "$INTEGRATOR_MIGRATOR" \
  --db "$TARGET_DB" --migrator "$MIGRATOR_ROLE" --owner "$OBJECT_OWNER_ROLE" \
  --root "$REPO_ROOT/apps/integrator" --before-date 20260708 --sudo-postgres
run_tracked node "$OWNER_MIGRATOR" \
  --db "$TARGET_DB" \
  --migrator "$MIGRATOR_ROLE" \
  --drizzle-folder "$DRIZZLE_FOLDER" \
  --sudo-postgres \
  ${RECOVERY_ARGS[@]+"${RECOVERY_ARGS[@]}"}
run_tracked node "$INTEGRATOR_MIGRATOR" \
  --db "$TARGET_DB" --migrator "$MIGRATOR_ROLE" --owner "$OBJECT_OWNER_ROLE" \
  --root "$REPO_ROOT/apps/integrator" --sudo-postgres

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

# Runtime descriptors are a generated projection of the same declaration as the DB catalog. Keep
# both software ports synchronized before either process is allowed to restart.
run_tracked node --experimental-strip-types "$PORT_CONTEXT_ENV_UPDATER"

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
