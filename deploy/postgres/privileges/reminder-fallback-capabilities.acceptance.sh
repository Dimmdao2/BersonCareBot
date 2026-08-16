#!/usr/bin/env bash
# Disposable real-SQL proof for the reminder fallback and clinic credential port capabilities.
set -euo pipefail

pg_bin=/usr/lib/postgresql/16/bin
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
work_dir=$(mktemp -d "${TMPDIR:-/tmp}/bcb-reminder-capability.XXXXXX")
data_dir="$work_dir/data"
db_name=bcb_reminder_capability_proof
port=$((57000 + RANDOM % 1000))
patient_login=bcb_dev_webapp_patient
integrator_login=bcb_reminder_integrator
org_a=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1
org_b=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2
user_a=aaaaaaaa-1111-4111-8111-aaaaaaaaaaa1
opaque_a=aaaaaaaa-aaaa-4aaa-9aaa-aaaaaaaaaaa1
relation_hash=0355fd5ea0ae72a2f99fa916e9a78d189b3a69ab6f41dc412201df48313f6f5a

cleanup() {
  [[ -f "$data_dir/postmaster.pid" ]] && "$pg_bin/pg_ctl" -D "$data_dir" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$work_dir"
}
trap cleanup EXIT
fail() { echo "reminder capability proof: FAIL: $*" >&2; exit 1; }
assert_eq() { [[ "$1" == "$2" ]] || fail "expected [$2], got [$1]"; }
psql_admin() { "$pg_bin/psql" -X -v ON_ERROR_STOP=1 -h "$data_dir" -p "$port" -U dev -d "$db_name" "$@"; }

"$pg_bin/initdb" -D "$data_dir" --auth=trust --username=dev >/dev/null
printf '%s\n' "port = $port" "unix_socket_directories = '$data_dir'" >> "$data_dir/postgresql.conf"
"$pg_bin/pg_ctl" -D "$data_dir" -l "$work_dir/postgres.log" start >/dev/null
"$pg_bin/createdb" -h "$data_dir" -p "$port" -U dev "$db_name"
psql_admin -c 'CREATE ROLE postgres SUPERUSER NOLOGIN' >/dev/null
node "$repo_root/deploy/postgres/privileges/generate-cli.mjs" --shared-role-baseline | psql_admin -1 >/dev/null
psql_admin -c "CREATE ROLE $patient_login LOGIN; CREATE ROLE $integrator_login LOGIN" >/dev/null
psql_admin -v app_staff_login="$patient_login" -v app_patient_login="$patient_login" \
  -v app_global_admin_login="$patient_login" -v integrator_login="$integrator_login" \
  -f "$repo_root/deploy/postgres/port-context/contract.sql" >/dev/null
psql_admin -c 'ALTER EVENT TRIGGER bcb_relation_birth_wall DISABLE' >/dev/null
psql_admin <<SQL >/dev/null
GRANT app_patient, app_pre_session TO $patient_login;
GRANT app_tenant_service TO $integrator_login;
CREATE TABLE public.reminder_rules (
  integrator_rule_id text PRIMARY KEY, organization_id uuid NOT NULL, platform_user_id uuid NOT NULL,
  integrator_user_id bigint, category text NOT NULL, is_enabled boolean NOT NULL, interval_minutes integer,
  window_start_minute integer NOT NULL, window_end_minute integer NOT NULL, days_mask text NOT NULL,
  timezone text NOT NULL, linked_object_type text, linked_object_id text, custom_title text, custom_text text,
  schedule_type text NOT NULL, schedule_data jsonb, reminder_intent text, display_title text,
  display_description text, quiet_hours_start_minute integer, quiet_hours_end_minute integer,
  notification_topic_code text, updated_at timestamptz NOT NULL
);
CREATE TABLE public.integrator_push_outbox (
  id bigserial PRIMARY KEY, kind text NOT NULL, idempotency_key text NOT NULL UNIQUE, payload jsonb NOT NULL,
  status text NOT NULL, attempts_done integer NOT NULL DEFAULT 0, next_try_at timestamptz NOT NULL,
  last_error text, updated_at timestamptz NOT NULL
);
CREATE TABLE public.system_settings (key text NOT NULL, scope text NOT NULL, organization_id uuid, value_json jsonb NOT NULL);
CREATE TABLE public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT '99999999-9999-4999-8999-999999999999',
  organization_id uuid, actor_id uuid, action text NOT NULL, details jsonb NOT NULL, status text NOT NULL
);
INSERT INTO app_ext.variant_a_identity_refs(physical_user_id, opaque_ref) VALUES ('$user_a', '$opaque_a');
INSERT INTO public.reminder_rules VALUES
  ('fallback-rule-a','$org_a','$user_a',42,'lfk',false,60,540,600,'1111111','Europe/Moscow',NULL,NULL,NULL,NULL,'interval_window',NULL,NULL,NULL,NULL,NULL,NULL,NULL,now()),
  ('fallback-rule-b','$org_b','$user_a',42,'lfk',true,60,540,600,'1111111','Europe/Moscow',NULL,NULL,NULL,NULL,'interval_window',NULL,NULL,NULL,NULL,NULL,NULL,NULL,now());
