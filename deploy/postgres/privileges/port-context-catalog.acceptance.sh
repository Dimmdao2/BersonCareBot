#!/usr/bin/env bash
# Disposable PostgreSQL 16 oracle for the declaration-owned production catalog.
set -euo pipefail

pg_bin=/usr/lib/postgresql/16/bin
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
cd "$repo_root"
work_dir=$(mktemp -d "${TMPDIR:-/tmp}/bcb-portctx-catalog.XXXXXX")
data_dir="$work_dir/data"
log_file="$work_dir/postgres.log"
db_name=bersoncarebot_test
staff_login=bcb_test_webapp_staff
patient_login=bcb_test_webapp_patient
global_admin_login=bcb_test_webapp_global_admin
integrator_login=bcb_test_integrator
full_schema_source_db=${PORTCTX_FULL_SCHEMA_SOURCE_DB:-}
full_schema_mode=0
[[ -n "$full_schema_source_db" ]] && full_schema_mode=1
port=0
for _ in $(seq 1 35); do
  candidate=$((56000 + RANDOM % 1000))
  if ! ss -ltn "sport = :$candidate" 2>/dev/null | grep -q LISTEN; then port=$candidate; break; fi
done
[[ "$port" != 0 ]] || { echo 'port-context catalog: no free disposable port' >&2; exit 1; }

cleanup() {
  if [[ -f "$data_dir/postmaster.pid" ]]; then
    "$pg_bin/pg_ctl" -D "$data_dir" -m immediate stop >/dev/null 2>&1 || true
  fi
  [[ "${PORTCTX_KEEP_DISPOSABLE:-0}" == 1 ]] || rm -rf "$work_dir"
}
trap cleanup EXIT
fail() { echo "port-context catalog: FAIL: $*" >&2; exit 1; }
assert_eq() { [[ "$1" == "$2" ]] || fail "expected [$2], got [$1]"; }
psql_admin() {
  "$pg_bin/psql" -X -v ON_ERROR_STOP=1 -h "$data_dir" -p "$port" -U dev -d "$db_name" "$@"
}

if [[ "$full_schema_mode" == 1 ]]; then
  # The shell opens these files as the current user; sudo is used only for the
  # source cluster connection required by its local HBA.
  sudo -n -u postgres "$pg_bin/pg_dump" --schema-only --no-owner --no-privileges \
    --dbname="$full_schema_source_db" > "$work_dir/source-schema.sql"
  sudo -n -u postgres "$pg_bin/psql" -X -At -d postgres -c \
    "SELECT format('CREATE ROLE %I NOLOGIN;', rolname) FROM pg_roles WHERE rolname !~ '^pg_' AND rolname NOT IN ('postgres','dev') ORDER BY rolname" \
    > "$work_dir/source-roles.sql"
fi

"$pg_bin/initdb" -D "$data_dir" --auth=trust --username=dev >/dev/null
printf '%s\n' "port = $port" "unix_socket_directories = '$data_dir'" >> "$data_dir/postgresql.conf"
"$pg_bin/pg_ctl" -D "$data_dir" -l "$log_file" start >/dev/null
"$pg_bin/createdb" -h "$data_dir" -p "$port" -U dev "$db_name"
if [[ "$full_schema_mode" == 1 ]]; then
  # initdb deliberately uses the disposable admin name `dev`, while the real
  # declaration assigns database/default-privilege ownership to `postgres`.
  # Recreate that cluster role before restoring the owner-free schema so the
  # production-shaped privilege artifact is executable without weakening its
  # declared owner.
  psql_admin -c 'CREATE ROLE postgres SUPERUSER NOLOGIN' >/dev/null
  psql_admin -f "$work_dir/source-roles.sql" >/dev/null
  psql_admin -f "$work_dir/source-schema.sql" >/dev/null
