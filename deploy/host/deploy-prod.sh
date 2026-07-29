#!/bin/bash
set -euo pipefail

PROJECT_ROOT=/opt/projects/bersoncarebot
ENV_FILE=/opt/env/bersoncarebot/api.prod
WEBAPP_ENV_FILE=/opt/env/bersoncarebot/webapp.prod
MEDIA_WORKER_ENV_FILE=/opt/env/bersoncarebot/media-worker.prod
C4_OPERATIONAL_RUNTIME=deploy/postgres/c4-operational-runtime.sql
C4_OPERATIONAL_READINESS=deploy/host/assert-c4-operational-runtime-ready.sh
BACKUP_SCRIPT=/opt/backups/scripts/postgres-backup.sh
STAGE13_CUTOVER_SCRIPT=deploy/host/run-stage13-cutover.sh
SPECIALIST_OWNER_PROVISIONING_RLS=deploy/postgres/specialist-owner-provisioning-rls.sql
REFERENCE_CATALOG_RLS=deploy/postgres/reference-catalog-rls.sql
PATIENT_VISIBLE_CATALOG_RLS=deploy/postgres/patient-visible-catalog-rls.sql
PATIENT_MEDIA_PLAYBACK_TELEMETRY_ACCESSORS=deploy/postgres/patient-media-playback-telemetry-accessors.sql
PATIENT_INVITES_RLS=deploy/postgres/patient-invites-rls.sql
API_SERVICE=bersoncarebot-api-prod.service
WORKER_SERVICE=bersoncarebot-worker-prod.service
SCHEDULER_SERVICE=bersoncarebot-scheduler-prod.service
WEBAPP_SERVICE=bersoncarebot-webapp-prod.service
MEDIA_WORKER_SERVICE=bersoncarebot-media-worker-prod.service

# Branch to deploy. Defaults to main (production). Exported so the value
# survives the self re-exec below.
export DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"

fail() {
  echo "deploy-prod: $*" >&2
  exit 1
}

assert_canonical_prod_host() {
  local current_hostname address found_ip=0
  current_hostname="$(hostname -s 2>/dev/null || true)"
  [ "$current_hostname" = "adelaide" ] ||
    fail "refusing PROD deploy on host '${current_hostname:-unknown}'; expected adelaide"
  for address in $(hostname -I 2>/dev/null || true); do
    if [ "$address" = "135.106.162.170" ]; then
      found_ip=1
      break
    fi
  done
  [ "$found_ip" -eq 1 ] ||
    fail "refusing PROD deploy without local IPv4 135.106.162.170"
}

require_file() {
  local path="$1"
  local description="$2"
  if [ ! -f "$path" ]; then
    fail "${description} not found: ${path}"
  fi
}

require_unit_file() {
  local unit="$1"
  local installed="/etc/systemd/system/${unit}"
  local source="${PROJECT_ROOT}/deploy/systemd/${unit}"
  local fragment_path drop_in_paths need_reload
  [ -f "${source}" ] && [ ! -L "${source}" ] ||
    fail "Reviewed systemd template is missing or is a symlink: ${source}"
  [ -f "${installed}" ] && [ ! -L "${installed}" ] ||
    fail "Missing or non-regular systemd unit ${unit}. Root must run deploy/host/bootstrap-systemd-prod.sh before deploy."
  [ "$(stat -c '%U:%G:%a' "${installed}")" = "root:root:644" ] ||
    fail "Unsafe ownership/mode for ${installed}; expected root:root:644. Root must re-run bootstrap-systemd-prod.sh."
  cmp -s "${source}" "${installed}" ||
    fail "Installed ${unit} differs from the reviewed repo template. Root must re-run bootstrap-systemd-prod.sh."
  fragment_path="$(/bin/systemctl show --property=FragmentPath --value "${unit}")" ||
    fail "Cannot inspect loaded fragment for ${unit}."
  [ "${fragment_path}" = "${installed}" ] ||
    fail "Systemd loaded ${unit} from unexpected fragment ${fragment_path:-<none>}."
  drop_in_paths="$(/bin/systemctl show --property=DropInPaths --value "${unit}")" ||
    fail "Cannot inspect drop-ins for ${unit}."
  [ -z "${drop_in_paths}" ] ||
    fail "Unexpected drop-ins can override the reviewed host gate for ${unit}: ${drop_in_paths}"
  need_reload="$(/bin/systemctl show --property=NeedDaemonReload --value "${unit}")" ||
    fail "Cannot inspect daemon-reload state for ${unit}."
  [ "${need_reload}" = "no" ] ||
    fail "Systemd has not loaded the reviewed ${unit}; root must run bootstrap-systemd-prod.sh."
}