INSERT INTO public.system_settings VALUES
  ('clinic_telegram_bot_token','admin','$org_a','{"value":"clinic-a-token"}'),
  ('clinic_telegram_bot_token','admin','$org_b','{"value":"clinic-b-token"}');
INSERT INTO app_ext.port_context_capabilities(capability_id,port,session_login,target_role,context_class,purpose,function_identity)
VALUES
  ('11111111-1111-4111-8111-111111111111','webapp','$patient_login','app_patient','patient','relation',NULL),
  ('22222222-2222-4222-8222-222222222222','integrator','$integrator_login','app_tenant_service','tenant_service','relation',NULL);
SQL
psql_admin -f "$repo_root/apps/webapp/db/drizzle-migrations/0444_reminder_fallback_and_clinic_credential_capabilities_local.sql" >/dev/null
psql_admin -f "$repo_root/apps/webapp/db/drizzle-migrations/0445_reminder_fallback_attested_target_role_local.sql" >/dev/null
psql_admin -f "$repo_root/apps/webapp/db/drizzle-migrations/0446_pre_session_platform_audit_event_local.sql" >/dev/null
psql_admin -f "$repo_root/apps/webapp/db/drizzle-migrations/0447_multi_context_platform_audit_gate_local.sql" >/dev/null
psql_admin -c "INSERT INTO app_ext.port_context_capabilities(capability_id,port,session_login,target_role,context_class,purpose,function_identity) VALUES ('33333333-3333-4333-8333-333333333333','webapp','$patient_login','app_pre_session','pre_session','platform.audit-event.append','app.append_platform_audit_event(text,text,text)'::regprocedure)" >/dev/null
psql_admin -c 'ALTER FUNCTION app.require_attested_target_role(name,name[]) OWNER TO app_seam_context_owner' >/dev/null
psql_admin -c 'ALTER FUNCTION app.enqueue_current_reminder_rule_push(text) OWNER TO app_seam_reminder_patient_owner' >/dev/null
psql_admin -c 'ALTER FUNCTION app.read_integrator_clinic_delivery_credential(text,uuid) OWNER TO app_seam_settings_integrator_owner' >/dev/null
psql_admin -c 'ALTER FUNCTION app.append_platform_audit_event(text,text,text) OWNER TO app_seam_telemetry_operator_owner' >/dev/null
psql_admin -c 'REVOKE ALL ON FUNCTION app.require_attested_target_role(name,name[]) FROM PUBLIC; GRANT EXECUTE ON FUNCTION app.require_attested_target_role(name,name[]) TO app_seam_reminder_patient_owner' >/dev/null
psql_admin -c 'REVOKE ALL ON FUNCTION app.enqueue_current_reminder_rule_push(text) FROM PUBLIC; GRANT EXECUTE ON FUNCTION app.enqueue_current_reminder_rule_push(text) TO app_patient' >/dev/null
psql_admin -c 'REVOKE ALL ON FUNCTION app.read_integrator_clinic_delivery_credential(text,uuid) FROM PUBLIC; GRANT EXECUTE ON FUNCTION app.read_integrator_clinic_delivery_credential(text,uuid) TO app_tenant_service' >/dev/null
psql_admin -c 'REVOKE ALL ON FUNCTION app.append_platform_audit_event(text,text,text) FROM PUBLIC; GRANT EXECUTE ON FUNCTION app.append_platform_audit_event(text,text,text) TO app_pre_session' >/dev/null
psql_admin -c 'GRANT USAGE ON SCHEMA public TO app_seam_reminder_patient_owner, app_seam_settings_integrator_owner, app_seam_telemetry_operator_owner' >/dev/null
psql_admin -c 'GRANT EXECUTE ON FUNCTION app.current_org_id(), app.current_patient_user_id(), app.current_actor_user_id() TO app_seam_reminder_patient_owner; GRANT EXECUTE ON FUNCTION app.current_org_id(), app.require_attested_context_for_roles(name,name[]) TO app_seam_settings_integrator_owner' >/dev/null
psql_admin -c 'GRANT EXECUTE ON FUNCTION app.require_accepted_context(name,name,app.port_context_class,text,bytea,regprocedure), app.hash_port_typed_args(app.port_typed_arg[]) TO app_seam_telemetry_operator_owner' >/dev/null
psql_admin -c 'GRANT SELECT (integrator_rule_id,organization_id,platform_user_id,integrator_user_id,category,is_enabled,interval_minutes,window_start_minute,window_end_minute,days_mask,timezone,linked_object_type,linked_object_id,custom_title,custom_text,schedule_type,schedule_data,reminder_intent,display_title,display_description,quiet_hours_start_minute,quiet_hours_end_minute,notification_topic_code,updated_at) ON public.reminder_rules TO app_seam_reminder_patient_owner' >/dev/null
psql_admin -c 'GRANT SELECT (kind,idempotency_key,payload,status,attempts_done,next_try_at,last_error,updated_at), INSERT (kind,idempotency_key,payload,status,attempts_done,next_try_at,last_error,updated_at), UPDATE (kind,idempotency_key,payload,status,attempts_done,next_try_at,last_error,updated_at) ON public.integrator_push_outbox TO app_seam_reminder_patient_owner' >/dev/null
psql_admin -c 'GRANT USAGE, SELECT ON SEQUENCE public.integrator_push_outbox_id_seq TO app_seam_reminder_patient_owner' >/dev/null
psql_admin -c 'GRANT SELECT (key,scope,organization_id,value_json) ON public.system_settings TO app_seam_settings_integrator_owner' >/dev/null
psql_admin -c 'GRANT INSERT (organization_id,actor_id,action,details,status), SELECT (id) ON public.admin_audit_log TO app_seam_telemetry_operator_owner' >/dev/null
assert_eq "$(psql_admin -Atc "SELECT has_schema_privilege('app_seam_reminder_patient_owner','app_ext','USAGE')")" f
assert_eq "$(psql_admin -Atc "SELECT has_table_privilege('app_seam_reminder_patient_owner','app_ext.accepted_port_contexts','SELECT')")" f

