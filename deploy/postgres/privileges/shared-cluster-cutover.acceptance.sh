#!/usr/bin/env bash
# Restore-shaped PostgreSQL 16 proof for the offline DEV+TEST access cutover.
# The source cluster is read schema-only; every write stays in a disposable cluster under mktemp.
set -euo pipefail

pg_bin=/usr/lib/postgresql/16/bin
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
source_db=${SHARED_CUTOVER_SCHEMA_SOURCE_DB:-bersoncarebot_test}
work_dir=$(mktemp -d "${TMPDIR:-/tmp}/bcb-shared-cutover.XXXXXX")
data_dir="$work_dir/data"
log_file="$work_dir/postgres.log"
targets=(bcb_webapp_dev bersoncarebot_test)

cleanup() {
  [[ -f "$data_dir/postmaster.pid" ]] && "$pg_bin/pg_ctl" -D "$data_dir" -m immediate stop >/dev/null 2>&1 || true
  [[ "${SHARED_CUTOVER_KEEP_DISPOSABLE:-0}" == 1 ]] || rm -rf "$work_dir"
}
trap cleanup EXIT
fail() { echo "shared cluster cutover acceptance: FAIL: $*" >&2; exit 1; }
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
  "SELECT format('CREATE ROLE %I NOLOGIN;', rolname) FROM pg_roles WHERE rolname !~ '^pg_' AND rolname NOT IN ('postgres','dev') ORDER BY rolname" \
  > "$work_dir/source-roles.sql"

"$pg_bin/initdb" -D "$data_dir" --auth=trust --username=dev >/dev/null
printf '%s\n' "port = $port" "unix_socket_directories = '$data_dir'" "log_min_messages = notice" >> "$data_dir/postgresql.conf"
"$pg_bin/pg_ctl" -D "$data_dir" -l "$log_file" start >/dev/null
"$pg_bin/psql" -X -v ON_ERROR_STOP=1 -h "$data_dir" -p "$port" -U dev -d postgres \
  -c 'CREATE ROLE postgres SUPERUSER LOGIN' >/dev/null
"$pg_bin/psql" -X -v ON_ERROR_STOP=1 -h "$data_dir" -p "$port" -U dev -d postgres \
  -f "$work_dir/source-roles.sql" >/dev/null

for db in "${targets[@]}"; do
  "$pg_bin/createdb" -h "$data_dir" -p "$port" -U dev "$db"
  admin "$db" -f "$work_dir/source.sql" >/dev/null
  node --experimental-strip-types "$repo_root/deploy/postgres/privileges/fixtures/production-catalog.mjs" "$db" \
    | awk '/^CREATE TABLE / { sub(/^CREATE TABLE /, "CREATE TABLE IF NOT EXISTS "); print }' \
    | admin "$db" >/dev/null 2>"$work_dir/catalog-$db.log"

  # Recreate the exact retired shapes after the current schema restore. The real offline migrations
  # must remove them before zero-state; empty rows are enough here because data preservation has its
  # own atomic migration oracle.
  admin "$db" <<'SQL' >/dev/null
