#!/usr/bin/env bash
# Real PG16 disposable acceptance for the atomic post-zero installer.
# Source access is schema-only/read-only; all writes stay under mktemp.
set -euo pipefail

pg_bin=/usr/lib/postgresql/16/bin
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
source_db=${POSTZERO_SCHEMA_SOURCE_DB:-bersoncarebot_test}
work_dir=$(mktemp -d "${TMPDIR:-/tmp}/bcb-postzero-installer.XXXXXX")
data_dir="$work_dir/data"
log_file="$work_dir/postgres.log"
db_name=bersoncarebot_test

cleanup() {
  [[ -f "$data_dir/postmaster.pid" ]] && "$pg_bin/pg_ctl" -D "$data_dir" -m immediate stop >/dev/null 2>&1 || true
  [[ "${POSTZERO_KEEP_DISPOSABLE:-0}" == 1 ]] || rm -rf "$work_dir"
}
trap cleanup EXIT
fail() { echo "post-zero installer acceptance: FAIL: $*" >&2; exit 1; }
admin() { "$pg_bin/psql" -X -v ON_ERROR_STOP=1 -h "$data_dir" -p "$port" -U postgres -d "$db_name" "$@"; }
cluster_admin() { "$pg_bin/psql" -X -v ON_ERROR_STOP=1 -h "$data_dir" -p "$port" -U postgres -d postgres "$@"; }
assert_eq() { [[ "$1" == "$2" ]] || fail "expected [$2], got [$1]"; }

port=0
for _ in $(seq 1 35); do
  candidate=$((57000 + RANDOM % 1000))
  if ! ss -ltn "sport = :$candidate" 2>/dev/null | grep -q LISTEN; then port=$candidate; break; fi
done
[[ "$port" != 0 ]] || fail 'no free disposable port'

# This is intentionally a read-only schema-only DEV/TEST source, never a live write.
sudo -n -u postgres "$pg_bin/pg_dump" --schema-only --no-owner --no-privileges --dbname="$source_db" > "$work_dir/source.sql"
sudo -n -u postgres "$pg_bin/psql" -X -At -d postgres -c \
  "SELECT format('CREATE ROLE %I NOLOGIN;', rolname) FROM pg_roles WHERE rolname !~ '^pg_' AND rolname NOT IN ('postgres','dev') AND rolname !~ '^bcb_(dev|test)_(webapp_staff|webapp_patient|webapp_global_admin|integrator)$' ORDER BY rolname" \
  > "$work_dir/source-roles.sql"
"$pg_bin/initdb" -D "$data_dir" --auth=trust --username=dev >/dev/null
printf '%s\n' "port = $port" "unix_socket_directories = '$data_dir'" "log_min_messages = notice" >> "$data_dir/postgresql.conf"
"$pg_bin/pg_ctl" -D "$data_dir" -l "$log_file" start >/dev/null
"$pg_bin/createdb" -h "$data_dir" -p "$port" -U dev "$db_name"
"$pg_bin/psql" -X -v ON_ERROR_STOP=1 -h "$data_dir" -p "$port" -U dev -d "$db_name" -c 'CREATE ROLE postgres SUPERUSER LOGIN' >/dev/null
"$pg_bin/psql" -X -v ON_ERROR_STOP=1 -h "$data_dir" -p "$port" -U dev -d "$db_name" -f "$work_dir/source-roles.sql" >/dev/null
admin -f "$work_dir/source.sql" >/dev/null
# The captured TEST schema may already have removed a declared compatibility
# relation. Add only missing declaration-owned relation shells; no live schema
# is altered and the real source remains the production-shaped baseline.
node --experimental-strip-types "$repo_root/deploy/postgres/privileges/fixtures/production-catalog.mjs" "$db_name" \
  | awk '/^CREATE SCHEMA IF NOT EXISTS / { print; next } /^CREATE TABLE / { if ($3 ~ /^"app_control"\./ || $3 ~ /^"app_ext"\."(accepted_port_contexts|port_context_capabilities|variant_a_identity_refs)"/) next; sub(/^CREATE TABLE /, "CREATE TABLE IF NOT EXISTS "); print }' \
  | admin >/dev/null
{
  printf '\\set DBNAME %s\n' "$db_name"
  node --experimental-strip-types "$repo_root/deploy/postgres/privileges/generate-cli.mjs" \
    --env test --db "$db_name" --env-login-shells
  printf '\\i %s\n' "$repo_root/deploy/postgres/port-context/contract.sql"
} | admin >/dev/null
node --experimental-strip-types "$repo_root/deploy/postgres/privileges/fixtures/function-shells.mjs" "$db_name" \
  --exclude-names-defined-in "$repo_root/deploy/postgres/privileges/post-zero-roots.sql" \
  | admin >/dev/null