require_sudo_rule() {
  local description="$1"
  shift

  if ! sudo -n -l "$@" >/dev/null 2>&1; then
    fail "Missing passwordless sudo permission for ${description}: $*"
  fi
}

assert_canonical_prod_host

cd "${PROJECT_ROOT}"
# Discard local changes to auto-generated file so pull never conflicts (Next.js overwrites it on build).
git checkout -- apps/webapp/next-env.d.ts 2>/dev/null || true
git pull origin "${DEPLOY_BRANCH}"

# Re-exec self so we run the updated script (current process was started before pull).
if [ -z "${DEPLOY_PROD_RERUN:-}" ]; then
  export DEPLOY_PROD_RERUN=1
  exec bash deploy/host/deploy-prod.sh
fi

require_file "${ENV_FILE}" "Production environment file"
require_file "${WEBAPP_ENV_FILE}" "Production webapp environment file"
require_file "${MEDIA_WORKER_ENV_FILE}" "Media-worker environment file"
require_file "${BACKUP_SCRIPT}" "Backup script"
require_file "${PROJECT_ROOT}/${C4_OPERATIONAL_RUNTIME}" "C4 operational runtime contract"
require_file "${PROJECT_ROOT}/${C4_OPERATIONAL_READINESS}" "C4 operational readiness probe"
require_file "${PROJECT_ROOT}/${SPECIALIST_OWNER_PROVISIONING_RLS}" "Specialist owner provisioning overlay"
require_file "${PROJECT_ROOT}/${REFERENCE_CATALOG_RLS}" "Reference catalog RLS overlay"
require_file "${PROJECT_ROOT}/${PATIENT_VISIBLE_CATALOG_RLS}" "Patient-visible catalog RLS overlay"
require_file "${PROJECT_ROOT}/${PATIENT_MEDIA_PLAYBACK_TELEMETRY_ACCESSORS}" "Patient media playback telemetry accessor overlay"
require_file "${PROJECT_ROOT}/${PATIENT_INVITES_RLS}" "Patient invite strict runtime overlay"
require_unit_file "${API_SERVICE}"
require_unit_file "${WORKER_SERVICE}"
require_unit_file "${SCHEDULER_SERVICE}"
require_unit_file "${WEBAPP_SERVICE}"
require_unit_file "${MEDIA_WORKER_SERVICE}"

require_sudo_rule "backup script" "${BACKUP_SCRIPT}" pre-migrations
require_sudo_rule "API restart" /bin/systemctl restart "${API_SERVICE}"
require_sudo_rule "worker restart" /bin/systemctl restart "${WORKER_SERVICE}"
require_sudo_rule "scheduler restart" /bin/systemctl restart "${SCHEDULER_SERVICE}"
require_sudo_rule "API status check" /bin/systemctl is-active --quiet "${API_SERVICE}"
require_sudo_rule "worker status check" /bin/systemctl is-active --quiet "${WORKER_SERVICE}"
require_sudo_rule "scheduler status check" /bin/systemctl is-active --quiet "${SCHEDULER_SERVICE}"

export CI=true
pnpm install --frozen-lockfile

