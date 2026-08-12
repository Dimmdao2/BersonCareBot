#!/usr/bin/env bash
# PostgreSQL 16 behavioral proof: a cutover changes exactly one target database.
# The schema source is read-only; every write stays in a disposable two-database cluster.
set -euo pipefail

pg_bin=${PGBIN:-/usr/lib/postgresql/16/bin}
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
source_db=${SINGLE_TARGET_SCHEMA_SOURCE_DB:-bcb_webapp_dev}
work_dir=$(mktemp -d "${TMPDIR:-/tmp}/bcb-single-target-cutover.XXXXXX")
data_dir="$work_dir/data"
log_file="$work_dir/postgres.log"
target_db=bcb_webapp_dev
sibling_db=bersoncarebot_test

cleanup() {
  [[ -f "$data_dir/postmaster.pid" ]] && "$pg_bin/pg_ctl" -D "$data_dir" -m immediate stop >/dev/null 2>&1 || true
  [[ "${SINGLE_TARGET_CUTOVER_KEEP_DISPOSABLE:-0}" == 1 ]] || rm -rf "$work_dir"
}
trap cleanup EXIT
fail() { echo "single-target cutover acceptance: FAIL: $*" >&2; exit 1; }
admin() {
  local db=$1
  shift
  "$pg_bin/psql" -X -v ON_ERROR_STOP=1 -h "$data_dir" -p "$port" -U postgres -d "$db" "$@"
}
assert_eq() { [[ "$1" == "$2" ]] || fail "expected [$2], got [$1]"; }

port=0
for _ in $(seq 1 35); do
  candidate=$((58000 + RANDOM % 1000))
  if ! ss -ltn "sport = :$candidate" 2>/dev/null | grep -q LISTEN; then port=$candidate; break; fi
done
[[ "$port" != 0 ]] || fail 'no free disposable port'

sudo -n -u postgres "$pg_bin/pg_dump" --schema-only --no-owner --no-privileges \
  --dbname="$source_db" > "$work_dir/source.sql"
sudo -n -u postgres "$pg_bin/psql" -X -At -d postgres -c \
  "SELECT format('CREATE ROLE %I NOLOGIN;', rolname) FROM pg_roles WHERE rolname !~ '^pg_' AND rolname NOT IN ('postgres','dev') AND rolname !~ '^bcb_(dev|test)_(webapp_staff|webapp_patient|webapp_global_admin|integrator)$' ORDER BY rolname" \
  > "$work_dir/source-roles.sql"

"$pg_bin/initdb" -D "$data_dir" --auth=trust --username=dev >/dev/null
printf '%s\n' "port = $port" "unix_socket_directories = '$data_dir'" "log_min_messages = notice" >> "$data_dir/postgresql.conf"
"$pg_bin/pg_ctl" -D "$data_dir" -l "$log_file" start >/dev/null
"$pg_bin/psql" -X -v ON_ERROR_STOP=1 -h "$data_dir" -p "$port" -U dev -d postgres \
  -c 'CREATE ROLE postgres SUPERUSER LOGIN' >/dev/null
"$pg_bin/psql" -X -v ON_ERROR_STOP=1 -h "$data_dir" -p "$port" -U dev -d postgres \
  -f "$work_dir/source-roles.sql" >/dev/null

for db in "$target_db" "$sibling_db"; do
  "$pg_bin/createdb" -h "$data_dir" -p "$port" -U dev "$db"
  admin "$db" -f "$work_dir/source.sql" >/dev/null
  node --experimental-strip-types "$repo_root/deploy/postgres/privileges/fixtures/production-catalog.mjs" "$db" \
    | awk '/^CREATE SCHEMA IF NOT EXISTS / { print; next } /^CREATE TABLE / { sub(/^CREATE TABLE /, "CREATE TABLE IF NOT EXISTS "); print }' \
    | admin "$db" >/dev/null 2>"$work_dir/catalog-$db.log"
  # Canonical external legacy stage: it is committed before access zero/cutover.
  admin "$db" -1 -f "$repo_root/apps/integrator/src/infra/db/migrations/core/20260812_0001_offline_drop_legacy_identity.sql" \
    >/dev/null
  node --experimental-strip-types "$repo_root/deploy/postgres/privileges/fixtures/post-legacy-schema.mjs" "$db" \
    | admin "$db" >/dev/null
  if [[ "$db" == "$target_db" ]]; then fixture_env=dev; else fixture_env=test; fi
  {
    printf '\\set DBNAME %s\n' "$db"
    node --experimental-strip-types "$repo_root/deploy/postgres/privileges/generate-cli.mjs" \
      --env "$fixture_env" --db "$db" --env-login-shells
    printf '\\i %s\n' "$repo_root/deploy/postgres/port-context/contract.sql"
    node --experimental-strip-types "$repo_root/deploy/postgres/privileges/generate-cli.mjs" \
      --db "$db" --relation-wall-registry
    printf '\\i %s\n' "$repo_root/deploy/postgres/privileges/post-zero-roots.sql"
    node --experimental-strip-types "$repo_root/deploy/postgres/privileges/fixtures/function-shells.mjs" "$db"
  } | admin "$db" >/dev/null
