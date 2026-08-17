#!/usr/bin/env bash
# Disposable real-SQL proof that the declared privilege surface of the reminder materialization
# snapshot root is sufficient to execute it end to end under the organization principal.
#
# Named failure this catches: the scheduler wake calls
# app.read_patient_reminder_materialization_snapshot as app_tenant_service, the definer owner reads a
# column the declaration deliberately withholds, PostgreSQL answers 42501 "permission denied for table
# user_reminder_occurrences", the route returns 500 and no patient reminder is ever materialized.
# Expensive and silent: reminders simply stop arriving, and the only trace is a 500 on an internal wake.
#
# The grants below are rendered FROM deploy/postgres/privileges/function-census.ts, not copied, so the
# proof always exercises the declared surface rather than a hand-tuned superset. The last block is the
# self-test required by AGENTS.md §10a: it reinstalls the historical whole-row body and demands the
# loud 42501 back, so a green run cannot mean "the assertion no longer looks at anything".
set -euo pipefail

pg_bin=${PGBIN:-/usr/lib/postgresql/16/bin}
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
work_dir=$(mktemp -d "${TMPDIR:-/tmp}/bcb-reminder-snapshot.XXXXXX")
data_dir="$work_dir/data"
db_name=bcb_reminder_snapshot_proof
port=$((58000 + RANDOM % 1000))
login=bcb_reminder_snapshot_tenant
org=a0000000-0000-4000-8000-000000000001
patient=a0000000-0000-4000-8000-000000000002
capability=55555555-5555-4555-8555-555555555555
now='2026-08-17 12:00:00+00'

cleanup() {
  [[ -f "$data_dir/postmaster.pid" ]] && "$pg_bin/pg_ctl" -D "$data_dir" -m immediate stop >/dev/null 2>&1 || true
  [[ ${REMINDER_SNAPSHOT_KEEP_DISPOSABLE:-0} == 1 ]] || rm -rf "$work_dir"
}
trap cleanup EXIT
fail() { echo "reminder materialization snapshot proof: FAIL: $*" >&2; exit 1; }
assert_eq() { [[ "$1" == "$2" ]] || fail "expected [$2], got [$1]"; }
psql_admin() { "$pg_bin/psql" -X -v ON_ERROR_STOP=1 -h "$data_dir" -p "$port" -U dev -d "$db_name" "$@"; }

# ── the two bodies under test, both taken from the repository's own migrations ──────────────────
node --experimental-strip-types "$repo_root/deploy/postgres/privileges/fixtures/render-materialization-snapshot-proof.mjs" \
  --out "$work_dir"

"$pg_bin/initdb" -D "$data_dir" --auth=trust --username=dev >/dev/null
printf '%s\n' "port = $port" "unix_socket_directories = '$data_dir'" >> "$data_dir/postgresql.conf"
"$pg_bin/pg_ctl" -D "$data_dir" -l "$work_dir/postgres.log" start >/dev/null
"$pg_bin/createdb" -h "$data_dir" -p "$port" -U dev "$db_name"
psql_admin -c 'CREATE ROLE postgres SUPERUSER NOLOGIN' >/dev/null
node "$repo_root/deploy/postgres/privileges/generate-cli.mjs" --shared-role-baseline | psql_admin -1 >/dev/null
psql_admin -c "CREATE ROLE $login LOGIN" >/dev/null
psql_admin -v app_staff_login="$login" -v app_patient_login="$login" \
  -v app_global_admin_login="$login" -v integrator_login="$login" \
  -f "$repo_root/deploy/postgres/port-context/contract.sql" >/dev/null
psql_admin -c 'ALTER EVENT TRIGGER bcb_relation_birth_wall DISABLE' >/dev/null

