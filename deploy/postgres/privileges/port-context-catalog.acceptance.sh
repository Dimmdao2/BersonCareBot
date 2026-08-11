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
integrator_login=bcb_test_integrator
port=0
for _ in $(seq 1 40); do
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

"$pg_bin/initdb" -D "$data_dir" --auth=trust --username=dev >/dev/null
printf '%s\n' "port = $port" "unix_socket_directories = '$data_dir'" >> "$data_dir/postgresql.conf"
"$pg_bin/pg_ctl" -D "$data_dir" -l "$log_file" start >/dev/null
"$pg_bin/createdb" -h "$data_dir" -p "$port" -U dev "$db_name"
psql_admin -c "CREATE ROLE $staff_login LOGIN; CREATE ROLE $patient_login LOGIN; CREATE ROLE $integrator_login LOGIN;" >/dev/null
psql_admin \
  -v app_staff_login="$staff_login" \
  -v app_patient_login="$patient_login" \
  -v integrator_login="$integrator_login" \
  -f "$repo_root/deploy/postgres/port-context/contract.sql" >/dev/null

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
SQL

psql_admin -1 -f "$repo_root/deploy/postgres/generated/port-context-capabilities.${db_name}.sql" >/dev/null
assert_eq "$(psql_admin -Atc 'SELECT count(*) FROM app_ext.port_context_capabilities')" 10
assert_eq "$(psql_admin -Atc "SELECT count(*) FROM app_ext.port_context_capabilities WHERE port='webapp'")" 4
assert_eq "$(psql_admin -Atc "SELECT count(*) FROM app_ext.port_context_capabilities WHERE port='integrator'")" 6
assert_eq "$(psql_admin -Atc 'SELECT count(DISTINCT ROW(session_login,target_role,context_class,purpose,function_identity)) FROM app_ext.port_context_capabilities')" 10

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
for (const [port, envName, rootCount, relationCount] of [
  ['webapp', 'WEB_JSON', 4, 8],
  ['integrator', 'INTEGRATOR_JSON', 6, 7],
]) {
  const allRuntime = Object.values(JSON.parse(process.env[envName]));
  const runtime = allRuntime.filter((descriptor) => descriptor.functionIdentity);
  const relations = allRuntime.filter((descriptor) => descriptor.purpose === 'relation');
  const rows = db.filter((row) => row.port === port).map(({ port: _port, ...row }) => row);
  const sorted = (values) => values.sort((a, b) => a.capabilityId.localeCompare(b.capabilityId));
  assert.equal(runtime.length, rootCount);
  assert.equal(relations.length, relationCount);
  assert.deepEqual(sorted(runtime), sorted(rows));
}
JS

assert_eq "$(psql_admin -Atc "
WITH expected(session_login, target_role) AS (
  VALUES
    ('$staff_login','app_pre_session'), ('$staff_login','app_staff'),
    ('$staff_login','app_clinic_billing'), ('$staff_login','app_platform_settings'),
    ('$staff_login','app_worker'), ('$staff_login','app_operational_media_worker'),
    ('$staff_login','saas_telemetry_operator'), ('$patient_login','app_patient'),
    ('$integrator_login','app_integrator_request'), ('$integrator_login','app_integrator_resolver'),
    ('$integrator_login','app_operational_delivery_worker'), ('$integrator_login','app_operational_scheduler'),
    ('$integrator_login','app_tenant_service'), ('$integrator_login','app_service'),
    ('$integrator_login','app_service')
)
SELECT count(*) FROM expected
WHERE pg_has_role(session_login, target_role, 'SET')")" 15
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

echo 'port-context catalog: PASS (PostgreSQL 16, 10 function rows, 15 SET-able relation descriptors, 10 typed-args hashes)'