fi
psql_admin <<SQL >/dev/null
DO \$roles\$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY[
    '$staff_login','$patient_login','$global_admin_login','$integrator_login',
    'bcb_dev_webapp_staff','bcb_dev_webapp_patient','bcb_dev_webapp_global_admin','bcb_dev_integrator'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format('CREATE ROLE %I LOGIN', role_name);
    ELSE
      EXECUTE format('ALTER ROLE %I LOGIN', role_name);
    END IF;
  END LOOP;
END
\$roles\$;
SQL
psql_admin \
  -v app_staff_login="$staff_login" \
  -v app_patient_login="$patient_login" \
  -v app_global_admin_login="$global_admin_login" \
  -v integrator_login="$integrator_login" \
  -f "$repo_root/deploy/postgres/port-context/contract.sql" >/dev/null

if [[ "$full_schema_mode" == 1 ]]; then
  psql_admin -f "$repo_root/deploy/postgres/privileges/post-zero-roots.sql" >/dev/null
  awk '
    /^CREATE OR REPLACE FUNCTION / { capture=1 }
    capture { print }
    capture && /^\$function\$;$/ { capture=0; print "" }
  ' "$repo_root/deploy/postgres/integrator-server-runtime-config.sql" \
    "$repo_root/deploy/postgres/c4-operational-runtime.sql" \
    "$repo_root/deploy/postgres/test-saas-isolation-telemetry-fixtures.sql" \
    > "$work_dir/canonical-test-roots.sql"
  psql_admin -f "$work_dir/canonical-test-roots.sql" >/dev/null
fi

if [[ "$full_schema_mode" == 0 ]]; then
psql_admin <<'SQL' >/dev/null
CREATE OR REPLACE FUNCTION app.password_login_acquire(text,text,uuid,text) RETURNS boolean LANGUAGE sql AS 'SELECT true';
CREATE OR REPLACE FUNCTION app.password_login_complete(uuid,boolean) RETURNS boolean LANGUAGE sql AS 'SELECT true';
CREATE OR REPLACE FUNCTION app.password_login_read_altcha_secret() RETURNS boolean LANGUAGE sql AS 'SELECT true';
CREATE OR REPLACE FUNCTION app.password_login_issue_altcha_challenge(text,uuid,text,timestamp with time zone) RETURNS boolean LANGUAGE sql AS 'SELECT true';
CREATE OR REPLACE FUNCTION app.resolve_outgoing_delivery_scope(uuid) RETURNS boolean LANGUAGE sql AS 'SELECT true';
CREATE OR REPLACE FUNCTION app.operator_incident_alert_already_sent(uuid) RETURNS boolean LANGUAGE sql AS 'SELECT true';
CREATE OR REPLACE FUNCTION app.mark_operator_incident_alert_sent(uuid) RETURNS boolean LANGUAGE sql AS 'SELECT true';
CREATE OR REPLACE FUNCTION app.list_scheduler_reminder_organization_ids() RETURNS boolean LANGUAGE sql AS 'SELECT true';
CREATE OR REPLACE FUNCTION app.revalidate_appointment_reminder_materialization(uuid) RETURNS boolean LANGUAGE sql AS 'SELECT true';
CREATE OR REPLACE FUNCTION app.advance_appointment_reminder_messenger_ladder(uuid,integer,text) RETURNS boolean LANGUAGE sql AS 'SELECT true';
CREATE OR REPLACE FUNCTION app.read_integrator_migration_ledger() RETURNS boolean LANGUAGE sql AS 'SELECT true';
CREATE OR REPLACE FUNCTION app.upsert_integration_data_quality_incident(text,text,text,text,text,text,text) RETURNS boolean LANGUAGE sql AS 'SELECT true';
CREATE OR REPLACE FUNCTION app.try_acquire_integrator_idempotency(text,integer) RETURNS boolean LANGUAGE sql AS 'SELECT true';
CREATE OR REPLACE FUNCTION app.release_integrator_idempotency(text) RETURNS boolean LANGUAGE sql AS 'SELECT true';
CREATE OR REPLACE FUNCTION app.read_patient_telegram_display_handle(uuid) RETURNS boolean LANGUAGE sql AS 'SELECT true';
CREATE OR REPLACE FUNCTION app.get_google_calendar_event_id(uuid) RETURNS boolean LANGUAGE sql AS 'SELECT true';
CREATE OR REPLACE FUNCTION app.upsert_google_calendar_event_id(uuid,text) RETURNS boolean LANGUAGE sql AS 'SELECT true';
CREATE OR REPLACE FUNCTION app.delete_google_calendar_event_id(uuid) RETURNS boolean LANGUAGE sql AS 'SELECT true';
CREATE OR REPLACE FUNCTION app.read_booking_calendar_patient_profile(uuid) RETURNS boolean LANGUAGE sql AS 'SELECT true';
CREATE OR REPLACE FUNCTION app.read_booking_calendar_latest_staff_comment(uuid) RETURNS boolean LANGUAGE sql AS 'SELECT true';
CREATE OR REPLACE FUNCTION app.is_current_patient_self_booking_allowed() RETURNS boolean LANGUAGE sql AS 'SELECT true';
CREATE OR REPLACE FUNCTION app.find_phone_messenger_bind_secret(text) RETURNS boolean LANGUAGE sql AS 'SELECT true';
CREATE OR REPLACE FUNCTION app.start_login_phone_messenger_bind(text,text,text,timestamp with time zone) RETURNS boolean LANGUAGE sql AS 'SELECT true';
CREATE OR REPLACE FUNCTION app.start_profile_phone_messenger_bind(text,text,text,timestamp with time zone) RETURNS boolean LANGUAGE sql AS 'SELECT true';
CREATE OR REPLACE FUNCTION app.begin_phone_messenger_bind_completion(text,text,text,text) RETURNS boolean LANGUAGE sql AS 'SELECT true';
CREATE OR REPLACE FUNCTION app.consume_phone_messenger_bind_secret_by_challenge(uuid) RETURNS boolean LANGUAGE sql AS 'SELECT true';
SQL
fi

psql_admin -1 -f "$repo_root/deploy/postgres/generated/port-context-capabilities.${db_name}.sql" >/dev/null
if [[ "$full_schema_mode" == 1 ]]; then
  psql_admin -1 -f "$repo_root/deploy/postgres/generated/privileges.${db_name}.sql" >/dev/null
  node "$repo_root/deploy/postgres/privileges/generate-cli.mjs" --env test --db "$db_name" |
    psql_admin -1 \
      -v BCB_TEST_INTEGRATOR_PASSWORD=disposable-integrator \
      -v BCB_TEST_WEBAPP_PATIENT_PASSWORD=disposable-patient \
      -v BCB_TEST_WEBAPP_GLOBAL_ADMIN_PASSWORD=disposable-global-admin \
      -v BCB_TEST_WEBAPP_STAFF_PASSWORD=disposable-staff >/dev/null
fi
node --experimental-strip-types "$repo_root/deploy/postgres/privileges/generate-cli.mjs" \
  --db "$db_name" --port-context-verify | psql_admin -1 >/dev/null

web_assignment=$(node "$repo_root/deploy/postgres/privileges/generate-cli.mjs" --env test --db "$db_name" --port-context-env webapp)
integrator_assignment=$(node "$repo_root/deploy/postgres/privileges/generate-cli.mjs" --env test --db "$db_name" --port-context-env integrator)
web_json=${web_assignment#*=}; web_json=${web_json#\'}; web_json=${web_json%\'}
integrator_json=${integrator_assignment#*=}; integrator_json=${integrator_json#\'}; integrator_json=${integrator_json%\'}
db_json=$(psql_admin -Atc "
  SELECT json_agg(json_build_object(
    'port', port::text, 'capabilityId', capability_id::text,
    'targetRole', target_role::text, 'contextClass', context_class::text,
    'purpose', purpose, 'functionIdentity', function_identity::regprocedure::text
  ) ORDER BY capability_id)::text
  FROM app_ext.port_context_capabilities")
WEB_JSON="$web_json" INTEGRATOR_JSON="$integrator_json" DB_JSON="$db_json" node --input-type=module <<'JS'
import assert from 'node:assert/strict';
const db = JSON.parse(process.env.DB_JSON);
for (const [port, envName] of [
  ['webapp', 'WEB_JSON'],
  ['integrator', 'INTEGRATOR_JSON'],
]) {
  const allRuntime = Object.values(JSON.parse(process.env[envName]));
  const runtime = allRuntime;
  const roots = allRuntime.filter((descriptor) => descriptor.functionIdentity);
  const relations = allRuntime.filter((descriptor) => descriptor.purpose === 'relation');
  const catalogRows = runtime.map(({ runtimeSources: _runtimeSources, ...descriptor }) => descriptor);
  const rows = db.filter((row) => row.port === port).map(({ port: _port, functionIdentity, ...row }) => ({
    ...row,
    ...(functionIdentity === null ? {} : { functionIdentity }),
  }));
  const sorted = (values) => values.sort((a, b) => a.capabilityId.localeCompare(b.capabilityId));
  assert.ok(runtime.length > 0, `${port} must declare capabilities`);
  assert.ok(roots.length > 0, `${port} must declare named roots`);
  assert.ok(relations.length > 0, `${port} must declare direct-relation capability`);
  assert.deepEqual(sorted(catalogRows), sorted(rows));
}
JS

expected_total=$(WEB_JSON="$web_json" INTEGRATOR_JSON="$integrator_json" node --input-type=module <<'JS'
const count = (json) => Object.keys(JSON.parse(json)).length;
console.log(count(process.env.WEB_JSON) + count(process.env.INTEGRATOR_JSON));
JS
)
assert_eq "$(psql_admin -Atc 'SELECT count(*) FROM app_ext.port_context_capabilities')" "$expected_total"
assert_eq "$(psql_admin -Atc 'SELECT count(DISTINCT capability_id) FROM app_ext.port_context_capabilities')" "$expected_total"

# A relation descriptor is a first-class capability.  Removing one must make the
# independently rendered full runtime catalog red; re-seeding is the atomic repair.
relation_capability=$(psql_admin -Atc "SELECT capability_id FROM app_ext.port_context_capabilities WHERE function_identity IS NULL ORDER BY capability_id LIMIT 1")
psql_admin -c "DELETE FROM app_ext.port_context_capabilities WHERE capability_id = '$relation_capability'::uuid" >/dev/null
if WEB_JSON="$web_json" INTEGRATOR_JSON="$integrator_json" DB_JSON="$(psql_admin -Atc "SELECT json_agg(json_build_object('capabilityId', capability_id::text) ORDER BY capability_id)::text FROM app_ext.port_context_capabilities")" node --input-type=module 2>/dev/null <<'JS'
import assert from 'node:assert/strict';
const declared = [...Object.values(JSON.parse(process.env.WEB_JSON)), ...Object.values(JSON.parse(process.env.INTEGRATOR_JSON))]
  .map(({ capabilityId }) => capabilityId).sort();
const actual = JSON.parse(process.env.DB_JSON).map(({ capabilityId }) => capabilityId).sort();
assert.deepEqual(actual, declared, 'deleted relation capability must make the full catalog mismatch');
JS
then
  echo 'relation-capability fault injection unexpectedly stayed green' >&2
  exit 1
fi
psql_admin -1 -f "$repo_root/deploy/postgres/generated/port-context-capabilities.${db_name}.sql" >/dev/null
assert_eq "$(psql_admin -Atc 'SELECT count(*) FROM app_ext.port_context_capabilities')" "$expected_total"

# Mutating an authority field with the same capability ID must fail bilateral closure.
mutated_capability=$(psql_admin -Atc "SELECT capability_id FROM app_ext.port_context_capabilities ORDER BY capability_id LIMIT 1")
psql_admin -c "UPDATE app_ext.port_context_capabilities SET purpose = purpose || '.mutated' WHERE capability_id = '$mutated_capability'::uuid" >/dev/null
if node --experimental-strip-types "$repo_root/deploy/postgres/privileges/generate-cli.mjs" \
    --db "$db_name" --port-context-verify | psql_admin -1 >/dev/null 2>&1; then
  fail 'mutated catalog row unexpectedly passed bilateral exact verifier'
fi
psql_admin -1 -f "$repo_root/deploy/postgres/generated/port-context-capabilities.${db_name}.sql" >/dev/null

# A stale managed-login row must fail even when the total is otherwise plausible.
psql_admin -c "INSERT INTO app_ext.port_context_capabilities(capability_id,port,session_login,target_role,context_class,purpose,function_identity) VALUES ('ffffffff-ffff-4fff-8fff-ffffffffffff','webapp','$staff_login','app_staff','staff','stale.probe',NULL)" >/dev/null
if node --experimental-strip-types "$repo_root/deploy/postgres/privileges/generate-cli.mjs" \
    --db "$db_name" --port-context-verify | psql_admin -1 >/dev/null 2>&1; then
  fail 'stale catalog row unexpectedly passed bilateral exact verifier'
fi
psql_admin -1 -f "$repo_root/deploy/postgres/generated/port-context-capabilities.${db_name}.sql" >/dev/null

assert_eq "$(psql_admin -Atc "
WITH expected(session_login, target_role) AS (
  VALUES
    ('$staff_login','app_pre_session'), ('$staff_login','app_staff'),
    ('$staff_login','app_clinic_billing'), ('$staff_login','app_worker'),
    ('$staff_login','app_operational_media_worker'),
    ('$staff_login','saas_telemetry_operator'),
    ('$patient_login','app_pre_session'), ('$patient_login','app_patient'),
    ('$global_admin_login','app_platform_settings'), ('$global_admin_login','app_platform_admin'),
    ('$integrator_login','app_integrator_request'), ('$integrator_login','app_integrator_resolver'),
    ('$integrator_login','app_operational_delivery_worker'), ('$integrator_login','app_operational_scheduler'),
    ('$integrator_login','app_tenant_service'), ('$integrator_login','app_service')
)
SELECT count(*) FROM expected
WHERE pg_has_role(session_login, target_role, 'SET')")" 16
assert_eq "$(psql_admin -Atc "SELECT
  pg_has_role('$staff_login','app_tenant_service','SET')
  OR pg_has_role('$staff_login','app_service','SET')")" f

pnpm --dir "$repo_root/packages/db-principal" run build >/dev/null
uuid=11111111-1111-4111-8111-111111111111
while IFS='|' read -r capability expected; do
  case "$capability" in
    password_login_acquire)
      expression="ARRAY[ROW('text@1',textsend('doctor@example.test')),ROW('text@1',textsend('ip-hash')),ROW('uuid@1',NULL),ROW('text@1',NULL)]::app.port_typed_arg[]" ;;
    password_login_complete)
      expression="ARRAY[ROW('uuid@1',uuid_send('$uuid'::uuid)),ROW('boolean@1',boolsend(true))]::app.port_typed_arg[]" ;;
    password_login_issue_altcha_challenge)
      expression="ARRAY[ROW('text@1',textsend('challenge')),ROW('uuid@1',uuid_send('$uuid'::uuid)),ROW('text@1',textsend('salt')),ROW('timestamptz@1',timestamptz_send('2026-08-11T12:34:56.123456Z'::timestamptz))]::app.port_typed_arg[]" ;;
    password_login_read_altcha_secret|list_scheduler_reminder_organization_ids)
      expression='ARRAY[]::app.port_typed_arg[]' ;;
    advance_appointment_reminder_messenger_ladder)
      expression="ARRAY[ROW('uuid@1',uuid_send('$uuid'::uuid)),ROW('integer@1',int4send(2)),ROW('text@1',textsend('provider_timeout'))]::app.port_typed_arg[]" ;;
    *) expression="ARRAY[ROW('uuid@1',uuid_send('$uuid'::uuid))]::app.port_typed_arg[]" ;;
  esac
  actual=$(psql_admin -Atc "SELECT encode(app.hash_port_typed_args($expression),'hex')")
  assert_eq "$actual" "$expected"
