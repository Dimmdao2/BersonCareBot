#!/usr/bin/env bash
# Disposable real-SQL proof for the two materialization roots the shipped snapshot proof does NOT
# cover: app.read_patient_reminder_delivery_target_snapshot and app.commit_patient_reminder_materialization.
#
# Named failure this catches: a root reads a column its seam owner is deliberately not granted — either
# because the read still expands a whole row, or because a narrowed column list forgot a column the body
# consumes further down (a %ROWTYPE field, a WHERE, a jsonb_build_object, a later branch).  PostgreSQL
# answers 42501 "permission denied for table ...", the wake returns 500 and no patient reminder is ever
# materialized.  Expensive and silent: reminders simply stop arriving.
#
# Coverage this closes, stated plainly: the commit root is driven all the way to outcome 'materialized',
# so the narrowed occurrence read, every v_existing field consumed downstream, the delegated fingerprint
# and the final queue mark all execute on the declared surface — not on a hand-tuned superset.  The
# grants below are rendered FROM the declaration, never copied.  The last block of each phase is the
# self-test required by AGENTS.md §10a: it reinstates the historical whole-row read and demands the loud
# 42501 back, so a green run cannot mean "the assertion no longer looks at anything".
set -euo pipefail

pg_bin=${PGBIN:-/usr/lib/postgresql/16/bin}
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
work_dir=$(mktemp -d "${TMPDIR:-/tmp}/bcb-reminder-roots.XXXXXX")
data_dir="$work_dir/data"
db_name=bcb_reminder_roots_proof
port=$((59000 + RANDOM % 1000))
login=bcb_reminder_roots_tenant
owner_role=app_seam_reminder_materialization_owner
org=a0000000-0000-4000-8000-000000000001
patient=a0000000-0000-4000-8000-000000000002
topic=reminder_lfk
planned='2026-08-17 11:59:00+00'
planned_iso='2026-08-17T11:59:00+00:00'
now='2026-08-17 12:00:00+00'
target_capability=66666666-6666-4666-8666-666666666666
commit_capability=77777777-7777-4777-8777-777777777777

cleanup() {
  [[ -f "$data_dir/postmaster.pid" ]] && "$pg_bin/pg_ctl" -D "$data_dir" -m immediate stop >/dev/null 2>&1 || true
  [[ ${REMINDER_ROOTS_KEEP_DISPOSABLE:-0} == 1 ]] || rm -rf "$work_dir"
}
trap cleanup EXIT
fail() { echo "reminder materialization roots proof: FAIL: $*" >&2; exit 1; }
assert_eq() { [[ "$1" == "$2" ]] || fail "expected [$2], got [$1]"; }
commit_signature='app.commit_patient_reminder_materialization(uuid,text,text,uuid,text,timestamp with time zone,integer,text)'
target_signature='app.read_patient_reminder_delivery_target_snapshot(uuid,uuid,bigint,text,timestamp with time zone)'
psql_admin() { "$pg_bin/psql" -X -v ON_ERROR_STOP=1 -h "$data_dir" -p "$port" -U dev -d "$db_name" \
  -v login="$login" -v commit_capability="$commit_capability" -v commit_signature="$commit_signature" \
  -v org="$org" -v patient="$patient" -v planned="$planned" "$@"; }

node --experimental-strip-types "$repo_root/deploy/postgres/privileges/fixtures/render-materialization-root-proof.mjs" \
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

# ── fixture ─────────────────────────────────────────────────────────────────────────────────────
# platform_users deliberately carries the personal and medical columns the declaration withholds, so a
# whole-row read has something real to be denied for.
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
CREATE TABLE public.platform_users (
  id uuid PRIMARY KEY, integrator_user_id bigint, email text, email_verified_at timestamptz,
  is_blocked boolean NOT NULL DEFAULT false, is_archived boolean NOT NULL DEFAULT false,
  merged_into_id uuid, reminder_muted_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  role text NOT NULL DEFAULT 'patient', birth_date date, gender text, height_cm integer,
  weight_kg integer, session_epoch integer NOT NULL DEFAULT 0, blocked_reason text
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
CREATE TABLE public.org_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL,
  platform_user_id uuid NOT NULL, status text NOT NULL
);
CREATE TABLE public.user_channel_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, channel_code text NOT NULL,
  external_id text NOT NULL, bot_blocked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.user_channel_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), platform_user_id uuid NOT NULL, user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(), channel_code text NOT NULL,
  is_enabled_for_messages boolean NOT NULL DEFAULT true, is_enabled_for_notifications boolean NOT NULL DEFAULT true,
  is_preferred_for_auth boolean NOT NULL DEFAULT false, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.user_notification_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, topic_code text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.user_notification_topic_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, topic_code text NOT NULL,
  channel_code text NOT NULL, is_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.user_web_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, endpoint text NOT NULL,
  p256dh text NOT NULL, auth text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), key text NOT NULL, scope text NOT NULL,
  organization_id uuid, value_json jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.outgoing_delivery_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, event_id text NOT NULL UNIQUE,
  kind text NOT NULL, channel text NOT NULL, payload_json jsonb NOT NULL, status text NOT NULL,
  attempt_count integer NOT NULL, max_attempts integer NOT NULL, next_retry_at timestamptz,
  last_error text, dead_at timestamptz, priority integer NOT NULL,
  created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
);

