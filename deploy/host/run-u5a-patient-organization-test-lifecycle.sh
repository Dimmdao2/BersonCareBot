#!/usr/bin/env bash
set -euo pipefail

readonly REQUIRED_PROJECT_ROOT="/opt/projects/bersoncarebot-test"
readonly REQUIRED_WRAPPER_SOURCE="$REQUIRED_PROJECT_ROOT/deploy/host/run-u5a-patient-organization-test-lifecycle.sh"
readonly WEBAPP_ENV="/opt/env/bersoncarebot/webapp.test"
readonly REQUIRED_DATABASE="bersoncarebot_test"
readonly CAPABILITY_SQL="deploy/postgres/u5a-patient-organization-test-lifecycle.sql"
readonly PG_ENV_UNSET_COMMAND="unset PGAPPNAME PGCHANNELBINDING PGCLIENTENCODING PGCONNECT_TIMEOUT PGDATABASE PGGSSENCMODE PGGSSLIB PGHOST PGHOSTADDR PGKRBSRVNAME PGOPTIONS PGPASSFILE PGPASSWORD PGPORT PGREQUIREAUTH PGREQUIREPEER PGSERVICE PGSERVICEFILE PGSSLCERT PGSSLCRL PGSSLCRLDIR PGSSLKEY PGSSLMODE PGSSLNEGOTIATION PGSSLROOTCERT PGSSLSNI PGTARGETSESSIONATTRS PGUSER"
readonly -a PG_ENV_KEYS=(
  PGAPPNAME PGCHANNELBINDING PGCLIENTENCODING PGCONNECT_TIMEOUT PGDATABASE PGGSSENCMODE PGGSSLIB
  PGHOST PGHOSTADDR PGKRBSRVNAME PGOPTIONS PGPASSFILE PGPASSWORD PGPORT PGREQUIREAUTH
  PGREQUIREPEER PGSERVICE PGSERVICEFILE PGSSLCERT PGSSLCRL PGSSLCRLDIR PGSSLKEY PGSSLMODE
  PGSSLNEGOTIATION PGSSLROOTCERT PGSSLSNI PGTARGETSESSIONATTRS PGUSER
)

usage(){
  echo "Usage: $0 status | discharge --execute | restore --execute | cleanup --execute" >&2
}

fail(){
  echo "FATAL: $1" >&2
  exit 1
}

assert_regular_nonsymlink_path(){
  local label="$1"
  local path="$2"
  local current="/"
  local part
  [ "${path#/}" != "$path" ] || fail "$label must be absolute"
  IFS='/' read -r -a parts <<< "${path#/}"
  for part in "${parts[@]}"; do
    [ -n "$part" ] || continue
    current="${current%/}/$part"
    [ ! -L "$current" ] || fail "$label contains a symlink component"
  done
  [ -f "$path" ] || fail "$label must be a regular file"
}

without_pg_environment(){
  local -a clean_env=(env)
  local key
  for key in "${PG_ENV_KEYS[@]}"; do clean_env+=(-u "$key"); done
  "${clean_env[@]}" "$@"
}

action="${1:-}"
execute_flag="${2:-}"
[ "$#" -le 2 ] || { usage; exit 2; }
case "$action" in
  status)
    [ -z "$execute_flag" ] || { usage; exit 2; }
    ;;
  discharge|restore|cleanup)
    [ "$execute_flag" = "--execute" ] || { usage; exit 2; }
    ;;
  *)
    usage
    exit 2
    ;;
esac

wrapper_source="${BASH_SOURCE[0]}"
[ "$wrapper_source" = "$REQUIRED_WRAPPER_SOURCE" ] || fail "wrapper source must be the exact canonical path"
assert_regular_nonsymlink_path "U5A wrapper source" "$wrapper_source"
[ "$(readlink -f -- "$wrapper_source")" = "$REQUIRED_WRAPPER_SOURCE" ] \
  || fail "wrapper source alias refused"
[ "${EUID:-$(id -u)}" -eq 0 ] || fail "root operator required"
exec 9>/run/lock/bersoncarebot-u5a-patient-organization-test-lifecycle.lock
flock -n 9 || fail "another U5A patient-organization lifecycle wrapper is already running"
project_root="$(cd "$(dirname "$wrapper_source")/../.." && pwd -P)"
[ "$project_root" = "$REQUIRED_PROJECT_ROOT" ] || fail "wrong project root"
[ "$(readlink -f "$project_root")" = "$REQUIRED_PROJECT_ROOT" ] || fail "project root alias refused"
assert_regular_nonsymlink_path "webapp TEST env" "$WEBAPP_ENV"
assert_regular_nonsymlink_path "U5A lifecycle SQL" "$project_root/$CAPABILITY_SQL"