done

run_cutover() {
  local env_name=$1
  local db_name=$2
  local backup_file=$3
  BCB_DEV_WEBAPP_STAFF_PASSWORD=dev-staff \
  BCB_DEV_WEBAPP_PATIENT_PASSWORD=dev-patient \
  BCB_DEV_WEBAPP_GLOBAL_ADMIN_PASSWORD=dev-global-admin \
  BCB_DEV_INTEGRATOR_PASSWORD=dev-integrator \
  BCB_TEST_WEBAPP_STAFF_PASSWORD=test-staff \
  BCB_TEST_WEBAPP_PATIENT_PASSWORD=test-patient \
  BCB_TEST_WEBAPP_GLOBAL_ADMIN_PASSWORD=test-global-admin \
  BCB_TEST_INTEGRATOR_PASSWORD=test-integrator \
    node "$repo_root/deploy/postgres/privileges/initial-cutover.mjs" \
      --env "$env_name" --db "$db_name" --admin-socket "$data_dir" --admin-port "$port" \
      --backup-file "$backup_file"
}

assert_backup() {
  local backup_file=$1
  [[ -s "$backup_file" ]] || fail "backup is absent or empty: $backup_file"
  [[ "$(head -c 5 "$backup_file")" == PGDMP ]] || fail "backup lacks custom-archive magic: $backup_file"
  "$pg_bin/pg_restore" --list "$backup_file" >/dev/null \
    || fail "backup cannot be listed: $backup_file"
}

# An overwrite refusal is a pre-mutation gate, not a recoverable cutover failure.
"$pg_bin/pg_dump" --schema-only --no-owner -h "$data_dir" -p "$port" -U postgres "$sibling_db" \
  | grep -Ev '^\\(un)?restrict ' | sha256sum >"$work_dir/sibling-before-backup-gate"
printf 'preexisting-file\n' >"$work_dir/refuse-overwrite.dump"
if run_cutover test "$sibling_db" "$work_dir/refuse-overwrite.dump" >"$work_dir/refuse-overwrite.out" 2>&1; then
  fail 'cutover overwrote an existing backup path'
fi
grep -q 'must name a new file; refusing overwrite' "$work_dir/refuse-overwrite.out" \
  || { cat "$work_dir/refuse-overwrite.out" >&2; fail 'overwrite gate did not fail for the expected reason'; }
"$pg_bin/pg_dump" --schema-only --no-owner -h "$data_dir" -p "$port" -U postgres "$sibling_db" \
  | grep -Ev '^\\(un)?restrict ' | sha256sum >"$work_dir/sibling-after-backup-gate"
cmp -s "$work_dir/sibling-before-backup-gate" "$work_dir/sibling-after-backup-gate" \
  || fail 'backup overwrite gate mutated the target database'

# Establish a real sibling target first. This is the state that a later DEV-only cutover must preserve.
run_cutover test "$sibling_db" "$work_dir/sibling-initial.dump" >"$work_dir/sibling-install.out" 2>&1 \
  || { cat "$work_dir/sibling-install.out" >&2; fail 'sibling baseline cutover failed'; }
assert_backup "$work_dir/sibling-initial.dump"
admin "$sibling_db" -c "INSERT INTO app_ext.variant_a_identity_refs(physical_user_id,opaque_ref) VALUES ('00000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000008');" >/dev/null

