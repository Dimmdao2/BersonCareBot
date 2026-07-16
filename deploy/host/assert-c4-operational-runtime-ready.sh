#!/usr/bin/env bash
set -euo pipefail

API_ENV_FILE="${API_ENV_FILE:-/opt/env/bersoncarebot/api.prod}"
WEBAPP_ENV_FILE="${WEBAPP_ENV_FILE:-/opt/env/bersoncarebot/webapp.prod}"
MEDIA_WORKER_ENV_FILE="${MEDIA_WORKER_ENV_FILE:-/opt/env/bersoncarebot/media-worker.prod}"
fail(){ echo "C4 operational readiness: $*" >&2; exit 1; }

set -a
# shellcheck disable=SC1090
. "$API_ENV_FILE"
set +a
: "${DATABASE_URL_DIAGNOSTIC:?missing DATABASE_URL_DIAGNOSTIC}"
: "${DATABASE_URL_DELIVERY_WORKER:?missing DATABASE_URL_DELIVERY_WORKER}"
: "${DATABASE_URL_SCHEDULER:?missing DATABASE_URL_SCHEDULER}"
diagnostic_url="$DATABASE_URL_DIAGNOSTIC"
delivery_url="$DATABASE_URL_DELIVERY_WORKER"
scheduler_url="$DATABASE_URL_SCHEDULER"

unset DATABASE_URL
set -a
# shellcheck disable=SC1090
. "$WEBAPP_ENV_FILE"
set +a
: "${DATABASE_URL_WEB_PUSH_REMINDER:?missing DATABASE_URL_WEB_PUSH_REMINDER}"
web_push_reminder_url="$DATABASE_URL_WEB_PUSH_REMINDER"

unset DATABASE_URL
set -a
# shellcheck disable=SC1090
. "$MEDIA_WORKER_ENV_FILE"
set +a
: "${DATABASE_URL:?missing media-worker DATABASE_URL}"
media_url="$DATABASE_URL"

probe(){ psql "$1" -X -v ON_ERROR_STOP=1 -qAtc "$2"; }
expect_denied(){
  local url="$1" label="$2" sql="$3"
  if probe "$url" "$sql" >/dev/null 2>&1; then
    fail "$label unexpectedly succeeded"
  fi
}

diagnostic_login="$(probe "$diagnostic_url" "SELECT app.release_principal_context(); SET ROLE app_operational_diagnostic; SELECT count(*) FROM integrator.projection_outbox WHERE false; RESET ROLE; SELECT session_user;" | tail -n 1)"
delivery_login="$(probe "$delivery_url" "SELECT app.release_principal_context(); BEGIN; SET ROLE app_operational_delivery_worker; UPDATE integrator.projection_outbox SET id=id WHERE false; UPDATE integrator.rubitime_create_retry_jobs SET id=id WHERE false; UPDATE public.outgoing_delivery_queue SET id=id WHERE false; SELECT resolution FROM app.resolve_outgoing_delivery_scope('00000000-0000-4000-8000-000000000000'::uuid); SELECT app.operator_incident_alert_already_sent('00000000-0000-4000-8000-000000000000'::uuid); SELECT app.mark_operator_incident_alert_sent('00000000-0000-4000-8000-000000000000'::uuid); SELECT 1 / has_function_privilege(current_user, 'app.record_operator_delivery_attempt(text,text,text,integer,text)', 'EXECUTE')::int; ROLLBACK; RESET ROLE; SELECT session_user;" | tail -n 1)"
scheduler_login="$(probe "$scheduler_url" "SELECT app.release_principal_context(); BEGIN; SET ROLE app_operational_scheduler; SELECT count(*) FROM app.list_scheduler_reminder_organization_ids(); UPDATE integrator.idempotency_keys SET key=key WHERE false; DELETE FROM integrator.idempotency_keys WHERE false; INSERT INTO integrator.idempotency_keys(key, expires_at, request_hash, status, response_body) SELECT 'c4-readiness', now(), '', 200, '{}'::jsonb WHERE false; ROLLBACK; RESET ROLE; SELECT session_user;" | tail -n 1)"
media_login="$(probe "$media_url" "SELECT app.release_principal_context(); BEGIN; SET ROLE app_operational_media_worker; UPDATE public.media_transcode_jobs SET id=id WHERE false; UPDATE public.media_files SET id=id WHERE false; SELECT app.read_media_worker_runtime_setting('video_hls_pipeline_enabled'); ROLLBACK; RESET ROLE; SELECT session_user;" | tail -n 1)"
web_push_reminder_login="$(probe "$web_push_reminder_url" "BEGIN; SET ROLE app_operational_web_push_reminder; SELECT set_config('app.org', '00000000-0000-4000-8000-000000000001', true); SELECT 1 / has_function_privilege(current_user, 'app.is_staff()', 'EXECUTE')::int; SELECT 1 / has_function_privilege(current_user, 'app.current_org_id()', 'EXECUTE')::int; SELECT 1 / has_function_privilege(current_user, 'app.current_patient_user_id()', 'EXECUTE')::int; SELECT 1 / has_function_privilege(current_user, 'app.current_integrator_user_id()', 'EXECUTE')::int; SELECT app.is_staff(), app.current_org_id(), app.current_patient_user_id(), app.current_integrator_user_id(); SELECT count(*) FROM app.list_web_push_reminder_organization_ids(now()); UPDATE public.webapp_reminder_occurrences SET id=id WHERE false; ROLLBACK; RESET ROLE; SELECT session_user;" | tail -n 1)"

