#!/usr/bin/env bash
# Never inherit xtrace into this secret-bearing one-time repair path.
{ set +x; } 2>/dev/null
set -Eeuo pipefail

# Reapply the canonical post-migration runtime SQL closure to the exact local DEV DB.
# This does not restore/dump/reset a database, touch application rows, or open TEST/PROD.

TARGET_DB="bcb_webapp_dev"
TARGET_OWNER_ROLE="bcb_webapp_dev_user"
TARGET_RUNTIME_ROLE="bcb_dev_runtime_nonstaff_login"
P2_B_OWNER_ROLE="app_owner"
P2_B_STAFF_ROLE="app_staff"
P2_B_PATIENT_ROLE="app_patient"
REPO_ROOT="$(realpath "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)")"
DEV_ENV="$REPO_ROOT/apps/webapp/.env.dev"
DEV_ENV_PARSER="$REPO_ROOT/deploy/host/parse-dev-database-url.mjs"
RUNTIME_OVERLAY_LIB="$REPO_ROOT/deploy/host/runtime-overlay-rehydrate-lib.sh"
SQL_STREAMER="$REPO_ROOT/deploy/host/stream-canonical-sql.mjs"
P0_5B_GRANTS="$REPO_ROOT/deploy/postgres/p0-5b-grants.sql"
P2_B_CONTEXT="$REPO_ROOT/deploy/postgres/p2-b-protected-principal-context.sql"
PHASE4_LOCKED_POLICIES="$REPO_ROOT/deploy/postgres/phase4-locked-helper-rls-policies.sql"
D3_4_BOOTSTRAP_GRANTS="$REPO_ROOT/deploy/postgres/d3-4-bootstrap-base-login-read-grants.sql"
C5A_PLATFORM_OPERATIONS="$REPO_ROOT/deploy/postgres/c5a-platform-operations-runtime.sql"
RUNTIME_OVERLAY_APP_OWNER_HANDOFF="$REPO_ROOT/deploy/postgres/runtime-overlay-app-owner-handoff.sql"
POSTGRES=(sudo -n -u postgres env -i PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin)