CREATE TABLE IF NOT EXISTS integrator.users (
  id bigint PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS integrator.identities (
  id bigint PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES integrator.users(id),
  resource text NOT NULL,
  external_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS integrator.telegram_state (
  identity_id bigint PRIMARY KEY REFERENCES integrator.identities(id),
  username text,
  first_name text,
  last_name text,
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS integrator.message_drafts (
  id bigint PRIMARY KEY,
  identity_id bigint REFERENCES integrator.identities(id)
);
CREATE TABLE IF NOT EXISTS public.appointment_records (
  id uuid PRIMARY KEY,
  integrator_record_id text NOT NULL UNIQUE
);
ALTER TABLE public.clinical_visit ADD COLUMN IF NOT EXISTS appointment_record_id uuid
  REFERENCES public.appointment_records(id);
SQL
  admin "$db" -1 -f "$repo_root/apps/webapp/db/drizzle-migrations/0385_channel_binding_display_handle_local.sql" >/dev/null
  admin "$db" -1 -f "$repo_root/apps/integrator/src/infra/db/migrations/core/20260812_0001_offline_drop_legacy_identity.sql" >/dev/null
  admin "$db" -1 -f "$repo_root/apps/webapp/db/drizzle-migrations/0386_offline_drop_legacy_appointment_records_local.sql" >/dev/null
  assert_eq "$(admin "$db" -Atc "SELECT count(*) FROM unnest(ARRAY['integrator.users','integrator.identities','integrator.telegram_state','integrator.message_drafts','public.appointment_records']) n WHERE to_regclass(n) IS NOT NULL")" 0
done

run_cutover() {
  BCB_DEV_WEBAPP_STAFF_PASSWORD=dev-staff \
  BCB_DEV_WEBAPP_PATIENT_PASSWORD=dev-patient \
  BCB_DEV_INTEGRATOR_PASSWORD=dev-integrator \
  BCB_TEST_WEBAPP_STAFF_PASSWORD=test-staff \
  BCB_TEST_WEBAPP_PATIENT_PASSWORD=test-patient \
  BCB_TEST_INTEGRATOR_PASSWORD=test-integrator \
    node "$repo_root/deploy/postgres/privileges/install-dev-test-shared-cluster.mjs" \
      --admin-socket "$data_dir" --admin-port "$port"
}

# A failure after the DEV base has committed must erase both environments back to exact zero.
admin bersoncarebot_test -c \
  'ALTER TABLE public.clinical_visit RENAME COLUMN canonical_appointment_id TO injected_missing_canonical_appointment_id' \
  >/dev/null
if run_cutover >"$work_dir/failure.out" 2>&1; then
  fail 'cutover accepted a missing declared TEST column'
fi
grep -q 'both databases were returned to verified zero' "$work_dir/failure.out" \
  || { cat "$work_dir/failure.out" >&2; fail 'failure did not report verified bilateral zero'; }
for db in "${targets[@]}"; do
  node --experimental-strip-types "$repo_root/deploy/postgres/privileges/generate-cli.mjs" --db "$db" --zero-state-verify \
    | admin "$db" -1 >/dev/null
done
admin bersoncarebot_test -c \
  'ALTER TABLE public.clinical_visit RENAME COLUMN injected_missing_canonical_appointment_id TO canonical_appointment_id' \
  >/dev/null

run_cutover >"$work_dir/success.out" 2>&1 \
  || { cat "$work_dir/success.out" >&2; fail 'shared cutover did not complete'; }
grep -q 'shared DEV+TEST cutover committed' "$work_dir/success.out" || fail 'success marker missing'
assert_eq "$(admin postgres -Atc "SELECT count(*) FROM pg_roles WHERE rolcanlogin AND rolname ~ '^bcb_(dev|test)_(webapp_staff|webapp_patient|integrator)$'")" 6
assert_eq "$(admin postgres -Atc "SELECT count(*) FROM pg_roles WHERE rolcanlogin AND rolname ~ '^(app_|bcb_|saas_|bersoncarebot_)' AND rolname !~ '^bcb_(dev|test)_(webapp_staff|webapp_patient|integrator)$'")" 0

for spec in 'dev bcb_webapp_dev' 'test bersoncarebot_test'; do
  read -r env_name db <<<"$spec"
  node --experimental-strip-types "$repo_root/deploy/postgres/privileges/generate-cli.mjs" \
    --env "$env_name" --db "$db" --env-verify | admin "$db" >/dev/null
  node --experimental-strip-types "$repo_root/deploy/postgres/privileges/generate-cli.mjs" \
    --db "$db" --port-context-verify | admin "$db" -1 >/dev/null
done

assert_eq "$(admin bcb_webapp_dev -Atc "SELECT has_database_privilege('bcb_test_webapp_staff','bcb_webapp_dev','CONNECT')")" f
assert_eq "$(admin bersoncarebot_test -Atc "SELECT has_database_privilege('bcb_dev_webapp_staff','bersoncarebot_test','CONNECT')")" f
echo 'shared cluster cutover acceptance: PASS (legacy drop both -> zero both -> cluster zero -> base both -> six exact logins, late-failure repair)'