INSERT INTO public.platform_users (id, integrator_user_id, email, email_verified_at, birth_date, gender,
  height_cm, weight_kg, blocked_reason)
VALUES ('$patient', 42, 'patient@example.test', now(), '1980-01-01', 'female', 170, 60, NULL);
INSERT INTO public.org_enrollments (organization_id, platform_user_id, status)
VALUES ('$org', '$patient', 'active');
INSERT INTO public.reminder_rules (integrator_rule_id, platform_user_id, integrator_user_id, category,
  is_enabled, schedule_type, timezone, interval_minutes, window_start_minute, window_end_minute, days_mask,
  content_mode, updated_at, created_at, notification_topic_code, organization_id)
VALUES ('commit-rule-a', '$patient', 42, 'lfk', true, 'interval_window', 'Europe/Moscow', 60, 540, 600,
  '1111111', 'custom', now(), now(), '$topic', '$org');
INSERT INTO integrator.user_reminder_occurrences (id, rule_id, occurrence_key, planned_at, status,
  created_at, updated_at, organization_id, platform_user_id, delivery_generation)
VALUES ('occ-c1', 'commit-rule-a', 'commit-rule-a:1', '$planned'::timestamptz, 'planned',
  now(), now(), '$org', '$patient', 1);
INSERT INTO public.user_channel_bindings (user_id, channel_code, external_id)
VALUES ('$patient', 'telegram', 'tg-chat-1');
INSERT INTO public.user_channel_preferences (platform_user_id, channel_code) VALUES ('$patient', 'telegram');
INSERT INTO public.user_notification_topics (user_id, topic_code) VALUES ('$patient', '$topic');
INSERT INTO public.user_notification_topic_channels (user_id, topic_code, channel_code)
VALUES ('$patient', '$topic', 'telegram');
INSERT INTO public.system_settings (key, scope, organization_id, value_json)
VALUES ('smtp_outbound', 'admin', NULL,
  '{"value":{"host":"smtp.example.test","user":"bot","from":"bot@example.test","port":"587"}}'::jsonb);
SQL

# Exactly the declared surface — rendered from the declaration, never hand-written here.
psql_admin -f "$work_dir/declared-grants.sql" >/dev/null
psql_admin -c "GRANT USAGE ON SCHEMA public, integrator TO $owner_role" >/dev/null
psql_admin -c "GRANT EXECUTE ON FUNCTION app.current_org_id(), app.require_accepted_context(name,name,app.port_context_class,text,bytea,regprocedure), app.hash_port_typed_args(app.port_typed_arg[]) TO $owner_role" >/dev/null
psql_admin -f "$work_dir/fingerprint-body.sql" >/dev/null
psql_admin -c "ALTER FUNCTION app.patient_reminder_materialization_fingerprint(text,text) OWNER TO $owner_role" >/dev/null

install_root() { # $1 = body file, $2 = signature, $3 = capability id, $4 = purpose
  psql_admin -f "$1" >/dev/null
  psql_admin -c "ALTER FUNCTION $2 OWNER TO $owner_role" >/dev/null
  psql_admin -c "REVOKE ALL ON FUNCTION $2 FROM PUBLIC; GRANT EXECUTE ON FUNCTION $2 TO app_tenant_service" >/dev/null
  # The capability names the seam by identity, exactly as the port grants it in production.
  psql_admin -c "INSERT INTO app_ext.port_context_capabilities(capability_id,port,session_login,target_role,context_class,purpose,function_identity) VALUES ('$3','integrator','$login','app_tenant_service','tenant_service','$4','$2'::regprocedure) ON CONFLICT (capability_id) DO NOTHING" >/dev/null
}

# The typed-args hash is computed by the privileged bootstrap role, exactly as the port computes it
# before handing the claims to the session — the tenant login never gets EXECUTE on the hasher.
hash_of() { psql_admin -Atc "SELECT encode(app.hash_port_typed_args(ARRAY[$1]),'hex')"; }

