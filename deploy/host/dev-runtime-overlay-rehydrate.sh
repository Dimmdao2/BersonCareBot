#!/usr/bin/env bash
set -Eeuo pipefail

# Reapply the canonical post-migration runtime SQL closure to the exact local DEV DB.
# This does not restore/dump/reset a database, touch application rows, or open TEST/PROD.

TARGET_DB="bcb_webapp_dev"
TARGET_OWNER_ROLE="bcb_webapp_dev_user"
TARGET_RUNTIME_ROLE="app_runtime_nonstaff_login"
REPO_ROOT="$(realpath "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)")"
DEV_ENV="$REPO_ROOT/apps/webapp/.env.dev"
DEV_ENV_PARSER="$REPO_ROOT/deploy/host/parse-dev-database-url.mjs"
RUNTIME_OVERLAY_LIB="$REPO_ROOT/deploy/host/runtime-overlay-rehydrate-lib.sh"
P0_5B_GRANTS="$REPO_ROOT/deploy/postgres/p0-5b-grants.sql"
POSTGRES=(sudo -n -u postgres env -i PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin)

usage() {
  cat <<EOF
Usage:
  bash deploy/host/dev-runtime-overlay-rehydrate.sh --preflight
  bash deploy/host/dev-runtime-overlay-rehydrate.sh --execute

Reapplies the canonical runtime grants/helpers/E1 overlay closure to exactly $TARGET_DB.
It never restores, recreates or dumps a database and never opens TEST, PROD or /opt/env.
EOF
}

if [[ $# -ne 1 || ( "${1:-}" != "--preflight" && "${1:-}" != "--execute" ) ]]; then
  usage
  exit 2
fi
MODE="$1"

if [[ "$EUID" -eq 0 ]]; then
  echo "FATAL: run this DEV-only wrapper as the non-root repository owner" >&2
  exit 1
fi

for command in sudo psql node realpath getent id cut dirname env awk; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "FATAL: required command is unavailable: $command" >&2
    exit 1
  }
done

for guarded_file in \
  "$DEV_ENV|$REPO_ROOT/apps/webapp/.env.dev|DEV env" \
  "$DEV_ENV_PARSER|$REPO_ROOT/deploy/host/parse-dev-database-url.mjs|DEV env parser" \
  "$RUNTIME_OVERLAY_LIB|$REPO_ROOT/deploy/host/runtime-overlay-rehydrate-lib.sh|runtime overlay library" \
  "$P0_5B_GRANTS|$REPO_ROOT/deploy/postgres/p0-5b-grants.sql|P0.5b grants"; do
  IFS='|' read -r guarded_path expected_path guarded_label <<<"$guarded_file"
  if [[ -L "$guarded_path" || ! -f "$guarded_path" || "$(realpath "$guarded_path")" != "$expected_path" ]]; then
    echo "FATAL: $guarded_label path guard failed" >&2
    exit 1
  fi
done

# shellcheck source=deploy/host/runtime-overlay-rehydrate-lib.sh
source "$RUNTIME_OVERLAY_LIB"

CALLER_HOME="$(getent passwd "$(id -un)" | cut -d: -f6)"
NODE_BIN="$(type -P node)"
PSQL_BIN="$(type -P psql)"
NODE_TOOLCHAIN_BIN="$(realpath "$(dirname "$NODE_BIN")")"
if [[ -z "$CALLER_HOME" || ! -d "$CALLER_HOME" ]]; then
  echo "FATAL: caller HOME guard failed" >&2
  exit 1
fi
SANITIZED_PATH="$NODE_TOOLCHAIN_BIN:/usr/local/bin:/usr/bin:/bin"

DEV_OWNER_DATABASE_URL="$("$NODE_BIN" "$DEV_ENV_PARSER" "$DEV_ENV")" || {
  echo "FATAL: DEV owner DATABASE_URL data parser rejected the env file" >&2
  exit 1
}
DEV_RUNTIME_DATABASE_URL="$("$NODE_BIN" "$DEV_ENV_PARSER" --nonstaff "$DEV_ENV")" || {
  echo "FATAL: DEV DATABASE_URL_NONSTAFF data parser rejected the env file" >&2
  exit 1
}

run_dev_owner_psql() {
  env -i \
    PATH="$SANITIZED_PATH" \
    HOME="$CALLER_HOME" \
    PGPASSFILE=/dev/null \
    PGCONNECT_TIMEOUT=10 \
    "$PSQL_BIN" "$DEV_OWNER_DATABASE_URL" -X -v ON_ERROR_STOP=1 "$@"
}

run_dev_runtime_psql() {
  env -i \
    PATH="$SANITIZED_PATH" \
    HOME="$CALLER_HOME" \
    PGPASSFILE=/dev/null \
    PGCONNECT_TIMEOUT=10 \
    "$PSQL_BIN" "$DEV_RUNTIME_DATABASE_URL" -X -v ON_ERROR_STOP=1 "$@"
}

run_dev_admin_psql() {
  "${POSTGRES[@]}" psql -X -v ON_ERROR_STOP=1 "$@"
}

runtime_overlay_admin_psql() {
  run_dev_admin_psql "$@"
}

owner_identity="$(run_dev_owner_psql -Atc "SELECT current_user || '|' || current_database();" 2>/dev/null)"
owner_role="$(runtime_overlay_parse_database_identity "DEV owner DATABASE_URL" "$TARGET_DB" "$owner_identity")"
if [[ "$owner_role" != "$TARGET_OWNER_ROLE" ]]; then
  echo "FATAL: DEV owner role is '$owner_role', expected '$TARGET_OWNER_ROLE'" >&2
  exit 1
fi

runtime_identity="$(run_dev_runtime_psql -Atc "SELECT current_user || '|' || current_database();" 2>/dev/null)"
runtime_role="$(runtime_overlay_parse_database_identity "DEV DATABASE_URL_NONSTAFF" "$TARGET_DB" "$runtime_identity")"
if [[ "$runtime_role" != "$TARGET_RUNTIME_ROLE" ]]; then
  echo "FATAL: DEV runtime role is '$runtime_role', expected '$TARGET_RUNTIME_ROLE'" >&2
  exit 1
fi
runtime_overlay_assert_separate_roles "DEV" "$owner_role" "$runtime_role"

admin_database="$(run_dev_admin_psql -d "$TARGET_DB" -Atc 'SELECT current_database();' 2>/dev/null)"
if [[ "$admin_database" != "$TARGET_DB" ]]; then
  echo "FATAL: PostgreSQL operator exact DEV database guard failed" >&2
  exit 1
fi

# Read-only preflight. Global role creation/rewiring is deliberately not performed here: these roles
# are shared by databases in the local cluster, so a DEV repair may only validate them.
run_dev_admin_psql -d "$TARGET_DB" -qAt \
  -v expected_owner_role="$TARGET_OWNER_ROLE" \
  -v expected_runtime_role="$TARGET_RUNTIME_ROLE" <<'SQL' >/dev/null
SELECT 1 / (
  pg_get_userbyid((SELECT datdba FROM pg_database WHERE datname = current_database())) = :'expected_owner_role'
)::int AS dev_database_owner_exact;

SELECT 1 / (
  EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'app_owner' AND NOT rolcanlogin AND rolbypassrls AND NOT rolsuper
  )
  AND EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'app_staff' AND rolcanlogin AND NOT rolbypassrls AND NOT rolsuper
  )
  AND EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'app_patient' AND rolcanlogin AND NOT rolbypassrls AND NOT rolsuper
  )
  AND NOT pg_has_role('app_patient', 'app_staff', 'MEMBER')
)::int AS dev_runtime_roles_safe;