usage() {
  cat <<EOF
Usage:
  bash deploy/host/dev-runtime-overlay-rehydrate.sh --preflight
  bash deploy/host/dev-runtime-overlay-rehydrate.sh --execute

Reinstalls the canonical P2-B protected context, strict locked-helper base policies, then runtime overlays/E1 and D3.4 to exactly $TARGET_DB.
The exact C0 dual-pool DEV topology requires DB_PRINCIPAL_CONTEXT_MODE=locked.
It never restores, recreates or dumps a database and never opens TEST, PROD or /opt/env.
This is a one-time post-restore/owner-drift repair, never an ordinary code-only deploy step.
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
  "$SQL_STREAMER|$REPO_ROOT/deploy/host/stream-canonical-sql.mjs|canonical SQL reader" \
  "$P0_5B_GRANTS|$REPO_ROOT/deploy/postgres/p0-5b-grants.sql|P0.5b grants" \
  "$P2_B_CONTEXT|$REPO_ROOT/deploy/postgres/p2-b-protected-principal-context.sql|P2-B protected context" \
  "$PHASE4_LOCKED_POLICIES|$REPO_ROOT/deploy/postgres/phase4-locked-helper-rls-policies.sql|Phase 4 strict locked-helper policies" \
  "$D3_4_BOOTSTRAP_GRANTS|$REPO_ROOT/deploy/postgres/d3-4-bootstrap-base-login-read-grants.sql|D3.4 bootstrap grants" \
  "$C5A_PLATFORM_OPERATIONS|$REPO_ROOT/deploy/postgres/c5a-platform-operations-runtime.sql|C5A platform operations" \
  "$RUNTIME_OVERLAY_APP_OWNER_HANDOFF|$REPO_ROOT/deploy/postgres/runtime-overlay-app-owner-handoff.sql|runtime overlay app_owner handoff"; do
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

# Open and parse one descriptor-pinned env snapshot. The helper releases the signing secret only
# after an explicit GO over its private pipe; the shell never stores or expands that secret.
coproc DEV_ENV_SNAPSHOT_PROCESS { "$NODE_BIN" "$DEV_ENV_PARSER" --snapshot-stream "$DEV_ENV"; }
DEV_ENV_SNAPSHOT_PID_VALUE="$DEV_ENV_SNAPSHOT_PROCESS_PID"
DEV_SNAPSHOT_COPROC_READ_FD="${DEV_ENV_SNAPSHOT_PROCESS[0]}"
DEV_SNAPSHOT_COPROC_WRITE_FD="${DEV_ENV_SNAPSHOT_PROCESS[1]}"
exec {DEV_SNAPSHOT_READ_FD}<&"$DEV_SNAPSHOT_COPROC_READ_FD"
exec {DEV_SNAPSHOT_WRITE_FD}>&"$DEV_SNAPSHOT_COPROC_WRITE_FD"
DEV_SNAPSHOT_READ_FD_OPEN=1
DEV_SNAPSHOT_WRITE_FD_OPEN=1
# Bash marks its original coproc descriptors specially and does not expose them to pipeline
# subshells. Keep ordinary duplicates for the GO stream, then close the originals so ABORT
# reaches EOF instead of waiting forever.
exec {DEV_SNAPSHOT_COPROC_READ_FD}<&-
exec {DEV_SNAPSHOT_COPROC_WRITE_FD}>&-

if ! IFS= read -r DEV_OWNER_DATABASE_URL <&"$DEV_SNAPSHOT_READ_FD" ||
  ! IFS= read -r DEV_RUNTIME_DATABASE_URL <&"$DEV_SNAPSHOT_READ_FD" ||
  ! IFS= read -r DEV_CONTEXT_MODE <&"$DEV_SNAPSHOT_READ_FD"; then
  echo "FATAL: DEV runtime snapshot parser rejected the env file" >&2
  exit 1
fi

close_dev_snapshot_write_fd() {
  if [[ "${DEV_SNAPSHOT_WRITE_FD_OPEN:-0}" == "1" ]]; then
    { exec {DEV_SNAPSHOT_WRITE_FD}>&-; } 2>/dev/null || true
    DEV_SNAPSHOT_WRITE_FD_OPEN=0
  fi
}

close_dev_snapshot_read_fd() {
  if [[ "${DEV_SNAPSHOT_READ_FD_OPEN:-0}" == "1" ]]; then
    { exec {DEV_SNAPSHOT_READ_FD}<&-; } 2>/dev/null || true
    DEV_SNAPSHOT_READ_FD_OPEN=0
  fi
}

abort_dev_env_snapshot() {
  { set +x; } 2>/dev/null
  if [[ "${DEV_SNAPSHOT_WRITE_FD_OPEN:-0}" == "1" ]]; then
    printf 'ABORT\n' 2>/dev/null >&"$DEV_SNAPSHOT_WRITE_FD" || true
  fi
  close_dev_snapshot_write_fd
  close_dev_snapshot_read_fd
  wait "$DEV_ENV_SNAPSHOT_PID_VALUE" 2>/dev/null || true
}
trap abort_dev_env_snapshot EXIT

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
  local sql_file
  local include_e1_role=0
  local -a psql_args=(-d "$TARGET_DB" -X -v ON_ERROR_STOP=1)
  local -a streamer_args

  if [[
    "$#" -eq 7 &&
    "$1" == "-d" && "$2" == "$TARGET_DB" &&
    "$3" == "-X" && "$4" == "-v" && "$5" == "ON_ERROR_STOP=1" &&
    "$6" == "-f"
  ]]; then
    sql_file="$7"
  elif [[
    "$#" -eq 9 &&
    "$1" == "-d" && "$2" == "$TARGET_DB" &&
    "$3" == "-X" && "$4" == "-v" && "$5" == "ON_ERROR_STOP=1" &&
    "$6" == "-v" && "$7" == "e1_webapp_runtime_role=$TARGET_RUNTIME_ROLE" &&
    "$8" == "-f"
  ]]; then
    sql_file="$9"
    include_e1_role=1
  elif [[
    "$#" -eq 9 &&
    "$1" == "-d" && "$2" == "$TARGET_DB" &&
    "$3" == "-X" && "$4" == "-v" && "$5" == "ON_ERROR_STOP=1" &&
    "$6" == "-v" && "$7" == "phase4_enforce_locked_context=1" &&
    "$8" == "-f"
  ]]; then
    sql_file="$9"
    psql_args+=(-v phase4_enforce_locked_context=1)
  elif [[
    "$#" -eq 13 &&
    "$1" == "-d" && "$2" == "$TARGET_DB" &&
    "$3" == "-X" && "$4" == "-v" && "$5" == "ON_ERROR_STOP=1" &&
    "$6" == "-v" && "$7" == "d3_4_bootstrap_base_role=$TARGET_RUNTIME_ROLE" &&
    "$8" == "-v" && "$9" == "d3_4_skip_media_worker=1" &&
    "${10}" == "-v" && "${11}" == "d3_4_skip_bootstrap_role_normalization=1" &&
    "${12}" == "-f"
  ]]; then
    sql_file="${13}"
    psql_args+=(
      -v "d3_4_bootstrap_base_role=$TARGET_RUNTIME_ROLE"
      -v d3_4_skip_media_worker=1
      -v d3_4_skip_bootstrap_role_normalization=1
    )
  else
    echo "FATAL: DEV runtime overlay rejected unexpected psql arguments" >&2
    return 1
  fi

  if [[ "$include_e1_role" -eq 1 ]]; then
    psql_args+=(-v "e1_webapp_runtime_role=$TARGET_RUNTIME_ROLE")
    streamer_args=(
      "$sql_file"
      "$REPO_ROOT/deploy/postgres"
      --expand-relative-includes
      "$REPO_ROOT"
    )
  else
    streamer_args=("$sql_file" "$REPO_ROOT/deploy/postgres")
  fi

  # The repository owner atomically opens and validates the SQL file. The postgres OS user receives
  # only that opened file on stdin and never needs traversal permission for the checkout.
  "$NODE_BIN" "$SQL_STREAMER" "${streamer_args[@]}" |
    run_dev_admin_psql "${psql_args[@]}"
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
if [[ "$DEV_CONTEXT_MODE" != "locked" ]]; then
  echo "FATAL: DEV C0 dual-pool runtime requires locked principal-context mode" >&2
  exit 1
fi

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
    WHERE rolname = 'app_owner'
      AND NOT rolcanlogin
      AND rolinherit
      AND rolbypassrls
      AND NOT rolsuper
      AND NOT rolcreatedb
      AND NOT rolcreaterole
      AND NOT rolreplication
      AND rolconnlimit = -1
      AND rolconfig IS NULL
  )
  AND EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'app_staff'
      AND rolcanlogin
      AND rolinherit
      AND NOT rolbypassrls
      AND NOT rolsuper
      AND NOT rolcreatedb
      AND NOT rolcreaterole
      AND NOT rolreplication
      AND rolconnlimit = -1
      AND rolconfig IS NULL
  )
  AND EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'app_patient'
      AND rolcanlogin
      AND rolinherit
      AND NOT rolbypassrls
      AND NOT rolsuper
      AND NOT rolcreatedb
      AND NOT rolcreaterole
      AND NOT rolreplication
      AND rolconnlimit = -1
      AND rolconfig IS NULL
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_auth_members membership
    JOIN pg_roles member_role ON member_role.oid = membership.member
    WHERE member_role.rolname IN ('app_owner', 'app_staff', 'app_patient')
  )
  AND NOT pg_has_role('app_staff', 'app_patient', 'MEMBER')
  AND NOT pg_has_role('app_patient', 'app_staff', 'MEMBER')
)::int AS dev_runtime_roles_safe;