sibling_fingerprint() {
  "$pg_bin/pg_dump" --schema-only --no-owner -h "$data_dir" -p "$port" -U postgres "$sibling_db" \
    | grep -Ev '^\\(un)?restrict '
  admin "$sibling_db" -Atc "SELECT physical_user_id || ':' || opaque_ref FROM app_ext.variant_a_identity_refs ORDER BY physical_user_id"
  admin postgres -Atc "SELECT role.rolname,role.rolcanlogin,role.rolsuper,role.rolcreatedb,role.rolcreaterole,role.rolinherit,role.rolreplication,role.rolbypassrls,coalesce(role.rolconfig::text,'') FROM pg_roles role WHERE role.rolname LIKE 'bcb_test_%' ORDER BY role.rolname"
  admin postgres -Atc "SELECT granted.rolname,member.rolname,membership.admin_option,membership.inherit_option,membership.set_option FROM pg_auth_members membership JOIN pg_roles granted ON granted.oid=membership.roleid JOIN pg_roles member ON member.oid=membership.member WHERE member.rolname LIKE 'bcb_test_%' OR granted.rolname LIKE 'bcb_test_%' ORDER BY 1,2"
}
sibling_fingerprint >"$work_dir/sibling-before"
target_oid_before=$(admin postgres -Atc "SELECT oid FROM pg_database WHERE datname='$target_db'")
sibling_oid_before=$(admin postgres -Atc "SELECT oid FROM pg_database WHERE datname='$sibling_db'")

# Inject a late install fault. The target must return to verified per-DB zero; sibling must be byte/semantic identical.
admin "$target_db" -c \
  'ALTER TABLE public.clinical_visit RENAME COLUMN canonical_appointment_id TO injected_missing_canonical_appointment_id' \
  >/dev/null
if run_cutover dev "$target_db" "$work_dir/target-fault.dump" >"$work_dir/failure.out" 2>&1; then
  fail 'cutover accepted a missing declared target column'
fi
assert_backup "$work_dir/target-fault.dump"
grep -q "database $target_db remains at verified zero" "$work_dir/failure.out" \
  || { cat "$work_dir/failure.out" >&2; fail 'failure did not report verified target-only zero'; }
node --experimental-strip-types "$repo_root/deploy/postgres/privileges/generate-cli.mjs" \
  --db "$target_db" --zero-state-verify | admin "$target_db" -1 >/dev/null
sibling_fingerprint >"$work_dir/sibling-after-fault"
cmp -s "$work_dir/sibling-before" "$work_dir/sibling-after-fault" \
  || { diff -u "$work_dir/sibling-before" "$work_dir/sibling-after-fault" >&2 || true; fail 'fault cleanup changed sibling'; }

admin "$target_db" -c \
  'ALTER TABLE public.clinical_visit RENAME COLUMN injected_missing_canonical_appointment_id TO canonical_appointment_id' \
  >/dev/null
run_cutover dev "$target_db" "$work_dir/target-success.dump" >"$work_dir/success.out" 2>&1 \
  || { cat "$work_dir/success.out" >&2; fail 'target cutover did not complete'; }
assert_backup "$work_dir/target-success.dump"
grep -q "single-target initial cutover committed: env=dev database=$target_db" "$work_dir/success.out" \
  || fail 'success marker missing'

sibling_fingerprint >"$work_dir/sibling-after-success"
cmp -s "$work_dir/sibling-before" "$work_dir/sibling-after-success" \
  || { diff -u "$work_dir/sibling-before" "$work_dir/sibling-after-success" >&2 || true; fail 'successful target cutover changed sibling'; }
assert_eq "$(admin postgres -Atc "SELECT oid FROM pg_database WHERE datname='$target_db'")" "$target_oid_before"
assert_eq "$(admin postgres -Atc "SELECT oid FROM pg_database WHERE datname='$sibling_db'")" "$sibling_oid_before"

node --experimental-strip-types "$repo_root/deploy/postgres/privileges/generate-cli.mjs" \
  --env dev --db "$target_db" --env-verify | admin "$target_db" >/dev/null
node --experimental-strip-types "$repo_root/deploy/postgres/privileges/generate-cli.mjs" \
  --env test --db "$sibling_db" --env-verify | admin "$sibling_db" >/dev/null
assert_eq "$(admin postgres -Atc "SELECT count(*) FROM pg_roles WHERE rolcanlogin AND rolname ~ '^bcb_(dev|test)_(webapp_staff|webapp_patient|webapp_global_admin|integrator)$'")" 8
assert_eq "$(admin "$sibling_db" -Atc "SELECT physical_user_id || ':' || opaque_ref FROM app_ext.variant_a_identity_refs")" \
  '00000000-0000-0000-0000-000000000007:00000000-0000-0000-0000-000000000008'

echo 'single-target cutover acceptance: PASS (target-only zero/install, sibling byte+semantic invariant, late-fault zero, database OIDs unchanged)'