done < <(UUID="$uuid" node --input-type=module <<'JS'
import { hashPortTypedArgs, portTypedArgsForFunctionIdentity } from './packages/db-principal/dist/portContext.js';
const uuid = process.env.UUID;
const vectors = {
  password_login_acquire: ['app.password_login_acquire(text,text,uuid,text)', ['doctor@example.test', 'ip-hash', null, null]],
  password_login_complete: ['app.password_login_complete(uuid,boolean)', [uuid, true]],
  password_login_issue_altcha_challenge: ['app.password_login_issue_altcha_challenge(text,uuid,text,timestamp with time zone)', ['challenge', uuid, 'salt', '2026-08-11T12:34:56.123456Z']],
  password_login_read_altcha_secret: ['app.password_login_read_altcha_secret()', []],
  advance_appointment_reminder_messenger_ladder: ['app.advance_appointment_reminder_messenger_ladder(uuid,integer,text)', [uuid, 2, 'provider_timeout']],
  list_scheduler_reminder_organization_ids: ['app.list_scheduler_reminder_organization_ids()', []],
  mark_operator_incident_alert_sent: ['app.mark_operator_incident_alert_sent(uuid)', [uuid]],
  operator_incident_alert_already_sent: ['app.operator_incident_alert_already_sent(uuid)', [uuid]],
  resolve_outgoing_delivery_scope: ['app.resolve_outgoing_delivery_scope(uuid)', [uuid]],
  revalidate_appointment_reminder_materialization: ['app.revalidate_appointment_reminder_materialization(uuid)', [uuid]],
};
for (const [name, [identity, args]] of Object.entries(vectors)) {
  console.log(`${name}|${hashPortTypedArgs(portTypedArgsForFunctionIdentity(identity, args)).toString('hex')}`);
}
JS
)

