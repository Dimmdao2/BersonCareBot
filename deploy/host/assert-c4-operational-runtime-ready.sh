#!/usr/bin/env bash
set -euo pipefail

API_ENV_FILE="${API_ENV_FILE:-/opt/env/bersoncarebot/api.prod}"
WEBAPP_ENV_FILE="${WEBAPP_ENV_FILE:-/opt/env/bersoncarebot/webapp.prod}"
MEDIA_WORKER_ENV_FILE="${MEDIA_WORKER_ENV_FILE:-/opt/env/bersoncarebot/media-worker.prod}"
READINESS_MODE=full
case "${1:-}" in
  '') ;;
  --database-only) READINESS_MODE=database-only ;;
  *) echo 'C4 operational readiness: usage: assert-c4-operational-runtime-ready.sh [--database-only]' >&2; exit 2 ;;
esac
fail(){ echo "C4 operational readiness: $*" >&2; exit 1; }
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DATABASE_URL_GUARD="$REPO_ROOT/scripts/validate-migration-database-url.mjs"
readonly DATABASE_URL_GUARD
[[ -f "$DATABASE_URL_GUARD" && ! -L "$DATABASE_URL_GUARD" ]] ||
  fail "shared database URL guard is missing or not a regular repository file"

PROD_API_ENV=/opt/env/bersoncarebot/api.prod
PROD_WEBAPP_ENV=/opt/env/bersoncarebot/webapp.prod
PROD_MEDIA_ENV=/opt/env/bersoncarebot/media-worker.prod
TEST_API_ENV=/opt/env/bersoncarebot/api.test
TEST_WEBAPP_ENV=/opt/env/bersoncarebot/webapp.test
TEST_MEDIA_ENV=/opt/env/bersoncarebot/media-worker.test

has_local_ipv4(){
  local expected="$1" address
  for address in $(hostname -I 2>/dev/null || true); do
    [ "$address" = "$expected" ] && return 0
  done
  return 1
}

assert_canonical_prod_host(){
  local current_hostname
  current_hostname="$(hostname -s 2>/dev/null || true)"
  [ "$current_hostname" = "adelaide" ] ||
    fail "refusing PROD readiness probe on host '${current_hostname:-unknown}'; expected adelaide"
  has_local_ipv4 135.106.162.170 ||
    fail "refusing PROD readiness probe without local IPv4 135.106.162.170"
}

assert_canonical_test_host(){
  has_local_ipv4 151.241.228.122 ||
    fail "refusing TEST readiness probe without local IPv4 151.241.228.122"
}

assert_regular_env_file(){
  local candidate="$1"
  [ -f "$candidate" ] && [ ! -L "$candidate" ] ||
    fail "env contract requires a regular non-symlink file at $candidate"
}

assert_local_database_url(){
  local url="$1" expected_database="$2"
  printf '%s' "$url" | node "$DATABASE_URL_GUARD" canonical "$expected_database" ||
    fail "database URL rejected by shared target guard"
}

case "${API_ENV_FILE}|${WEBAPP_ENV_FILE}|${MEDIA_WORKER_ENV_FILE}" in
  "${PROD_API_ENV}|${PROD_WEBAPP_ENV}|${PROD_MEDIA_ENV}")
    expected_database=bersoncarebot
    assert_canonical_prod_host
    ;;
  "${TEST_API_ENV}|${TEST_WEBAPP_ENV}|${TEST_MEDIA_ENV}")
    expected_database=bersoncarebot_test
    assert_canonical_test_host
    ;;
  *)
    fail "env paths must be the exact canonical PROD or TEST triplet"
    ;;
esac

assert_regular_env_file "$API_ENV_FILE"
assert_regular_env_file "$WEBAPP_ENV_FILE"
assert_regular_env_file "$MEDIA_WORKER_ENV_FILE"