-- The wall roles are cluster-global.  This DEV repair must therefore reject an
-- unexpected role that can SET ROLE into a wall (and every app_owner member),
-- while accepting the exact DEV topology and the optional, separately-managed
-- TEST topology when those TEST login roles exist on the shared cluster.
WITH expected_membership(
  granted_role,
  member_role,
  admin_option,
  inherit_option,
  set_option,
  member_inherit,
  member_config,
  required_for_dev
) AS (
  VALUES
    ('app_staff',   'bcb_dev_runtime_staff_login',    false, false, true, false, NULL::text[], true),
    ('app_patient', 'bcb_dev_runtime_nonstaff_login', false, false, true, false, NULL::text[], true),
    ('app_staff',   'bcb_test_staff_login',           false, true,  true, true,  ARRAY['search_path=public, integrator']::text[], false),
    ('app_staff',   'bcb_test_integrator_login',      false, false, true, false, ARRAY['search_path=public, integrator']::text[], false),
    ('app_patient', 'bcb_test_integrator_login',      false, false, true, false, ARRAY['search_path=public, integrator']::text[], false),
    ('app_patient', 'bcb_test_nonstaff_login',        false, false, true, false, ARRAY['search_path=public, integrator']::text[], false)
), active_expected AS (
  SELECT expected.*
  FROM expected_membership expected
  LEFT JOIN pg_roles member_role ON member_role.rolname = expected.member_role
  WHERE expected.required_for_dev OR member_role.oid IS NOT NULL
), actual_protected_membership AS (
  SELECT
    granted_role.rolname AS granted_role,
    member_role.rolname AS member_role,
    membership.admin_option,
    membership.inherit_option,
    membership.set_option,
    member_role.rolinherit AS member_inherit,
    member_role.rolconfig AS member_config,
    (member_role.rolname LIKE 'bcb_dev_%') AS required_for_dev
  FROM pg_auth_members membership
  JOIN pg_roles granted_role ON granted_role.oid = membership.roleid
  JOIN pg_roles member_role ON member_role.oid = membership.member
  WHERE granted_role.rolname IN ('app_owner', 'app_staff', 'app_patient')
)
SELECT 1 / (
  NOT EXISTS (
    SELECT 1
    FROM actual_protected_membership actual
    WHERE actual.granted_role = 'app_owner'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_roles candidate_role
    JOIN pg_roles owner_role ON owner_role.rolname = 'app_owner'
    WHERE candidate_role.rolname <> owner_role.rolname
      AND NOT (candidate_role.rolsuper AND candidate_role.rolname = 'postgres')
      AND pg_has_role(candidate_role.oid, owner_role.oid, 'MEMBER')
  )
  AND NOT EXISTS (
    (SELECT * FROM actual_protected_membership
     EXCEPT
     SELECT * FROM active_expected)
    UNION ALL
    (SELECT * FROM active_expected
     EXCEPT
     SELECT * FROM actual_protected_membership)
  )
  AND NOT EXISTS (
    SELECT 1
    FROM active_expected expected
    LEFT JOIN pg_roles member_role ON member_role.rolname = expected.member_role
    WHERE member_role.oid IS NULL
       OR NOT member_role.rolcanlogin
       OR member_role.rolinherit <> expected.member_inherit
       OR member_role.rolsuper
       OR member_role.rolcreatedb
       OR member_role.rolcreaterole
       OR member_role.rolreplication
       OR member_role.rolbypassrls
       OR member_role.rolconnlimit <> -1
       OR member_role.rolconfig IS DISTINCT FROM expected.member_config
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_roles candidate_role
    CROSS JOIN (VALUES ('app_staff'), ('app_patient')) AS wall(granted_role)
    JOIN pg_roles wall_role ON wall_role.rolname = wall.granted_role
    WHERE candidate_role.rolname <> wall.granted_role
      AND NOT (candidate_role.rolsuper AND candidate_role.rolname = 'postgres')
      AND pg_has_role(candidate_role.oid, wall_role.oid, 'MEMBER')
      AND NOT EXISTS (
        SELECT 1
        FROM active_expected expected
        WHERE expected.granted_role = wall.granted_role
          AND expected.member_role = candidate_role.rolname
      )
  )
)::int AS dev_runtime_incoming_memberships_exact;

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
  abort_dev_env_snapshot
  trap - EXIT
  echo "[dev-runtime-overlay] PASS: separate DEV owner/runtime topology is safe"
  exit 0