if [[ "$full_schema_mode" == 1 ]]; then
  # A late failure appended to the real generated artifact must roll back the
  # whole reset/reapply, byte-for-byte at the catalog dump level.
  "$pg_bin/pg_dump" -h "$data_dir" -p "$port" -U dev --schema-only --dbname="$db_name" \
    > "$work_dir/catalog-before-late-failure.sql"
  sed -E '/^\\(un)?restrict /d' "$work_dir/catalog-before-late-failure.sql" \
    > "$work_dir/catalog-before-late-failure.normalized.sql"
  if { cat "$repo_root/deploy/postgres/generated/privileges.${db_name}.sql"; echo 'SELECT 1/0;'; } |
      psql_admin -1 >"$work_dir/late-failure.out" 2>&1; then
    fail 'real generated artifact with a late failure unexpectedly committed'
  fi
  "$pg_bin/pg_dump" -h "$data_dir" -p "$port" -U dev --schema-only --dbname="$db_name" \
    > "$work_dir/catalog-after-late-failure.sql"
  sed -E '/^\\(un)?restrict /d' "$work_dir/catalog-after-late-failure.sql" \
    > "$work_dir/catalog-after-late-failure.normalized.sql"
  cmp -s "$work_dir/catalog-before-late-failure.normalized.sql" "$work_dir/catalog-after-late-failure.normalized.sql" ||
    fail 'late failure changed the catalog despite psql -1'
  psql_admin -1 -f "$repo_root/deploy/postgres/generated/privileges.${db_name}.sql" >/dev/null
  node "$repo_root/deploy/postgres/privileges/generate-cli.mjs" --env test --db "$db_name" |
    psql_admin -1 \
      -v BCB_TEST_INTEGRATOR_PASSWORD=disposable-integrator \
      -v BCB_TEST_WEBAPP_PATIENT_PASSWORD=disposable-patient \
      -v BCB_TEST_WEBAPP_GLOBAL_ADMIN_PASSWORD=disposable-global-admin \
      -v BCB_TEST_WEBAPP_STAFF_PASSWORD=disposable-staff >/dev/null

  org_a=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1
  org_b=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2
  user_a=aaaaaaaa-1111-4111-8111-aaaaaaaaaaa1
  user_b=bbbbbbbb-2222-4222-8222-bbbbbbbbbbb2
  psql_admin <<SQL >/dev/null
