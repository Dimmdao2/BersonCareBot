#!/bin/bash
set -euo pipefail

# Two-session adversarial proof for migration 0184. Run on a migrated disposable/DEV database as
# an operator able to connect as postgres. Session 1 holds the same cutover lock; session 2 attempts
# a live organization INSERT and must wait, then commit only after the trigger created its snapshot.

DB_NAME="${1:-bcb_webapp_dev}"
ORG_ID="fa184000-0000-4000-8000-000000000001"
LOCK_HOLDER_PID=""

psql_super() {
  sudo -n -u postgres psql -d "${DB_NAME}" -X -v ON_ERROR_STOP=1 "$@"
}

cleanup() {
  if [ -n "${LOCK_HOLDER_PID}" ]; then
    wait "${LOCK_HOLDER_PID}" 2>/dev/null || true
  fi
  psql_super -qAtc "DELETE FROM public.be_organizations WHERE id = '${ORG_ID}'::uuid" >/dev/null 2>&1 || true
}
trap cleanup EXIT

psql_super -qAtc "DELETE FROM public.be_organizations WHERE id = '${ORG_ID}'::uuid" >/dev/null

psql_super -q <<'SQL' &
BEGIN;
LOCK TABLE public.be_organizations IN SHARE ROW EXCLUSIVE MODE;
SELECT pg_sleep(2);
COMMIT;
SQL
LOCK_HOLDER_PID="$!"

lock_seen=0
for _attempt in $(seq 1 40); do
  lock_seen="$(psql_super -qAtc "
    SELECT EXISTS (
      SELECT 1 FROM pg_locks
      WHERE relation = 'public.be_organizations'::regclass
        AND mode = 'ShareRowExclusiveLock'
        AND granted
    )::int
  ")"
  [ "${lock_seen}" = "1" ] && break
  sleep 0.05
done
[ "${lock_seen}" = "1" ] || { echo "cutover lock was not observed" >&2; exit 1; }

started_ms="$(date +%s%3N)"
psql_super -qAtc "
  INSERT INTO public.be_organizations (id, title, is_active, sort_order, created_at, updated_at)
  VALUES ('${ORG_ID}'::uuid, 'Reference cutover concurrency smoke', true, 0, now(), now())
" >/dev/null
finished_ms="$(date +%s%3N)"
wait "${LOCK_HOLDER_PID}"
LOCK_HOLDER_PID=""

elapsed_ms=$((finished_ms - started_ms))
[ "${elapsed_ms}" -ge 1000 ] || {
  echo "organization INSERT did not wait for the cutover lock (${elapsed_ms}ms)" >&2
  exit 1
}

invariant_ok="$(psql_super -qAtc "
  SELECT (
    EXISTS (SELECT 1 FROM public.reference_catalog_snapshot_receipts WHERE organization_id = '${ORG_ID}'::uuid)
    AND EXISTS (SELECT 1 FROM public.reference_categories WHERE organization_id = '${ORG_ID}'::uuid)
    AND EXISTS (SELECT 1 FROM public.reference_items WHERE organization_id = '${ORG_ID}'::uuid)
  )::int
")"
[ "${invariant_ok}" = "1" ] || { echo "organization committed without a complete reference snapshot" >&2; exit 1; }

echo "smoke-reference-catalog-cutover-concurrency: OK (${elapsed_ms}ms blocked)"