fi

# The restored database may have a current migration ledger while --no-owner/--no-acl has left the
# per-database protected-context owners and ACLs stale. Fail before the narrow handoff if the exact
# migration-created prerequisites or the pgcrypto move precondition are not present.
run_dev_admin_psql -d "$TARGET_DB" -qAt \
  -v expected_owner_role="$TARGET_OWNER_ROLE" \
  -v p2_b_owner_role="$P2_B_OWNER_ROLE" <<'SQL' >/dev/null
SELECT 1 / (
  EXISTS (
    SELECT 1
    FROM pg_namespace namespace
    WHERE namespace.nspname = 'app'
      AND pg_get_userbyid(namespace.nspowner) IN (:'expected_owner_role', :'p2_b_owner_role')
  )
  AND EXISTS (
    SELECT 1
    FROM pg_proc procedure
    JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'app'
      AND procedure.proname = 'is_staff'
      AND procedure.pronargs = 0
      AND pg_get_userbyid(procedure.proowner) IN (:'expected_owner_role', :'p2_b_owner_role')
  )
  AND NOT EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      'app.context_signing_secrets',
      'app.principal_context',
      'app.context_nonce_ledger'
    ]) AS expected(qualified_name)
    JOIN pg_class relation ON relation.oid = to_regclass(expected.qualified_name)
    WHERE pg_get_userbyid(relation.relowner) NOT IN (:'expected_owner_role', :'p2_b_owner_role')
  )
  AND NOT EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      'app.install_signed_context(text,integer,bigint,uuid,uuid,bigint,text)',
      'app.current_org_id()',
      'app.current_patient_user_id()',
      'app.current_integrator_user_id()',
      'app.reset_principal_context()',
      'app.release_principal_context()',
      'app.close_active_user_phone_history(uuid)',
      'app.is_staff()'
    ]) AS expected(signature)
    JOIN pg_proc procedure ON procedure.oid = to_regprocedure(expected.signature)
    WHERE pg_get_userbyid(procedure.proowner) NOT IN (:'expected_owner_role', :'p2_b_owner_role')
  )
)::int AS dev_p2_b_exact_owner_handoff_preconditions;