call_target() {
  local hash
  hash=$(hash_of "ROW('uuid@1', uuid_send('$org'::uuid))::app.port_typed_arg, ROW('uuid@1', uuid_send('$patient'::uuid))::app.port_typed_arg, ROW('bigint@1', int8send(42::bigint))::app.port_typed_arg, ROW('text@1', textsend('$topic'))::app.port_typed_arg, ROW('timestamptz@1', timestamptz_send('$now'::timestamptz))::app.port_typed_arg")
  psql_admin -At <<SQL
SET SESSION AUTHORIZATION $login; BEGIN;
SELECT app.install_port_context('$target_capability', ROW(1,'tenant_service'::app.port_context_class,
  'app_tenant_service'::name,'reminder.materialization.targets.read',
  '$target_signature'::regprocedure, decode('$hash','hex'),
  NULL::uuid,NULL::uuid,'$org'::uuid,NULL::bigint,NULL::uuid)::app.port_context_claims);
SET LOCAL ROLE app_tenant_service;
SELECT app.read_patient_reminder_delivery_target_snapshot('$org'::uuid, '$patient'::uuid, 42::bigint,
  '$topic', '$now'::timestamptz)::text; COMMIT;
SQL
}

intent='{"type":"message.send","meta":{"eventId":"rem:occ-c1:g1:telegram","occurredAt":"'$planned_iso'","source":"telegram","userId":"42","outboundMessageClass":"routine_product","outboundCapability":"essential_delivery"},"payload":{"recipient":{"chatId":"tg-chat-1"},"message":{"text":"Pora na zaryadku"},"delivery":{"channels":["telegram"],"maxAttempts":1}}}'
deliveries='[{"organizationId":"'$org'","eventId":"rem:occ-c1:g1:telegram","kind":"reminder_dispatch","channel":"telegram","occurrenceId":"occ-c1","deliveryGeneration":1,"topicCode":"'$topic'","externalId":"tg-chat-1","logText":"Pora na zaryadku","platformUserId":"'$patient'","maxAttempts":3,"nextRetryAt":"'$planned_iso'","intent":'$intent'}]'

call_commit() {
  local hash
  hash=$(psql_admin -At -v deliveries="$deliveries" <<'HASH'
SELECT encode(app.hash_port_typed_args(ARRAY[
  ROW('uuid@1', uuid_send(:'org'::uuid))::app.port_typed_arg,
  ROW('text@1', textsend('occ-c1'))::app.port_typed_arg,
  ROW('text@1', textsend('commit-rule-a'))::app.port_typed_arg,
  ROW('uuid@1', uuid_send(:'patient'::uuid))::app.port_typed_arg,
  ROW('text@1', textsend('commit-rule-a:1'))::app.port_typed_arg,
  ROW('timestamptz@1', timestamptz_send(:'planned'::timestamptz))::app.port_typed_arg,
  ROW('integer@1', int4send(1))::app.port_typed_arg,
  ROW('text@1', textsend(:'deliveries'))::app.port_typed_arg]),'hex')
HASH
)
  psql_admin -At -v deliveries="$deliveries" -v hash="$hash" <<'SQL'
SET SESSION AUTHORIZATION :"login"; BEGIN;
SELECT app.install_port_context(:'commit_capability', ROW(1,'tenant_service'::app.port_context_class,
  'app_tenant_service'::name,'reminder.materialization.commit',
  :'commit_signature'::regprocedure, decode(:'hash','hex'),
  NULL::uuid,NULL::uuid,:'org'::uuid,NULL::bigint,NULL::uuid)::app.port_context_claims);
SET LOCAL ROLE app_tenant_service;
SELECT app.commit_patient_reminder_materialization(:'org'::uuid, 'occ-c1', 'commit-rule-a',
  :'patient'::uuid, 'commit-rule-a:1', :'planned'::timestamptz, 1, :'deliveries')::text; COMMIT;
SQL
}

payload_of() { printf '%s\n' "$1" | grep -o '{"ok".*' | tail -1; }

# ── 1. delivery-target root runs to completion on the declared surface ──────────────────────────
install_root "$work_dir/target-body.sql" "$target_signature" "$target_capability" reminder.materialization.targets.read
target=$(call_target 2>"$work_dir/target.err") || { cat "$work_dir/target.err" >&2
  fail 'the declared surface does not execute the shipped delivery-target root'; }