patient_claims="ROW(1,'patient'::app.port_context_class,'app_patient'::name,'relation',NULL::regprocedure,decode('$relation_hash','hex'),'$opaque_a'::uuid,'$opaque_a'::uuid,'$org_a'::uuid,NULL::bigint,NULL::uuid)::app.port_context_claims"
tenant_claims="ROW(1,'tenant_service'::app.port_context_class,'app_tenant_service'::name,'relation',NULL::regprocedure,decode('$relation_hash','hex'),NULL::uuid,NULL::uuid,'$org_a'::uuid,NULL::bigint,NULL::uuid)::app.port_context_claims"
pre_session_hash=$(psql_admin -Atc "SELECT encode(app.hash_port_typed_args(ARRAY[ROW('text@1',textsend('auth_register_failure'))::app.port_typed_arg,ROW('text@1',textsend('{\"stage\":\"credential_create\"}'))::app.port_typed_arg,ROW('text@1',textsend('error'))::app.port_typed_arg]),'hex')")
pre_session_claims="ROW(1,'pre_session'::app.port_context_class,'app_pre_session'::name,'platform.audit-event.append','app.append_platform_audit_event(text,text,text)'::regprocedure,decode('$pre_session_hash','hex'),NULL::uuid,NULL::uuid,NULL::uuid,NULL::bigint,'44444444-4444-4444-8444-444444444444'::uuid)::app.port_context_claims"
psql_admin <<SQL >/dev/null
SET SESSION AUTHORIZATION $patient_login;
BEGIN; SELECT app.install_port_context('11111111-1111-4111-8111-111111111111', $patient_claims); SET LOCAL ROLE app_patient;
SELECT app.enqueue_current_reminder_rule_push('fallback-rule-a'); COMMIT; RESET SESSION AUTHORIZATION;
UPDATE public.reminder_rules SET is_enabled=true WHERE integrator_rule_id='fallback-rule-a';
SET SESSION AUTHORIZATION $patient_login;
BEGIN; SELECT app.install_port_context('11111111-1111-4111-8111-111111111111', $patient_claims); SET LOCAL ROLE app_patient;
SELECT app.enqueue_current_reminder_rule_push('fallback-rule-a'); COMMIT; RESET SESSION AUTHORIZATION;
SQL
assert_eq "$(psql_admin -Atc "SELECT count(*) FROM public.integrator_push_outbox WHERE status='pending'")" 1
assert_eq "$(psql_admin -Atc "SELECT payload->>'enabled' FROM public.integrator_push_outbox")" true
assert_eq "$(psql_admin -Atc "SELECT has_table_privilege('app_patient','public.integrator_push_outbox','INSERT')")" f
if psql_admin <<SQL >"$work_dir/foreign-rule.out" 2>&1
SET SESSION AUTHORIZATION $patient_login; BEGIN;
SELECT app.install_port_context('11111111-1111-4111-8111-111111111111', $patient_claims); SET LOCAL ROLE app_patient;
SELECT app.enqueue_current_reminder_rule_push('fallback-rule-b'); COMMIT;
SQL
then fail 'foreign rule was enqueued'; fi
grep -q 'reminder rule unavailable in current context' "$work_dir/foreign-rule.out" || fail 'foreign rule did not receive 42501 seam denial'