SELECT 1 / (
  NOT EXISTS (
    SELECT 1
    FROM pg_extension extension
    JOIN pg_namespace source_namespace ON source_namespace.oid = extension.extnamespace
    JOIN pg_depend dependency ON dependency.refobjid = extension.oid
    JOIN pg_proc source_proc ON source_proc.oid = dependency.objid
    JOIN pg_namespace target_namespace ON target_namespace.nspname = 'app_ext'
    JOIN pg_proc target_proc ON target_proc.pronamespace = target_namespace.oid
      AND target_proc.proname = source_proc.proname
      AND target_proc.proargtypes = source_proc.proargtypes
    WHERE extension.extname = 'pgcrypto'
      AND source_namespace.nspname <> 'app_ext'
      AND dependency.classid = 'pg_proc'::regclass
      AND dependency.deptype = 'e'
  )
)::int AS dev_p2_b_pgcrypto_move_precondition;
SQL

stream_dev_p2_b_input() {
  # Defence in depth for callers that deliberately invoke the function from `bash -x`.
  { set +x; } 2>/dev/null
  printf 'BEGIN;\n'
  printf '\\set p2_b_owner_role %s\n' "$P2_B_OWNER_ROLE"
  printf '\\set p2_b_staff_role %s\n' "$P2_B_STAFF_ROLE"
  printf '\\set p2_b_patient_role %s\n' "$P2_B_PATIENT_ROLE"
  printf '\\set p2_b_signing_secret dev-p2b-stdin-placeholder-at-least-32-characters\n'
  cat <<'SQL'
CREATE SCHEMA IF NOT EXISTS app_ext;
GRANT USAGE ON SCHEMA app_ext TO :"p2_b_owner_role";

SELECT format('ALTER TABLE %s OWNER TO %I', relation.oid::regclass, :'p2_b_owner_role')
FROM unnest(ARRAY[
  'app.context_signing_secrets',
  'app.principal_context',
  'app.context_nonce_ledger'
]) AS expected(qualified_name)
JOIN pg_class relation ON relation.oid = to_regclass(expected.qualified_name)
\gexec

SELECT format('ALTER FUNCTION %s OWNER TO %I', procedure.oid::regprocedure, :'p2_b_owner_role')
FROM unnest(ARRAY[
  'app.install_signed_context(text,integer,bigint,uuid,uuid,bigint,text)',
  'app.current_org_id()',
  'app.current_patient_user_id()',
  'app.current_integrator_user_id()',
  'app.reset_principal_context()',
  'app.release_principal_context()',
  'app.close_active_user_phone_history(uuid)',
  'app.is_staff()'
]) AS expected(signature)
JOIN pg_proc procedure ON procedure.oid = to_regprocedure(expected.signature)
\gexec
SQL
  "$NODE_BIN" "$SQL_STREAMER" "$P2_B_CONTEXT" "$REPO_ROOT/deploy/postgres"
  cat <<'SQL'
CREATE TEMP TABLE pg_temp.dev_p2_b_secret_input (
  secret text NOT NULL
) ON COMMIT DROP;
SET LOCAL log_statement = 'none';
SET LOCAL log_min_error_statement = 'panic';
SET LOCAL log_parameter_max_length_on_error = 0;
\copy pg_temp.dev_p2_b_secret_input(secret) FROM STDIN WITH (FORMAT text)
SQL
  cat <&"$DEV_SNAPSHOT_READ_FD"
  printf '\\.\n'
  cat <<'SQL'
SELECT 1 / ((SELECT count(*) FROM pg_temp.dev_p2_b_secret_input) = 1)::int
  AS dev_p2_b_secret_input_exact;

UPDATE app.context_signing_secrets AS target
SET secret = input.secret
FROM pg_temp.dev_p2_b_secret_input AS input
WHERE target.id = true;

SELECT 1 / (
  coalesce((
    SELECT target.secret = input.secret
    FROM app.context_signing_secrets AS target
    CROSS JOIN pg_temp.dev_p2_b_secret_input AS input
    WHERE target.id = true
  ), false)
  AND coalesce((SELECT n.nspname = 'app_ext' FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'pgcrypto'), false)
  AND coalesce((SELECT pg_get_userbyid(nspowner) = :'p2_b_owner_role' FROM pg_namespace WHERE nspname = 'app'), false)
  AND coalesce(has_schema_privilege(:'p2_b_owner_role', 'app_ext', 'USAGE'), false)
  AND 3 = (
    SELECT count(*)
    FROM unnest(ARRAY[
      'app.context_signing_secrets',
      'app.principal_context',
      'app.context_nonce_ledger'
    ]) AS expected(qualified_name)
    JOIN pg_class relation ON relation.oid = to_regclass(expected.qualified_name)
  )
  AND NOT EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      'app.context_signing_secrets',
      'app.principal_context',
      'app.context_nonce_ledger'
    ]) AS expected(qualified_name)
    JOIN pg_class relation ON relation.oid = to_regclass(expected.qualified_name)
    WHERE pg_get_userbyid(relation.relowner) <> :'p2_b_owner_role'
  )
  AND 8 = (
    SELECT count(*)
    FROM unnest(ARRAY[
      'app.install_signed_context(text,integer,bigint,uuid,uuid,bigint,text)',
      'app.current_org_id()',
      'app.current_patient_user_id()',
      'app.current_integrator_user_id()',
      'app.reset_principal_context()',
      'app.release_principal_context()',
      'app.close_active_user_phone_history(uuid)',
      'app.is_staff()'
    ]) AS expected(signature)
    JOIN pg_proc procedure ON procedure.oid = to_regprocedure(expected.signature)
  )
  AND NOT EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      'app.install_signed_context(text,integer,bigint,uuid,uuid,bigint,text)',
      'app.current_org_id()',
      'app.current_patient_user_id()',
      'app.current_integrator_user_id()',
      'app.reset_principal_context()',
      'app.release_principal_context()',
      'app.close_active_user_phone_history(uuid)',
      'app.is_staff()'
    ]) AS expected(signature)
    JOIN pg_proc procedure ON procedure.oid = to_regprocedure(expected.signature)
    WHERE pg_get_userbyid(procedure.proowner) <> :'p2_b_owner_role'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      'app.context_signing_secrets',
      'app.principal_context',
      'app.context_nonce_ledger'
    ]) AS expected(qualified_name)
    JOIN pg_class relation ON relation.oid = to_regclass(expected.qualified_name)
    CROSS JOIN LATERAL aclexplode(COALESCE(relation.relacl, acldefault('r', relation.relowner))) privilege
    WHERE privilege.grantee <> (SELECT oid FROM pg_roles WHERE rolname = :'p2_b_owner_role')
       OR privilege.privilege_type NOT IN (
         'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
       )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      'app.install_signed_context(text,integer,bigint,uuid,uuid,bigint,text)',
      'app.current_org_id()',
      'app.current_patient_user_id()',
      'app.current_integrator_user_id()',
      'app.reset_principal_context()',
      'app.release_principal_context()',
      'app.close_active_user_phone_history(uuid)',
      'app.is_staff()'
    ]) AS expected(signature)
    JOIN pg_proc procedure ON procedure.oid = to_regprocedure(expected.signature)
    CROSS JOIN LATERAL aclexplode(COALESCE(procedure.proacl, acldefault('f', procedure.proowner))) privilege
    WHERE privilege.privilege_type <> 'EXECUTE'
       OR privilege.grantee = 0
       OR privilege.grantee NOT IN (
         (SELECT oid FROM pg_roles WHERE rolname = :'p2_b_owner_role'),
         (SELECT oid FROM pg_roles WHERE rolname = :'p2_b_staff_role'),
         (SELECT oid FROM pg_roles WHERE rolname = :'p2_b_patient_role')
       )
       OR (
         privilege.grantee <> (SELECT oid FROM pg_roles WHERE rolname = :'p2_b_owner_role')
         AND privilege.is_grantable
       )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      'app.install_signed_context(text,integer,bigint,uuid,uuid,bigint,text)',
      'app.current_org_id()',
      'app.current_patient_user_id()',
      'app.current_integrator_user_id()',
      'app.reset_principal_context()',
      'app.release_principal_context()',
      'app.close_active_user_phone_history(uuid)',
      'app.is_staff()'
    ]) AS expected(signature)
    WHERE NOT has_function_privilege(:'p2_b_staff_role', expected.signature, 'EXECUTE')
       OR NOT has_function_privilege(:'p2_b_patient_role', expected.signature, 'EXECUTE')
  )
)::int AS dev_p2_b_owner_context_postcheck;
COMMIT;
SQL
}