web_push_status_ok="$(probe "$web_push_reminder_url" "BEGIN; SET ROLE app_operational_web_push_reminder; INSERT INTO public.operator_job_status(job_family, job_key, last_status) VALUES ('reminders', 'reminders.web_push_only.tick', 'ok') ON CONFLICT (job_key) DO UPDATE SET job_family=EXCLUDED.job_family, last_status=EXCLUDED.last_status; SELECT (count(*) = 1)::int FROM public.operator_job_status WHERE job_family='reminders' AND job_key='reminders.web_push_only.tick' AND last_status='ok'; ROLLBACK;" | tail -n 1)"
[ "$web_push_status_ok" = "1" ] || fail "web-push exact operator status write/read failed"
web_push_status_other_rows="$(probe "$web_push_reminder_url" "SET ROLE app_operational_web_push_reminder; SELECT count(*) FROM public.operator_job_status WHERE job_family <> 'reminders' OR job_key <> 'reminders.web_push_only.tick'; WITH changed AS (UPDATE public.operator_job_status SET last_status='readiness-forbidden' WHERE job_family <> 'reminders' OR job_key <> 'reminders.web_push_only.tick' RETURNING 1) SELECT count(*) FROM changed;")"
[ "$web_push_status_other_rows" = $'0\n0' ] || fail "web-push operator status policy exposed or updated another key"

# Real fail-if-succeeds probes: each capability must be unable to enter a sibling contour.
expect_denied "$diagnostic_url" "diagnostic cross-contour reminder read" \
  "SET ROLE app_operational_diagnostic; SELECT count(*) FROM public.reminder_rules;"
expect_denied "$delivery_url" "delivery cross-contour scheduler read" \
  "SET ROLE app_operational_delivery_worker; SELECT count(*) FROM integrator.idempotency_keys;"
expect_denied "$delivery_url" "delivery cross-contour web-push read" \
  "SET ROLE app_operational_delivery_worker; SELECT count(*) FROM public.reminder_rules;"
expect_denied "$scheduler_url" "scheduler cross-contour delivery read" \
  "SET ROLE app_operational_scheduler; SELECT count(*) FROM public.outgoing_delivery_queue;"
expect_denied "$scheduler_url" "scheduler cross-contour web-push read" \
  "SET ROLE app_operational_scheduler; SELECT count(*) FROM public.reminder_rules;"
expect_denied "$media_url" "media cross-contour scheduler read" \
  "SET ROLE app_operational_media_worker; SELECT count(*) FROM integrator.idempotency_keys;"
expect_denied "$media_url" "media cross-contour web-push read" \
  "SET ROLE app_operational_media_worker; SELECT count(*) FROM public.reminder_rules;"
expect_denied "$web_push_reminder_url" "web-push base login direct table read" \
  "SELECT count(*) FROM public.reminder_rules;"
expect_denied "$web_push_reminder_url" "web-push cross-contour scheduler read" \
  "SET ROLE app_operational_web_push_reminder; SELECT count(*) FROM integrator.idempotency_keys;"
expect_denied "$web_push_reminder_url" "web-push cross-contour delivery read" \
  "SET ROLE app_operational_web_push_reminder; SELECT count(*) FROM public.outgoing_delivery_queue;"
expect_denied "$web_push_reminder_url" "web-push cross-contour media read" \
  "SET ROLE app_operational_web_push_reminder; SELECT count(*) FROM public.media_files;"
expect_denied "$web_push_reminder_url" "web-push staff/nonstaff business-table read" \
  "SET ROLE app_operational_web_push_reminder; SELECT count(*) FROM public.be_appointments;"
expect_denied "$web_push_reminder_url" "web-push noncanonical operator status key" \
  "SET ROLE app_operational_web_push_reminder; INSERT INTO public.operator_job_status(job_family, job_key, last_status) VALUES ('readiness', 'readiness', 'ok');"
expect_denied "$web_push_reminder_url" "web-push operator status delete" \
  "SET ROLE app_operational_web_push_reminder; DELETE FROM public.operator_job_status WHERE job_key='reminders.web_push_only.tick';"

login_count="$(printf '%s\n' "$diagnostic_login" "$delivery_login" "$scheduler_login" "$media_login" "$web_push_reminder_login" | sed '/^$/d' | sort -u | wc -l)"
[ "$login_count" -eq 5 ] || fail "five contours must authenticate as five distinct PostgreSQL roles"
echo "C4 operational readiness: OK"