node "$REPO_ROOT/deploy/host/saas-c2-secret-preflight.mjs" \
  --process-env-file="webapp:$WEBAPP_ENV_FILE" \
  --process-env-file="integrator:$API_ENV_FILE" \
  --process-env-file="media-worker:$MEDIA_WORKER_ENV_FILE" >/dev/null

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
assert_local_database_url "$diagnostic_url" "$expected_database"
assert_local_database_url "$delivery_url" "$expected_database"
assert_local_database_url "$scheduler_url" "$expected_database"

media_control_ready(){
  local attempt
  for attempt in 1 2 3 4 5 6 7 8 9 10; do
    if curl --fail --silent --show-error --max-time 10 \
      -H "Authorization: Bearer $INTERNAL_JOB_SECRET" \
      -H 'content-type: application/json' \
      --data '{"type":"ready"}' \
      "$MEDIA_WORKER_CONTROL_URL/api/internal/media-worker/control" |
      grep -q '"ok":true'; then
      return 0
    fi
    [ "$attempt" -eq 10 ] || sleep 2
  done
  return 1
}

probe(){ psql "$1" -X -v ON_ERROR_STOP=1 -qAtc "$2"; }
expect_denied(){
  local url="$1" label="$2" sql="$3"
  if probe "$url" "$sql" >/dev/null 2>&1; then
    fail "$label unexpectedly succeeded"
  fi
}

diagnostic_login="$(probe "$diagnostic_url" "SELECT app.release_principal_context(); SET ROLE app_operational_diagnostic; SELECT count(*) FROM integrator.projection_outbox WHERE false; RESET ROLE; SELECT session_user;" | tail -n 1)"
delivery_login="$(probe "$delivery_url" "SELECT app.release_principal_context(); BEGIN; SET ROLE app_operational_delivery_worker; UPDATE integrator.projection_outbox SET id=id WHERE false; UPDATE public.outgoing_delivery_queue SET id=id WHERE false; SELECT resolution FROM app.resolve_outgoing_delivery_scope('00000000-0000-4000-8000-000000000000'::uuid); SELECT app.operator_incident_alert_already_sent('00000000-0000-4000-8000-000000000000'::uuid); SELECT app.mark_operator_incident_alert_sent('00000000-0000-4000-8000-000000000000'::uuid); SELECT 1 / has_function_privilege(current_user, 'app.record_operator_delivery_attempt(text,text,text,integer,text)', 'EXECUTE')::int; SELECT app.revalidate_specialist_task_reminder_materialization('00000000-0000-4000-8000-000000000000'::uuid); SELECT app.apply_specialist_task_reminder_success_outcome('00000000-0000-4000-8000-000000000000'::uuid); SELECT 1 / has_function_privilege(current_user, 'app.revalidate_patient_reminder_delivery_materialization(uuid)', 'EXECUTE')::int; SELECT app.read_operational_verbose_log_flag(); SELECT 1 / has_function_privilege(current_user, 'app.record_operational_delivery_attempt_audit(text,text,text,text,text,integer,text,jsonb,timestamptz)', 'EXECUTE')::int; ROLLBACK; RESET ROLE; SELECT session_user;" | tail -n 1)"
scheduler_login="$(probe "$scheduler_url" "SELECT app.release_principal_context(); BEGIN; SET ROLE app_operational_scheduler; SELECT count(*) FROM app.list_scheduler_reminder_organization_ids(); UPDATE integrator.idempotency_keys SET key=key WHERE false; DELETE FROM integrator.idempotency_keys WHERE false; INSERT INTO integrator.idempotency_keys(key, expires_at, request_hash, status, response_body) SELECT 'c4-readiness', now(), '', 200, '{}'::jsonb WHERE false; SELECT app.read_operator_health_probe_config(); SELECT app.read_operational_verbose_log_flag(); SELECT app.read_operator_outbound_probe_meta(); SELECT count(*) FROM app.list_google_calendar_probe_organization_ids(); SELECT app.resolve_operator_probe_incidents('outbound:max:'); SELECT app.record_operator_outbound_probe_run('success', now(), NULL, '{}'::jsonb); SELECT id FROM app.open_or_touch_operator_probe_incident('max','max_probe_failed','c4-readiness'); ROLLBACK; RESET ROLE; SELECT session_user;" | tail -n 1)"
if [ "$READINESS_MODE" = full ]; then
  set -a
  # shellcheck disable=SC1090
  . "$MEDIA_WORKER_ENV_FILE"
  set +a
  : "${MEDIA_WORKER_CONTROL_URL:?missing MEDIA_WORKER_CONTROL_URL}"
  : "${INTERNAL_JOB_SECRET:?missing INTERNAL_JOB_SECRET}"
  media_control_ready || fail "media-worker authenticated HTTP control readiness failed"