target_payload=$(payload_of "$target")
[[ -n $target_payload ]] || fail "delivery-target root returned no payload: $target"
assert_eq "$(psql_admin -Atc "SELECT '$target_payload'::jsonb ->> 'ok'")" true
# every field the narrowed patient read still has to feed
assert_eq "$(psql_admin -Atc "SELECT '$target_payload'::jsonb ->> 'emailRecipient'")" patient@example.test
assert_eq "$(psql_admin -Atc "SELECT '$target_payload'::jsonb ->> 'emailVerified'")" true
assert_eq "$(psql_admin -Atc "SELECT '$target_payload'::jsonb ->> 'muted'")" false
assert_eq "$(psql_admin -Atc "SELECT '$target_payload'::jsonb -> 'bindings' ->> 'telegram'")" tg-chat-1
assert_eq "$(psql_admin -Atc "SELECT '$target_payload'::jsonb ->> 'topicMasterEnabled'")" true
assert_eq "$(psql_admin -Atc "SELECT '$target_payload'::jsonb ->> 'smtpConfigured'")" true

# ── 2. commit root runs all the way to 'materialized' on the declared surface ───────────────────
install_root "$work_dir/commit-body.sql" "$commit_signature" "$commit_capability" reminder.materialization.commit
commit=$(call_commit 2>"$work_dir/commit.err") || { cat "$work_dir/commit.err" >&2
  fail 'the declared surface does not execute the shipped commit root'; }
commit_payload=$(payload_of "$commit")
[[ -n $commit_payload ]] || fail "commit root returned no payload: $commit"
assert_eq "$(psql_admin -Atc "SELECT '$commit_payload'::jsonb ->> 'ok'")" true
assert_eq "$(psql_admin -Atc "SELECT '$commit_payload'::jsonb ->> 'outcome'")" materialized
# the narrowed v_existing fields reached the queue row and the occurrence mark
assert_eq "$(psql_admin -Atc "SELECT status FROM integrator.user_reminder_occurrences WHERE id='occ-c1'")" queued
assert_eq "$(psql_admin -Atc "SELECT payload_json ->> 'occurrenceId' FROM public.outgoing_delivery_queue WHERE event_id='rem:occ-c1:g1:telegram'")" occ-c1
assert_eq "$(psql_admin -Atc "SELECT payload_json ->> 'deliveryGeneration' FROM public.outgoing_delivery_queue WHERE event_id='rem:occ-c1:g1:telegram'")" 1
assert_eq "$(psql_admin -Atc "SELECT payload_json ->> 'materializationFingerprint' ~ '^[0-9a-f]{32}\$' FROM public.outgoing_delivery_queue WHERE event_id='rem:occ-c1:g1:telegram'")" t

# ── 3. the privacy line the narrowing exists to hold ────────────────────────────────────────────
for column in sent_at failed_at delivery_channel delivery_job_id error_code; do
  assert_eq "$(psql_admin -Atc "SELECT has_column_privilege('$owner_role','integrator.user_reminder_occurrences','$column','SELECT')")" f
done
for column in role birth_date gender height_cm weight_kg session_epoch blocked_reason; do
  assert_eq "$(psql_admin -Atc "SELECT has_column_privilege('$owner_role','public.platform_users','$column','SELECT')")" f
done
assert_eq "$(psql_admin -Atc "SELECT has_table_privilege('$owner_role','public.platform_users','SELECT')")" f
assert_eq "$(psql_admin -Atc "SELECT has_table_privilege('$owner_role','integrator.user_reminder_occurrences','SELECT')")" f

# ── 4. self-test: both historical whole-row reads must fail loudly ──────────────────────────────
install_root "$work_dir/target-star-body.sql" "$target_signature" "$target_capability" reminder.materialization.targets.read
if call_target >"$work_dir/target-star.out" 2>&1; then
  fail 'the whole-row patient read returned a result instead of the 42501 the engine owes us'
fi
grep -q 'permission denied for table platform_users' "$work_dir/target-star.out" \
  || fail "whole-row patient read did not raise the expected denial: $(cat "$work_dir/target-star.out")"

psql_admin -c "UPDATE integrator.user_reminder_occurrences SET status='planned' WHERE id='occ-c1'" >/dev/null
install_root "$work_dir/commit-star-body.sql" "$commit_signature" "$commit_capability" reminder.materialization.commit
if call_commit >"$work_dir/commit-star.out" 2>&1; then
  fail 'the whole-row occurrence read returned a result instead of the 42501 the engine owes us'
fi
grep -q 'permission denied for table user_reminder_occurrences' "$work_dir/commit-star.out" \
  || fail "whole-row occurrence read did not raise the expected denial: $(cat "$work_dir/commit-star.out")"

echo 'reminder materialization roots (delivery-target + commit): PASS'