SET session_replication_role=replica;
INSERT INTO public.be_organizations(id,title) VALUES ('$org_a','Tenant A'),('$org_b','Tenant B') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.platform_users(id,display_name,role) VALUES ('$user_a','Patient A','client'),('$user_b','Patient B','client') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.org_enrollments(organization_id,platform_user_id,status)
VALUES ('$org_a','$user_a','active'),('$org_b','$user_b','active')
ON CONFLICT (organization_id,platform_user_id) DO UPDATE SET status='active';
RESET session_replication_role;
SQL
  tenant_capability=$(psql_admin -Atc "SELECT capability_id FROM app_ext.port_context_capabilities WHERE session_login='$integrator_login' AND target_role='app_tenant_service' AND purpose='relation' AND function_identity IS NULL")
  [[ -n "$tenant_capability" ]] || fail 'tenant relation capability missing'
  claims="ROW(1,'tenant_service'::app.port_context_class,'app_tenant_service'::name,'relation',NULL::regprocedure,decode('0355fd5ea0ae72a2f99fa916e9a78d189b3a69ab6f41dc412201df48313f6f5a','hex'),NULL::uuid,NULL::uuid,'$org_a'::uuid,NULL::bigint,NULL::uuid)::app.port_context_claims"

  psql_admin <<SQL >/dev/null