# Remove stale root dist/ from before move to apps/integrator (API/worker now run from apps/integrator/dist).
rm -rf dist

pnpm build

# Drop previous Next output so `next build` does not traverse nested standalone/**/.next and hit EACCES on unlink (e.g. root-owned dirs from a prior sudo run or a root webapp process).
if [ -d apps/webapp/.next ]; then
  rm -rf apps/webapp/.next || fail "Cannot remove apps/webapp/.next (likely root-owned). As root on the host: systemctl stop ${WEBAPP_SERVICE} && rm -rf ${PROJECT_ROOT}/apps/webapp/.next — then redeploy as deploy. See SERVER CONVENTIONS.md."
fi
pnpm build:webapp

pnpm --dir apps/media-worker build

bash deploy/host/sync-webapp-standalone-assets.sh
WEBAPP_STANDALONE_CHUNKS=apps/webapp/.next/standalone/apps/webapp/.next/static/chunks
sample_chunk="$(find "${WEBAPP_STANDALONE_CHUNKS}" -maxdepth 1 -type f -name "*.js" | sort | sed -n '1p' | xargs -r basename)"
[ -n "${sample_chunk}" ] || fail "Standalone has no JS under ${WEBAPP_STANDALONE_CHUNKS} after sync."

set -a
source "${ENV_FILE}"
set +a

# Конвенция: прод API слушает 3200 (dev 4200). Иначе health check и nginx не совпадут с процессом.
if [ "${PORT:-}" != "3200" ]; then
  fail "api.prod must set PORT=3200 for production. Current: PORT=${PORT:-<unset>}. See SERVER CONVENTIONS.md and deploy/env/README.md."
fi

# Load webapp env after API PORT validation.
set -a
source "${WEBAPP_ENV_FILE}"
set +a

# Backup before migrations: write to pre-migrations folder (run as root).
# Script must support first arg "pre-migrations" and write to /opt/backups/postgres/pre-migrations/
sudo -n "${BACKUP_SCRIPT}" pre-migrations

pnpm migrate
pnpm --dir apps/webapp run migrate

# Migration 0182 versions the reference baseline helper. Refresh the canonical SECURITY DEFINER
# provisioning function in the same post-migration order as the SaaS TEST wrapper so a newly
# created organization receives its catalog snapshot in the organization-creation transaction.
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${PROJECT_ROOT}/${SPECIALIST_OWNER_PROVISIONING_RLS}"
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${PROJECT_ROOT}/${REFERENCE_CATALOG_RLS}"
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${PROJECT_ROOT}/${PATIENT_VISIBLE_CATALOG_RLS}"
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${PROJECT_ROOT}/${PATIENT_MEDIA_PLAYBACK_TELEMETRY_ACCESSORS}"
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${PROJECT_ROOT}/${PATIENT_INVITES_RLS}"

# Guardrail: fail before service restart if critical public columns are missing (shared list).
bash "${PROJECT_ROOT}/deploy/host/webapp-post-migrate-schema-check.sh"
bash "${PROJECT_ROOT}/${C4_OPERATIONAL_READINESS}"

sudo -n /bin/systemctl restart "${API_SERVICE}"
sudo -n /bin/systemctl restart "${WORKER_SERVICE}"
sudo -n /bin/systemctl restart "${SCHEDULER_SERVICE}"

sudo -n /bin/systemctl restart "${WEBAPP_SERVICE}"
# Next may not listen on 6200 immediately; curl exits 7 on connection refused — retry like /health below.
chunk_url="http://127.0.0.1:6200/_next/static/chunks/${sample_chunk}"
chunk_http_code=""
chunk_ok=0
for i in 1 2 3 4 5 6 7 8 9 10; do
  chunk_http_code="$(curl -s -o /dev/null -w "%{http_code}" "${chunk_url}" 2>/dev/null)" || true
  if [ "${chunk_http_code}" = "200" ]; then
    chunk_ok=1
    break
  fi
  if [ "$i" -eq 10 ]; then
    break
  fi
  sleep 2