SELECT 1 / (
  :'expected_runtime_role' <> :'expected_owner_role'
  AND :'expected_runtime_role' NOT IN ('app_owner', 'app_staff', 'app_patient')
  AND EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = :'expected_runtime_role'
      AND rolcanlogin
      AND NOT rolinherit
      AND NOT rolsuper
      AND NOT rolcreatedb
      AND NOT rolcreaterole
      AND NOT rolreplication
      AND NOT rolbypassrls
  )
  AND NOT pg_has_role(:'expected_runtime_role', :'expected_owner_role', 'MEMBER')
  AND NOT pg_has_role(:'expected_runtime_role', 'app_owner', 'MEMBER')
  AND NOT pg_has_role(:'expected_runtime_role', 'app_staff', 'MEMBER')
  AND pg_has_role(:'expected_runtime_role', 'app_patient', 'MEMBER')
  AND 1 = (
    SELECT count(*)
    FROM pg_auth_members membership
    JOIN pg_roles member_role ON member_role.oid = membership.member
    JOIN pg_roles granted_role ON granted_role.oid = membership.roleid
    WHERE member_role.rolname = :'expected_runtime_role'
      AND granted_role.rolname = 'app_patient'
      AND NOT membership.admin_option
      AND NOT membership.inherit_option
      AND membership.set_option
  )
  AND 1 = (
    SELECT count(*)
    FROM pg_auth_members membership
    JOIN pg_roles member_role ON member_role.oid = membership.member
    WHERE member_role.rolname = :'expected_runtime_role'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    JOIN pg_roles owner_role ON owner_role.oid = relation.relowner
    WHERE owner_role.rolname = :'expected_runtime_role'
      AND namespace.nspname IN ('public', 'integrator', 'app')
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_class relation
    WHERE relation.oid IN (
      to_regclass('public.app_runtime_settings'),
      to_regclass('public.system_settings')
    )
      AND pg_has_role(:'expected_runtime_role', relation.relowner, 'MEMBER')
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_proc procedure
    JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
    JOIN pg_roles owner_role ON owner_role.oid = procedure.proowner
    WHERE owner_role.rolname = :'expected_runtime_role'
      AND namespace.nspname IN ('public', 'integrator', 'app')
  )
)::int AS dev_base_runtime_role_safe_before_overlay;
SQL