psql_admin <<SQL >/dev/null
GRANT app_tenant_service TO $login;
CREATE SCHEMA IF NOT EXISTS integrator;
CREATE TABLE integrator.user_reminder_occurrences (
  id text PRIMARY KEY, rule_id text NOT NULL, occurrence_key text NOT NULL UNIQUE,
  planned_at timestamptz NOT NULL, status text NOT NULL, queued_at timestamptz, sent_at timestamptz,
  failed_at timestamptz, delivery_channel text, delivery_job_id text, error_code text,
  created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, organization_id uuid NOT NULL,
  platform_user_id uuid NOT NULL, delivery_generation integer NOT NULL
);
CREATE TABLE public.reminder_rules (
  id uuid PRIMARY KEY DEFAULT '11111111-1111-4111-8111-111111111111', integrator_rule_id text NOT NULL UNIQUE,
  platform_user_id uuid, integrator_user_id bigint, category text NOT NULL, is_enabled boolean NOT NULL,
  schedule_type text NOT NULL, timezone text NOT NULL, interval_minutes integer NOT NULL,
  window_start_minute integer NOT NULL, window_end_minute integer NOT NULL, days_mask text NOT NULL,
  content_mode text NOT NULL, updated_at timestamptz NOT NULL, created_at timestamptz NOT NULL,
  linked_object_type text, linked_object_id text, custom_title text, custom_text text, schedule_data jsonb,
  reminder_intent text, display_title text, display_description text, quiet_hours_start_minute integer,
  quiet_hours_end_minute integer, notification_topic_code text, organization_id uuid
);
CREATE TABLE public.content_pages (
  id uuid PRIMARY KEY DEFAULT '22222222-2222-4222-8222-222222222222', section text NOT NULL, slug text NOT NULL,
  title text NOT NULL, summary text NOT NULL, body_html text NOT NULL, sort_order integer NOT NULL,
  is_published boolean NOT NULL, video_url text, video_type text, image_url text,
  created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, body_md text NOT NULL,
  archived_at timestamptz, deleted_at timestamptz, requires_auth boolean NOT NULL,
  linked_course_id uuid, organization_id uuid
);
CREATE TABLE public.content_sections (
  id uuid PRIMARY KEY DEFAULT '33333333-3333-4333-8333-333333333333', slug text NOT NULL, title text NOT NULL,
  description text NOT NULL, sort_order integer NOT NULL, is_visible boolean NOT NULL,
  created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, requires_auth boolean NOT NULL,
  cover_image_url text, icon_image_url text, kind text NOT NULL, system_parent_code text, organization_id uuid
);
INSERT INTO public.reminder_rules (integrator_rule_id, platform_user_id, integrator_user_id, category,
  is_enabled, schedule_type, timezone, interval_minutes, window_start_minute, window_end_minute, days_mask,
  content_mode, updated_at, created_at, linked_object_type, linked_object_id, organization_id)
VALUES ('snapshot-rule-a', '$patient', 42, 'lfk', true, 'interval_window', 'Europe/Moscow', 60, 540, 600,
  '1111111', 'custom', now(), now(), 'content_page', 'warmup', '$org');
INSERT INTO public.content_pages (section, slug, title, summary, body_html, sort_order, is_published,
  created_at, updated_at, body_md, requires_auth, organization_id)
VALUES ('lfk', 'warmup', 'Разминка', '', '', 1, true, now(), now(), '', false, '$org');
INSERT INTO integrator.user_reminder_occurrences (id, rule_id, occurrence_key, planned_at, status,
  created_at, updated_at, organization_id, platform_user_id, delivery_generation)
VALUES ('occ-1', 'snapshot-rule-a', 'snapshot-rule-a:1', '$now'::timestamptz - interval '1 minute', 'planned',
  now(), now(), '$org', '$patient', 1);
SQL

# Exactly the declared surface — rendered from the census, never hand-written here.
psql_admin -f "$work_dir/declared-grants.sql" >/dev/null
psql_admin -c "GRANT USAGE ON SCHEMA public, integrator TO app_seam_reminder_materialization_owner" >/dev/null
psql_admin -c "GRANT EXECUTE ON FUNCTION app.current_org_id(), app.require_accepted_context(name,name,app.port_context_class,text,bytea,regprocedure), app.hash_port_typed_args(app.port_typed_arg[]) TO app_seam_reminder_materialization_owner" >/dev/null