SET SESSION AUTHORIZATION $integrator_login;
BEGIN;
SELECT app.install_port_context('$tenant_capability'::uuid, $claims);
SET LOCAL ROLE app_tenant_service;
INSERT INTO public.platform_user_contacts(
  organization_id,platform_user_id,contact_type,value,value_normalized,source,created_at,updated_at
) VALUES ('$org_a','$user_a','email','a@example.test','a@example.test','merge',now(),now());
COMMIT;
RESET SESSION AUTHORIZATION;
SQL
  assert_eq "$(psql_admin -Atc "SELECT count(*) FROM public.platform_user_contacts WHERE organization_id='$org_a' AND platform_user_id='$user_a' AND value_normalized='a@example.test'")" 1

  if psql_admin <<SQL >"$work_dir/cross-org.out" 2>&1
SET SESSION AUTHORIZATION $integrator_login;
BEGIN;
SELECT app.install_port_context('$tenant_capability'::uuid, $claims);
SET LOCAL ROLE app_tenant_service;
INSERT INTO public.platform_user_contacts(
  organization_id,platform_user_id,contact_type,value,value_normalized,source,created_at,updated_at
) VALUES ('$org_b','$user_b','email','b@example.test','b@example.test','merge',now(),now());
COMMIT;
SQL
  then fail 'cross-organization tenant insert unexpectedly succeeded'; fi
  grep -q 'violates row-level security policy' "$work_dir/cross-org.out" ||
    fail 'cross-organization denial was not an RLS error'

  # One physical backend: accepted transaction sees A; ROLLBACK clears the
  # transaction-bound row and SET LOCAL role; reusing that backend is bare and
  # must loudly fail 42501.
  psql_admin -v ON_ERROR_STOP=0 <<SQL >"$work_dir/backend-reuse.out" 2>&1