echo "[dev-runtime-overlay] atomically reinstalling exact P2-B owner/context/ACL closure"
printf 'GO\n' >&"$DEV_SNAPSHOT_WRITE_FD"
close_dev_snapshot_write_fd
stream_dev_p2_b_input | run_dev_admin_psql -d "$TARGET_DB" -q >/dev/null
close_dev_snapshot_read_fd
if ! wait "$DEV_ENV_SNAPSHOT_PID_VALUE"; then
  echo "FATAL: DEV runtime snapshot secret transport failed" >&2
  exit 1
fi
trap - EXIT

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
runtime_overlay_admin_psql -d "$TARGET_DB" -X -v ON_ERROR_STOP=1 -f "$P0_5B_GRANTS" >/dev/null

echo "[dev-runtime-overlay] applying canonical strict locked-helper base policies"
runtime_overlay_admin_psql \
  -d "$TARGET_DB" -X -v ON_ERROR_STOP=1 \
  -v phase4_enforce_locked_context=1 \
  -f "$PHASE4_LOCKED_POLICIES" >/dev/null

echo "[dev-runtime-overlay] applying shared canonical post-migration overlay chain"
runtime_overlay_apply_post_migration_chain \
  "$REPO_ROOT" "$TARGET_DB" "$TARGET_RUNTIME_ROLE" 1 >/dev/null