done
if [ "${chunk_ok}" != "1" ]; then
  fail "Chunk is not served after webapp restart: /_next/static/chunks/${sample_chunk} (last HTTP ${chunk_http_code:-<none>})"
fi

sudo -n /bin/systemctl restart "${MEDIA_WORKER_SERVICE}"
if ! sudo -n /bin/systemctl is-active --quiet "${MEDIA_WORKER_SERVICE}"; then
  echo "deploy-prod: ${MEDIA_WORKER_SERVICE} is not active. Last journal lines:" >&2
  sudo -n journalctl -u "${MEDIA_WORKER_SERVICE}" -n 40 --no-pager 2>/dev/null || true
  fail "${MEDIA_WORKER_SERVICE} failed to start (ensure media-worker.prod has DATABASE_URL, S3_*, FFMPEG_PATH; apps/media-worker built)."
fi

sleep 3

if ! sudo -n /bin/systemctl is-active --quiet "${API_SERVICE}"; then
  echo "deploy-prod: ${API_SERVICE} is not active. Last journal lines:" >&2
  sudo -n journalctl -u "${API_SERVICE}" -n 40 --no-pager 2>/dev/null || true
  echo "deploy-prod: Ensure api.prod has PORT=3200, TELEGRAM_BOT_TOKEN, SMSC_*, and values with \$ in single quotes." >&2
  exit 1
fi
if ! sudo -n /bin/systemctl is-active --quiet "${WORKER_SERVICE}"; then
  echo "deploy-prod: ${WORKER_SERVICE} is not active. Last journal lines:" >&2
  sudo -n journalctl -u "${WORKER_SERVICE}" -n 40 --no-pager 2>/dev/null || true
  exit 1
fi
if ! sudo -n /bin/systemctl is-active --quiet "${SCHEDULER_SERVICE}"; then
  echo "deploy-prod: ${SCHEDULER_SERVICE} is not active. Last journal lines:" >&2
  sudo -n journalctl -u "${SCHEDULER_SERVICE}" -n 40 --no-pager 2>/dev/null || true
  exit 1
fi

# Health check: PORT уже проверен выше (3200).
API_PORT=3200
for i in 1 2 3 4 5; do
  if curl -sf "http://127.0.0.1:${API_PORT}/health" -o /tmp/bersoncarebot-health.json; then
    break
  fi
  if [ "$i" -eq 5 ]; then
    echo "Health check failed after 5 attempts (port ${API_PORT})"
    exit 1
  fi
  sleep 2
done

grep -q '"ok":true' /tmp/bersoncarebot-health.json
grep -q '"db":"up"' /tmp/bersoncarebot-health.json

# Optional post-deploy Stage 13 cutover (backfill + reconcile + stage13-gate).
# Enable explicitly to avoid heavy one-time tasks on every deploy:
#   RUN_STAGE13_CUTOVER=1 bash deploy/host/deploy-prod.sh
# Optional dry-run-only:
#   RUN_STAGE13_CUTOVER=1 RUN_STAGE13_CUTOVER_DRY_RUN_ONLY=1 bash deploy/host/deploy-prod.sh
if [ "${RUN_STAGE13_CUTOVER:-0}" = "1" ]; then
  if [ ! -x "${PROJECT_ROOT}/${STAGE13_CUTOVER_SCRIPT}" ]; then
    fail "Stage13 cutover script is missing or not executable: ${PROJECT_ROOT}/${STAGE13_CUTOVER_SCRIPT}"
  fi

  if [ "${RUN_STAGE13_CUTOVER_DRY_RUN_ONLY:-0}" = "1" ]; then
    bash "${PROJECT_ROOT}/${STAGE13_CUTOVER_SCRIPT}" --dry-run-only
  else
    bash "${PROJECT_ROOT}/${STAGE13_CUTOVER_SCRIPT}"
  fi
fi
