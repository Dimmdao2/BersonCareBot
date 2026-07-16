#!/usr/bin/env bash
set -euo pipefail

API_ENV_FILE="${API_ENV_FILE:-/opt/env/bersoncarebot/api.prod}"
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

set -a
# shellcheck disable=SC1090
. "$MEDIA_WORKER_ENV_FILE"
set +a
: "${DATABASE_URL:?missing media-worker DATABASE_URL}"
media_url="$DATABASE_URL"

probe(){ psql "$1" -X -v ON_ERROR_STOP=1 -qAtc "$2"; }

diagnostic_login="$(probe "$diagnostic_url" "SELECT app.release_principal_context(); SET ROLE app_operational_diagnostic; SELECT count(*) FROM integrator.projection_outbox WHERE false; RESET ROLE; SELECT session_user;" | tail -n 1)"
delivery_login="$(probe "$delivery_url" "SELECT app.release_principal_context(); BEGIN; SET ROLE app_operational_delivery_worker; UPDATE integrator.projection_outbox SET id=id WHERE false; UPDATE integrator.rubitime_create_retry_jobs SET id=id WHERE false; UPDATE public.outgoing_delivery_queue SET id=id WHERE false; SELECT resolution FROM app.resolve_outgoing_delivery_scope('00000000-0000-4000-8000-000000000000'::uuid); SELECT app.operator_incident_alert_already_sent('00000000-0000-4000-8000-000000000000'::uuid); SELECT app.mark_operator_incident_alert_sent('00000000-0000-4000-8000-000000000000'::uuid); ROLLBACK; RESET ROLE; SELECT session_user;" | tail -n 1)"
scheduler_login="$(probe "$scheduler_url" "SELECT app.release_principal_context(); BEGIN; SET ROLE app_operational_scheduler; SELECT count(*) FROM app.list_scheduler_reminder_organization_ids(); UPDATE integrator.idempotency_keys SET key=key WHERE false; DELETE FROM integrator.idempotency_keys WHERE false; INSERT INTO integrator.idempotency_keys(key, expires_at, request_hash, status, response_body) SELECT 'c4-readiness', now(), '', 200, '{}'::jsonb WHERE false; ROLLBACK; RESET ROLE; SELECT session_user;" | tail -n 1)"
media_login="$(probe "$media_url" "SELECT app.release_principal_context(); BEGIN; SET ROLE app_operational_media_worker; UPDATE public.media_transcode_jobs SET id=id WHERE false; UPDATE public.media_files SET id=id WHERE false; SELECT app.read_media_worker_runtime_setting('video_hls_pipeline_enabled'); ROLLBACK; RESET ROLE; SELECT session_user;" | tail -n 1)"

login_count="$(printf '%s\n' "$diagnostic_login" "$delivery_login" "$scheduler_login" "$media_login" | sed '/^$/d' | sort -u | wc -l)"
[ "$login_count" -eq 4 ] || fail "four contours must authenticate as four distinct PostgreSQL roles"
echo "C4 operational readiness: OK"