install_body() {
  psql_admin -f "$1" >/dev/null
  psql_admin -c 'ALTER FUNCTION app.read_patient_reminder_materialization_snapshot(uuid,timestamp with time zone) OWNER TO app_seam_reminder_materialization_owner' >/dev/null
  psql_admin -c 'REVOKE ALL ON FUNCTION app.read_patient_reminder_materialization_snapshot(uuid,timestamp with time zone) FROM PUBLIC; GRANT EXECUTE ON FUNCTION app.read_patient_reminder_materialization_snapshot(uuid,timestamp with time zone) TO app_tenant_service' >/dev/null
  # The capability names the seam by identity, exactly as the port grants it in production.
  psql_admin -c "INSERT INTO app_ext.port_context_capabilities(capability_id,port,session_login,target_role,context_class,purpose,function_identity) VALUES ('$capability','integrator','$login','app_tenant_service','tenant_service','reminder.materialization.snapshot.read','app.read_patient_reminder_materialization_snapshot(uuid,timestamp with time zone)'::regprocedure) ON CONFLICT (capability_id) DO NOTHING" >/dev/null
  # The claims pin the exact typed-args hash the body recomputes for these arguments.
  local hash
  hash=$(psql_admin -Atc "SELECT encode(app.hash_port_typed_args(ARRAY[ROW('uuid@1', uuid_send('$org'::uuid))::app.port_typed_arg, ROW('timestamptz@1', timestamptz_send('$now'::timestamptz))::app.port_typed_arg]),'hex')")
  claims="ROW(1,'tenant_service'::app.port_context_class,'app_tenant_service'::name,'reminder.materialization.snapshot.read','app.read_patient_reminder_materialization_snapshot(uuid,timestamp with time zone)'::regprocedure,decode('$hash','hex'),NULL::uuid,NULL::uuid,'$org'::uuid,NULL::bigint,NULL::uuid)::app.port_context_claims"
}

call_snapshot() {
  psql_admin -At <<SQL
SET SESSION AUTHORIZATION $login; BEGIN;
SELECT app.install_port_context('$capability', $claims); SET LOCAL ROLE app_tenant_service;
SELECT app.read_patient_reminder_materialization_snapshot('$org'::uuid, '$now'::timestamptz)::text; COMMIT;
SQL
}

# ── 1. the shipped body must run to completion on the declared surface ──────────────────────────
install_body "$work_dir/current-body.sql"
snapshot=$(call_snapshot 2>"$work_dir/current.err") || {
  cat "$work_dir/current.err" >&2
  fail 'the declared surface does not execute the shipped materialization snapshot root'
}
payload=$(printf '%s\n' "$snapshot" | grep -o '{"ok".*' | tail -1)
[[ -n $payload ]] || fail "snapshot root returned no payload: $snapshot"
assert_eq "$(psql_admin -Atc "SELECT '$payload'::jsonb ->> 'ok'")" true
assert_eq "$(psql_admin -Atc "SELECT jsonb_array_length('$payload'::jsonb -> 'rules')")" 1
assert_eq "$(psql_admin -Atc "SELECT jsonb_array_length('$payload'::jsonb -> 'dueOccurrences')")" 1
assert_eq "$(psql_admin -Atc "SELECT '$payload'::jsonb -> 'dueOccurrences' -> 0 ->> 'occurrenceId'")" occ-1
assert_eq "$(psql_admin -Atc "SELECT '$payload'::jsonb -> 'rules' -> 0 ->> 'linkedTitle'")" 'Разминка'

# The seam owner must still be barred from the columns the declaration withholds; a green run that
# reached this point by widening the grant is not a pass.
for column in sent_at failed_at delivery_channel delivery_job_id error_code; do
  assert_eq "$(psql_admin -Atc "SELECT has_column_privilege('app_seam_reminder_materialization_owner','integrator.user_reminder_occurrences','$column','SELECT')")" f
done
assert_eq "$(psql_admin -Atc "SELECT has_table_privilege('app_seam_reminder_materialization_owner','integrator.user_reminder_occurrences','SELECT')")" f

# ── 2. self-test: the historical whole-row body must fail loudly, never silently return empty ───
install_body "$work_dir/whole-row-body.sql"
if call_snapshot >"$work_dir/whole-row.out" 2>&1; then
  fail 'the whole-row body returned a result instead of the 42501 the engine owes us'
fi
grep -q 'permission denied for table user_reminder_occurrences' "$work_dir/whole-row.out" \
  || fail "whole-row body did not raise the expected column-privilege denial: $(cat "$work_dir/whole-row.out")"

echo 'reminder materialization snapshot: PASS'