if [[ "$MODE" == "--preflight" ]]; then
  echo "[dev-runtime-overlay] PASS: separate DEV owner/runtime topology is safe"
  exit 0
fi

run_dev_admin_psql -d "$TARGET_DB" -qAt \
  -v expected_runtime_role="$TARGET_RUNTIME_ROLE" <<'SQL' >/dev/null
SELECT 1 / (
  to_regprocedure('app.release_principal_context()') IS NOT NULL
  AND to_regprocedure('app.current_org_id()') IS NOT NULL
  AND to_regprocedure('app.current_patient_user_id()') IS NOT NULL
  AND to_regprocedure('app.current_integrator_user_id()') IS NOT NULL
  AND to_regprocedure('app.is_staff()') IS NOT NULL
)::int AS dev_protected_context_bundle_complete;

SELECT 1 / (
  NOT pg_has_role(:'expected_runtime_role', 'app_staff', 'SET')
  AND pg_has_role(:'expected_runtime_role', 'app_patient', 'SET')
)::int AS dev_runtime_patient_role_boundary;
SQL

echo "[dev-runtime-overlay] applying canonical per-database role grants"
run_dev_admin_psql -d "$TARGET_DB" -f "$P0_5B_GRANTS" >/dev/null

echo "[dev-runtime-overlay] applying shared canonical post-migration overlay chain"
runtime_overlay_apply_post_migration_chain "$REPO_ROOT" "$TARGET_DB" "$TARGET_RUNTIME_ROLE" 1 >/dev/null

# Exact catalog proof for the two capabilities whose migration journal can be current while restored
# owners/ACLs are stale. Only the owner plus the named runtime role may execute each function.
run_dev_admin_psql -d "$TARGET_DB" -qAt \
  -v expected_runtime_role="$TARGET_RUNTIME_ROLE" <<'SQL' >/dev/null
WITH expected(function_oid, expected_grantee) AS (
  VALUES
    ('app.read_public_runtime_setting(text,text)'::regprocedure, :'expected_runtime_role'::name),
    ('app.read_current_patient_booking_rows(text,timestamptz)'::regprocedure, 'app_patient'::name)
), facts AS (
  SELECT
    expected.function_oid,
    expected.expected_grantee,
    pg_get_userbyid(procedure.proowner) AS owner_name,
    privilege.grantee,
    privilege.privilege_type,
    privilege.is_grantable
  FROM expected
  JOIN pg_proc procedure ON procedure.oid = expected.function_oid
  CROSS JOIN LATERAL aclexplode(
    COALESCE(procedure.proacl, acldefault('f', procedure.proowner))
  ) privilege
)
SELECT 1 / (
  (SELECT count(*) FROM expected) = 2
  AND NOT EXISTS (SELECT 1 FROM facts WHERE owner_name <> 'app_owner')
  AND NOT EXISTS (
    SELECT 1 FROM facts
    WHERE privilege_type <> 'EXECUTE'
      OR grantee = 0
      OR grantee NOT IN (
        (SELECT oid FROM pg_roles WHERE rolname = 'app_owner'),
        (SELECT oid FROM pg_roles WHERE rolname = expected_grantee)
      )
      OR (
        grantee = (SELECT oid FROM pg_roles WHERE rolname = expected_grantee)
        AND is_grantable
      )
  )
  AND NOT EXISTS (
    SELECT 1 FROM expected
    WHERE NOT has_function_privilege(expected_grantee, function_oid, 'EXECUTE')
  )
)::int AS dev_runtime_overlay_exact_owner_acl;
SQL

runtime_setting_rows="$(run_dev_runtime_psql -Atc \
  "SELECT count(*) FROM app.read_public_runtime_setting('oauth_google_enabled','admin');")"
[[ "$runtime_setting_rows" =~ ^[0-9]+$ ]] || {
  echo "FATAL: DEV runtime setting capability returned an invalid result" >&2
  exit 1
}

booking_rows="$(run_dev_runtime_psql -Atc \
  "BEGIN; SET LOCAL ROLE app_patient; SELECT count(*) FROM app.read_current_patient_booking_rows('upcoming', now()); ROLLBACK;")"
booking_rows="$(printf '%s\n' "$booking_rows" | awk '/^[0-9]+$/ { value = $0 } END { print value }')"
[[ "$booking_rows" =~ ^[0-9]+$ ]] || {
  echo "FATAL: DEV patient booking capability returned an invalid result" >&2
  exit 1
}

verified_database="$(run_dev_runtime_psql -Atc 'SELECT current_database();' 2>/dev/null)"
if [[ "$verified_database" != "$TARGET_DB" ]]; then
  echo "FATAL: post-rehydrate DEV database guard failed" >&2
  exit 1
fi

echo "[dev-runtime-overlay] PASS: exact DEV runtime grants/helpers/E1 closure is ready"