fi
# Real fail-if-succeeds probes: each capability must be unable to enter a sibling contour.
expect_denied "$diagnostic_url" "diagnostic cross-contour reminder read" \
  "SET ROLE app_operational_diagnostic; SELECT count(*) FROM public.reminder_rules;"
expect_denied "$delivery_url" "delivery cross-contour scheduler read" \
  "SET ROLE app_operational_delivery_worker; SELECT count(*) FROM integrator.idempotency_keys;"
expect_denied "$delivery_url" "delivery cross-contour web-push read" \
  "SET ROLE app_operational_delivery_worker; SELECT count(*) FROM public.reminder_rules;"
expect_denied "$delivery_url" "delivery direct specialist-task update bypass" \
  "SET ROLE app_operational_delivery_worker; UPDATE public.specialist_tasks SET reminder_sent_at = reminder_sent_at WHERE false;"
expect_denied "$scheduler_url" "scheduler cross-contour delivery read" \
  "SET ROLE app_operational_scheduler; SELECT count(*) FROM public.outgoing_delivery_queue;"
expect_denied "$scheduler_url" "scheduler cross-contour web-push read" \
  "SET ROLE app_operational_scheduler; SELECT count(*) FROM public.reminder_rules;"
# The probe contour is capability-only: it reads and writes its single operator_job_status row
# through pinned SECURITY DEFINER functions and never holds the table itself.
expect_denied "$scheduler_url" "scheduler direct operator job status access" \
  "SET ROLE app_operational_scheduler; SELECT count(*) FROM public.operator_job_status;"
expect_denied "$scheduler_url" "scheduler direct operator incident access" \
  "SET ROLE app_operational_scheduler; SELECT count(*) FROM public.operator_incidents;"
expect_denied "$scheduler_url" "scheduler generic incident-open capability" \
  "SET ROLE app_operational_scheduler; SELECT app.open_or_touch_operator_incident('x','outbound','max','max_probe_failed',NULL);"
expect_denied "$scheduler_url" "scheduler cross-contour delivery audit capability" \
  "SET ROLE app_operational_scheduler; SELECT app.record_operational_delivery_attempt_audit('message.send','c4-readiness',NULL,'max','failed',1,NULL,'{}'::jsonb, now());"
expect_denied "$scheduler_url" "scheduler out-of-contour probe incident resolve" \
  "SET ROLE app_operational_scheduler; SELECT app.resolve_operator_probe_incidents('outbound:email:');"
expect_denied "$delivery_url" "delivery cross-contour probe capability" \
  "SET ROLE app_operational_delivery_worker; SELECT app.read_operator_outbound_probe_meta();"
login_count="$(printf '%s\n' "$diagnostic_login" "$delivery_login" "$scheduler_login" | sed '/^$/d' | sort -u | wc -l)"
[ "$login_count" -eq 3 ] || fail "three DB operational contours must authenticate as distinct PostgreSQL roles"
if [ "$READINESS_MODE" = full ]; then
  echo "C4 operational readiness: OK (three DB contours + authenticated media HTTP control)"
else
  echo "C4 operational readiness: OK (three DB contours; media HTTP control deferred until new webapp is running)"
fi