credential=$(psql_admin -At <<SQL
SET SESSION AUTHORIZATION $integrator_login; BEGIN;
SELECT app.install_port_context('22222222-2222-4222-8222-222222222222', $tenant_claims); SET LOCAL ROLE app_tenant_service;
SELECT app.read_integrator_clinic_delivery_credential('clinic_telegram_bot_token','$org_a')->'value'; COMMIT;
SQL
)
assert_eq "$(printf '%s\n' "$credential" | rg -o '"clinic-a-token"' | tail -1)" '"clinic-a-token"'
if psql_admin <<SQL >"$work_dir/foreign-credential.out" 2>&1
SET SESSION AUTHORIZATION $integrator_login; BEGIN;
SELECT app.install_port_context('22222222-2222-4222-8222-222222222222', $tenant_claims); SET LOCAL ROLE app_tenant_service;
SELECT app.read_integrator_clinic_delivery_credential('clinic_telegram_bot_token','$org_b'); COMMIT;
SQL
then fail 'foreign credential was visible'; fi
grep -q 'clinic credential organization context denied' "$work_dir/foreign-credential.out" || fail 'foreign credential did not receive 42501 seam denial'
if psql_admin -c "SET ROLE app_tenant_service; SELECT app.read_integrator_clinic_delivery_credential('clinic_telegram_bot_token','$org_a');" >"$work_dir/no-context.out" 2>&1; then
  fail 'credential was visible without context'
fi
grep -q 'accepted organization context required' "$work_dir/no-context.out" || fail 'no-context credential denial missing'

psql_admin <<SQL >/dev/null
SET SESSION AUTHORIZATION $patient_login;
BEGIN; SELECT app.install_port_context('33333333-3333-4333-8333-333333333333', $pre_session_claims); SET LOCAL ROLE app_pre_session;
SELECT app.append_platform_audit_event('auth_register_failure','{"stage":"credential_create"}','error'); COMMIT;
RESET SESSION AUTHORIZATION;
SQL
assert_eq "$(psql_admin -Atc "SELECT count(*) FROM public.admin_audit_log WHERE action='auth_register_failure' AND status='error' AND actor_id IS NULL")" 1
assert_eq "$(psql_admin -Atc "SELECT has_table_privilege('app_pre_session','public.admin_audit_log','INSERT')")" f
echo 'reminder fallback capabilities: PASS'