zero() {
  admin -1 -f "$repo_root/deploy/postgres/generated/zero-state.$db_name.sql" >/dev/null
  node --experimental-strip-types "$repo_root/deploy/postgres/privileges/generate-cli.mjs" \
    --env test --db "$db_name" --target-login-cleanup | cluster_admin -1 >/dev/null
  cluster_admin -1 -f "$repo_root/deploy/postgres/generated/zero-state.cluster.sql" >/dev/null
}
install() {
  BCB_TEST_WEBAPP_STAFF_PASSWORD=disposable-staff \
  BCB_TEST_WEBAPP_PATIENT_PASSWORD=disposable-patient \
  BCB_TEST_WEBAPP_GLOBAL_ADMIN_PASSWORD=disposable-global-admin \
  BCB_TEST_INTEGRATOR_PASSWORD=disposable-integrator \
    node "$repo_root/deploy/postgres/privileges/install-post-zero.mjs" --db "$db_name" --env test --admin-socket "$data_dir" --admin-port "$port"
}

zero
install >"$work_dir/first-install.out" 2>&1 || { cat "$work_dir/first-install.out" >&2; fail 'first actual installer run'; }
grep -q 'BCB_ZERO_STATE_VERIFIED' "$work_dir/first-install.out" || fail 'installer did not execute declaration-owned zero verifier'
grep -q 'BCB_ENVIRONMENT_VERIFIED' "$work_dir/first-install.out" || fail 'installer did not execute exact environment verifier'
assert_eq "$(admin -Atc "SELECT count(*) FROM pg_roles WHERE rolcanlogin AND rolname ~ '^(app_|bcb_|saas_|bersoncarebot_)'")" 4
assert_eq "$(admin -Atc "SELECT count(*) FROM pg_roles WHERE rolname IN ('bcb_test_webapp_staff','bcb_test_webapp_patient','bcb_test_webapp_global_admin','bcb_test_integrator') AND rolcanlogin")" 4
assert_eq "$(admin -Atc "SELECT count(*) FROM pg_auth_members WHERE member IN ('bcb_test_webapp_staff'::regrole,'bcb_test_webapp_patient'::regrole,'bcb_test_webapp_global_admin'::regrole,'bcb_test_integrator'::regrole) AND set_option")" 16

# A malformed dispatch argument must not bypass the exact gate with a quiet false/empty result.
for statement in \
  "SELECT app.passkey_issue_challenge('00000000-0000-4000-8000-000000000001','invalid',NULL,'invalid','https://example.test','example.test',statement_timestamp()+interval '1 minute')" \
  "SELECT * FROM app.passkey_read_challenge('00000000-0000-4000-8000-000000000001','invalid')"
do
  if admin -v VERBOSITY=verbose -c "BEGIN; SET LOCAL ROLE app_pre_session; $statement; ROLLBACK" \
    >"$work_dir/passkey-no-context.out" 2>&1; then
    fail 'malformed passkey dispatch bypassed accepted context'
  fi
  grep -q '42501' "$work_dir/passkey-no-context.out" \
    || { cat "$work_dir/passkey-no-context.out" >&2; fail 'passkey context refusal was not SQLSTATE 42501'; }