\set QUIET 1
SELECT 'backend_before=' || pg_backend_pid();
SET SESSION AUTHORIZATION $integrator_login;
BEGIN;
SELECT app.install_port_context('$tenant_capability'::uuid, $claims);
SET LOCAL ROLE app_tenant_service;
SELECT count(*) FROM public.platform_users WHERE id='$user_a';
ROLLBACK;
SET ROLE app_tenant_service;
SELECT count(*) FROM public.platform_users WHERE id='$user_a';
\echo reuse_sqlstate=:SQLSTATE
SELECT 'backend_after=' || pg_backend_pid();
SQL
  assert_eq "$(rg -o 'backend_before=[0-9]+' "$work_dir/backend-reuse.out" | cut -d= -f2)" \
    "$(rg -o 'backend_after=[0-9]+' "$work_dir/backend-reuse.out" | cut -d= -f2)"
  grep -q 'reuse_sqlstate=42501' "$work_dir/backend-reuse.out" || fail 'backend reuse did not fail 42501'
  grep -q 'accepted port context required' "$log_file" || fail '42501 denial missing from PostgreSQL log'
fi

echo "port-context catalog: PASS (PostgreSQL 16, declaration-derived capability totals, bilateral exact closure, missing/mutated/stale faults, 10 typed-args hashes, full_schema_mode=$full_schema_mode)"