echo "[dev-runtime-overlay] applying canonical D3.4 DEV bootstrap closure (validated C0; media excluded)"
runtime_overlay_admin_psql \
  -d "$TARGET_DB" -X -v ON_ERROR_STOP=1 \
  -v "d3_4_bootstrap_base_role=$TARGET_RUNTIME_ROLE" \
  -v d3_4_skip_media_worker=1 \
  -v d3_4_skip_bootstrap_role_normalization=1 \
  -f "$D3_4_BOOTSTRAP_GRANTS" >/dev/null

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

run_dev_runtime_psql -Atc "SELECT app.release_principal_context();" >/dev/null

bootstrap_surface_ready="$(run_dev_runtime_psql -Atc "
SELECT (
  has_function_privilege(current_user, 'app.release_principal_context()', 'EXECUTE')
  AND has_function_privilege(current_user, 'app.get_public_config_bool(text)', 'EXECUTE')
  AND has_function_privilege(current_user, 'app.email_password_find_login_candidate(text)', 'EXECUTE')
  AND has_function_privilege(current_user, 'app.lookup_pending_org_invite(text)', 'EXECUTE')
  AND has_function_privilege(current_user, 'app.resolve_public_booking_organization(uuid,uuid,uuid)', 'EXECUTE')
  AND has_function_privilege(current_user, 'app.resolve_public_organization_by_slug(text)', 'EXECUTE')
  AND has_table_privilege(current_user, 'public.be_organization_members', 'SELECT')
  AND has_table_privilege(current_user, 'public.platform_users', 'SELECT')
  AND has_table_privilege(current_user, 'public.user_channel_bindings', 'SELECT')
  AND has_table_privilege(current_user, 'public.be_external_entity_mappings', 'SELECT')
  AND has_table_privilege(current_user, 'public.be_specialist_service_availability', 'SELECT')
  AND has_table_privilege(current_user, 'public.be_branches', 'SELECT')
  AND has_table_privilege(current_user, 'public.be_clinic_services', 'SELECT')
  AND has_table_privilege(current_user, 'public.be_specialists', 'SELECT')
  AND NOT has_function_privilege(current_user, 'app.install_signed_context(text,integer,bigint,uuid,uuid,bigint,text)', 'EXECUTE')
  AND NOT has_function_privilege(current_user, 'app.reset_principal_context()', 'EXECUTE')
)::text;")"
if [[ "$bootstrap_surface_ready" != "true" ]]; then
  echo "FATAL: DEV nonstaff base-login D3.4 bootstrap surface is incomplete" >&2
  exit 1
fi

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

echo "[dev-runtime-overlay] PASS: exact DEV strict helper policies/runtime grants/E1 closure is ready"
