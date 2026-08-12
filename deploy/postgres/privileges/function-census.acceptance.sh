#!/usr/bin/env bash
# Disposable PostgreSQL 16 proof for the exact per-database SECURITY DEFINER census.
set -euo pipefail

pg_bin=${PGBIN:-/usr/lib/postgresql/16/bin}
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
work_dir=$(mktemp -d "${TMPDIR:-/tmp}/bcb-function-census.XXXXXX")
data_dir="$work_dir/data"
socket_dir="$work_dir/socket"
log_file="$work_dir/postgres.log"
mkdir -p "$socket_dir"

cleanup() {
  if [[ -f "$data_dir/postmaster.pid" ]]; then
    "$pg_bin/pg_ctl" -D "$data_dir" -m immediate stop >/dev/null 2>&1 || true
  fi
  [[ ${FUNCTION_CENSUS_KEEP_DISPOSABLE:-0} == 1 ]] || rm -rf "$work_dir"
}
trap cleanup EXIT
fail() { echo "function census: FAIL: $*" >&2; exit 1; }
psql_db() { "$pg_bin/psql" -X -v ON_ERROR_STOP=1 -h "$socket_dir" -U postgres -d "$1" "${@:2}"; }

"$pg_bin/initdb" -D "$data_dir" --auth=trust --username=postgres >/dev/null
printf '%s\n' "unix_socket_directories = '$socket_dir'" "listen_addresses = ''" >> "$data_dir/postgresql.conf"
"$pg_bin/pg_ctl" -D "$data_dir" -l "$log_file" start >/dev/null

render_function_sql() {
  local declared_db=$1 output=$2
  DECLARED_DB="$declared_db" node --experimental-strip-types --input-type=module >"$output" <<'JS'
import { declaration } from './deploy/postgres/privileges/declaration.ts';
import { generateFunctionCensusSql } from './deploy/postgres/privileges/generate.mjs';
process.stdout.write(`${generateFunctionCensusSql(declaration, process.env.DECLARED_DB)}\n`);
JS
}

verify() {
  local declared_db=$1 connect_db=${2:-$1}
  PGHOST="$socket_dir" PGPORT=5432 node "$repo_root/deploy/postgres/privileges/fixtures/catalog-verifier.mjs" \
    --db "$declared_db" --connect-db "$connect_db" --functions-only
}

expect_red() {
  local declared_db=$1 connect_db=$2 label=$3
  local output="$work_dir/$connect_db.$label.out"
  set +e
  PGHOST="$socket_dir" PGPORT=5432 node "$repo_root/deploy/postgres/privileges/fixtures/catalog-verifier.mjs" \
    --db "$declared_db" --connect-db "$connect_db" --functions-only >"$output" 2>&1
  local rc=$?
  set -e
  [[ $rc -ne 0 ]] || fail "$declared_db/$label verifier stayed green"
  printf 'fault %s/%s: %s\n' "$declared_db" "$label" "$(head -1 "$output")"
}

expect_generated_red() {
  local connect_db=$1 label=$2 sql_file=$3
  local output="$work_dir/$connect_db.$label.generated.out"
  set +e
  psql_db "$connect_db" -1 -f "$sql_file" >"$output" 2>&1
  local rc=$?
  set -e
  [[ $rc -ne 0 ]] || fail "$connect_db/$label generated closure stayed green"
  printf 'generated fault %s/%s: %s\n' "$connect_db" "$label" "$(grep -m1 'ERROR:' "$output")"
}

proof_database() {
  local db=$1 expected_definers
  expected_definers=$(DECLARED_DB="$db" node --experimental-strip-types --input-type=module <<'JS'
import { declaration } from './deploy/postgres/privileges/declaration.ts';
const db = process.env.DECLARED_DB;
console.log(Object.values(declaration.portContext.functions)
  .filter((fn) => fn.security === 'DEFINER' && (!fn.databases || fn.databases.includes(db))).length);
JS
)
  local sql_file="$work_dir/$db.functions.sql"
  "$pg_bin/createdb" -h "$socket_dir" -U postgres "$db"
  node --experimental-strip-types "$repo_root/deploy/postgres/privileges/fixtures/production-catalog.mjs" "$db" \
    | psql_db "$db" >/dev/null
  render_function_sql "$db" "$sql_file"
  psql_db "$db" -1 -f "$sql_file" >/dev/null
  verify "$db"

  local actual_definers owner_count
  actual_definers=$(psql_db "$db" -Atc "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.prosecdef AND n.nspname IN ('app','app_ext')")
  [[ $actual_definers == "$expected_definers" ]] || fail "$db expected $expected_definers definers, got $actual_definers"
  owner_count=$(psql_db "$db" -Atc "SELECT count(*) FROM pg_roles WHERE rolname LIKE 'app_seam_%_owner' OR rolname IN ('saas_telemetry_owner','saas_system_health_owner')")
  [[ $owner_count == 42 ]] || fail "$db expected 42 seam owners, got $owner_count"

  local label clone mutation
  while IFS='|' read -r label mutation; do
    clone="${db}_${label}"
    psql_db postgres -c "CREATE DATABASE \"$clone\" TEMPLATE \"$db\"" >/dev/null
    psql_db "$clone" -c "$mutation" >/dev/null
    expect_red "$db" "$clone" "$label"
    case "$label" in
      extra_public|rogue_login_execute|owner_as_member|member_of_owner)
        psql_db "$clone" -1 -f "$sql_file" >/dev/null
        verify "$db" "$clone"
        printf 'repair %s/%s: generated reconciliation restored the exact catalog\n' "$db" "$label"
        ;;
    esac
    psql_db postgres -c "DROP DATABASE \"$clone\"" >/dev/null
  done <<'FAULTS'
missing|DROP FUNCTION app.accept_org_invite(text,uuid,text)
extra|CREATE FUNCTION app.function_census_extra() RETURNS void LANGUAGE sql SECURITY DEFINER AS 'SELECT NULL::void'
extra_public|CREATE FUNCTION public.function_census_extra() RETURNS void LANGUAGE sql SECURITY DEFINER AS 'SELECT NULL::void'
owner|ALTER FUNCTION app.resolve_clinic_dedicated_bot_organization(text,text) OWNER TO app_object_owner
public|GRANT EXECUTE ON FUNCTION app.resolve_clinic_dedicated_bot_organization(text,text) TO PUBLIC
execute|GRANT EXECUTE ON FUNCTION app.resolve_clinic_dedicated_bot_organization(text,text) TO app_service
rogue_login_execute|DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='function_census_rogue') THEN CREATE ROLE function_census_rogue LOGIN; END IF; END $$; GRANT EXECUTE ON FUNCTION app.resolve_clinic_dedicated_bot_organization(text,text) TO function_census_rogue
pre_session_missing|REVOKE EXECUTE ON FUNCTION app.auth_rate_limit_count(text,text) FROM app_pre_session
owner_as_member|GRANT app_service TO app_seam_dedicated_bot_owner
member_of_owner|GRANT app_seam_dedicated_bot_owner TO app_service
search_path|ALTER FUNCTION app.resolve_clinic_dedicated_bot_organization(text,text) SET search_path TO public
security|ALTER FUNCTION app.resolve_clinic_dedicated_bot_organization(text,text) SECURITY INVOKER
FAULTS
  echo "function census: $db PASS ($actual_definers definers, 42 owners, twelve red mutations)"
}

cd "$repo_root"
proof_database bersoncarebot_test
proof_database bcb_webapp_dev
echo 'function census: PASS (disposable PostgreSQL 16; declaration-derived exact definer census and twelve red mutations)'