done

# Fault classes are catalog facts, not source-text assertions. Zero→install is the supported stopped-service repair.
admin <<'SQL' >/dev/null
GRANT SELECT ON public.platform_users TO PUBLIC;
GRANT UPDATE (id) ON public.platform_users TO app_staff;
CREATE POLICY postzero_rogue ON public.platform_users USING (true);
ALTER TABLE public.platform_users NO FORCE ROW LEVEL SECURITY;
GRANT app_staff TO bcb_test_webapp_patient;
ALTER ROLE bcb_test_integrator BYPASSRLS;
UPDATE app_ext.port_context_capabilities SET active_from = clock_timestamp() + interval '1 day'
 WHERE capability_id = (SELECT capability_id FROM app_ext.port_context_capabilities ORDER BY capability_id LIMIT 1);
SQL
if BCB_TEST_WEBAPP_STAFF_PASSWORD=x BCB_TEST_WEBAPP_PATIENT_PASSWORD=x BCB_TEST_WEBAPP_GLOBAL_ADMIN_PASSWORD=x BCB_TEST_INTEGRATOR_PASSWORD=x \
  node "$repo_root/deploy/postgres/privileges/install-post-zero.mjs" --db "$db_name" --env test --admin-socket "$data_dir" --admin-port "$port" >/dev/null 2>&1; then
  fail 'installer accepted injected target drift without zero'
fi
zero
install >/dev/null
admin -Atc "SELECT count(*) FROM pg_policy WHERE polname='postzero_rogue'" | grep -qx 0
admin -Atc "SELECT relforcerowsecurity FROM pg_class WHERE oid='public.platform_users'::regclass" | grep -qx t
admin -Atc "SELECT count(*) FROM app_ext.port_context_capabilities WHERE active_from > clock_timestamp() OR active_until IS NOT NULL" | grep -qx 0

# A late error after env render rolls every installer DDL back to exact zero, including LOGIN shells.
zero
mv "$repo_root/deploy/postgres/generated/privileges.$db_name.sql" "$work_dir/privileges.sql"
trap 'cp "$work_dir/privileges.sql" "$repo_root/deploy/postgres/generated/privileges.'"$db_name"'.sql" 2>/dev/null || true; cleanup' EXIT
{ cat "$work_dir/privileges.sql"; printf '\nSELECT 1/0;\n'; } > "$repo_root/deploy/postgres/generated/privileges.$db_name.sql"
if BCB_TEST_WEBAPP_STAFF_PASSWORD=x BCB_TEST_WEBAPP_PATIENT_PASSWORD=x BCB_TEST_WEBAPP_GLOBAL_ADMIN_PASSWORD=x BCB_TEST_INTEGRATOR_PASSWORD=x \
  node "$repo_root/deploy/postgres/privileges/install-post-zero.mjs" --db "$db_name" --env test --admin-socket "$data_dir" --admin-port "$port" >/dev/null 2>&1; then
  fail 'late installer failure unexpectedly committed'
fi
cp "$work_dir/privileges.sql" "$repo_root/deploy/postgres/generated/privileges.$db_name.sql"
admin -Atc "SELECT count(*) FROM pg_roles WHERE rolname IN ('bcb_test_webapp_staff','bcb_test_webapp_patient','bcb_test_webapp_global_admin','bcb_test_integrator')" | grep -qx 0
admin -1 < <(node --experimental-strip-types "$repo_root/deploy/postgres/privileges/generate-cli.mjs" --db "$db_name" --zero-state-verify) >/dev/null

zero
install >/dev/null
echo 'post-zero installer acceptance: PASS (real PG16 zero→cluster-zero→installer, drift repair, rollback, deterministic replay)'