operator_identity="$(
  sudo -u deploy bash -lc "
    set +x
    set -a
    . '$WEBAPP_ENV'
    set +a
    operator_url=\"\${SAAS_ISOLATION_OPERATOR_DATABASE_URL:-}\"
    [ -n \"\$operator_url\" ]
    url_login=\$(node -e '
      const reject = (message) => {
        process.stderr.write(\"FATAL: \" + message + \"\\\\n\");
        process.exit(2);
      };
      let parsed;
      try {
        parsed = new URL(process.env.SAAS_ISOLATION_OPERATOR_DATABASE_URL || \"\");
      } catch {
        reject(\"operator URL is invalid\");
      }
      if (parsed.protocol !== \"postgres:\" && parsed.protocol !== \"postgresql:\") {
        reject(\"operator URL must use PostgreSQL protocol\");
      }
      for (const key of parsed.searchParams.keys()) {
        if (key.toLowerCase() === \"options\") reject(\"operator URL options are forbidden\");
      }
      let login;
      try {
        login = decodeURIComponent(parsed.username);
      } catch {
        reject(\"operator URL login is invalid\");
      }
      if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}\$/.test(login)) {
        reject(\"operator URL login is invalid\");
      }
      process.stdout.write(login);
    ')
    $PG_ENV_UNSET_COMMAND
    printf '%s|' \"\$url_login\"
    psql \"\$SAAS_ISOLATION_OPERATOR_DATABASE_URL\" -X -v ON_ERROR_STOP=1 -qAt -F '|' -c \"
      SELECT
        current_database(),
        session_user,
        current_user,
        role.rolcanlogin,
        role.rolinherit,
        role.rolsuper,
        role.rolcreatedb,
        role.rolcreaterole,
        role.rolreplication,
        role.rolbypassrls,
        (
          pg_has_role(current_user, 'app_owner', 'MEMBER')
          OR pg_has_role(current_user, 'app_staff', 'MEMBER')
          OR pg_has_role(current_user, 'app_patient', 'MEMBER')
          OR pg_has_role(current_user, 'app_worker', 'MEMBER')
        ),
        (
          (
            SELECT count(*) = 1
              AND bool_and(
                granted_role.rolname = 'saas_telemetry_operator'
                AND NOT membership.admin_option
                AND membership.inherit_option
                AND membership.set_option
              )
            FROM pg_catalog.pg_auth_members AS membership
            JOIN pg_catalog.pg_roles AS member_role ON member_role.oid = membership.member
            JOIN pg_catalog.pg_roles AS granted_role ON granted_role.oid = membership.roleid
            WHERE member_role.rolname = session_user
          )
          AND EXISTS (
            SELECT 1
            FROM pg_catalog.pg_roles AS capability_role
            WHERE capability_role.rolname = 'saas_telemetry_operator'
              AND NOT capability_role.rolcanlogin
              AND NOT capability_role.rolinherit
              AND NOT capability_role.rolsuper
              AND NOT capability_role.rolcreatedb
              AND NOT capability_role.rolcreaterole
              AND NOT capability_role.rolreplication
              AND NOT capability_role.rolbypassrls
          )
          AND NOT EXISTS (
            SELECT 1
            FROM pg_catalog.pg_auth_members AS membership
            JOIN pg_catalog.pg_roles AS member_role ON member_role.oid = membership.member
            WHERE member_role.rolname = 'saas_telemetry_operator'
          )
        )
      FROM pg_catalog.pg_roles AS role
      WHERE role.rolname = session_user;
    \"
  "
)"
IFS='|' read -r url_login database_name session_role current_role can_login can_inherit is_super create_db create_role replication bypass_rls app_member membership_topology <<< "$operator_identity"
[ "$database_name" = "$REQUIRED_DATABASE" ] || fail "operator URL must target exact TEST database"
operator_role="$session_role"
[[ "$operator_role" =~ ^[A-Za-z_][A-Za-z0-9_]{0,62}$ ]] || fail "invalid operator role"
[ "$url_login|$session_role|$current_role" = "$operator_role|$operator_role|$operator_role" ] \
  || fail "operator URL login, session_user and current_user must be identical"
[ "$can_login|$can_inherit|$is_super|$create_db|$create_role|$replication|$bypass_rls|$app_member|$membership_topology" = "t|t|f|f|f|f|f|f|t" ] \
  || fail "operator role attributes or memberships are unsafe"

apply_capability(){
  local mode="$1"
  without_pg_environment sudo -u postgres psql -d "$REQUIRED_DATABASE" -X -q -v ON_ERROR_STOP=1 \
    -v u5a_lifecycle_expected_database="$REQUIRED_DATABASE" \
    -v u5a_lifecycle_operator_role="$operator_role" \
    -v u5a_lifecycle_mode="$mode" \
    -f "$project_root/$CAPABILITY_SQL"
}

cleanup_capability(){
  local cleanup_status=0
  set +e
  apply_capability cleanup
  cleanup_status=$?
  set -e
  return "$cleanup_status"
}

cleanup_on_exit(){
  local primary_status=$?
  local cleanup_status=0
  if [ "${cleanup_required:-0}" = "1" ]; then
    cleanup_capability || cleanup_status=$?
  fi
  if [ "$cleanup_status" -ne 0 ]; then
    echo "FATAL: U5A capability cleanup failed" >&2
    exit "$cleanup_status"
  fi
  exit "$primary_status"
}

if [ "$action" = "cleanup" ]; then
  cleanup_capability
  echo "U5A patient-organization TEST capability cleanup: OK"
  exit 0
fi

cleanup_required=1
trap cleanup_on_exit EXIT
apply_capability install

cli_args=("$action")
if [ "$action" != "status" ]; then cli_args+=("--execute"); fi
sudo -u deploy bash -lc "
  set +x
  cd '$project_root'
  set -a
  . '$WEBAPP_ENV'
  set +a
  operator_url=\"\${SAAS_ISOLATION_OPERATOR_DATABASE_URL:-}\"
  $PG_ENV_UNSET_COMMAND
  unset DATABASE_URL DATABASE_URL_NONSTAFF DATABASE_URL_STAFF
  export SAAS_ISOLATION_OPERATOR_DATABASE_URL=\"\$operator_url\"
  pnpm --dir apps/webapp run test-fixture:patient-organization-lifecycle -- ${cli_args[*]}
"

cleanup_capability
cleanup_required=0
trap - EXIT
echo "U5A patient-organization TEST lifecycle '$action': OK; capability removed"
