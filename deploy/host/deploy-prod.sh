#!/bin/bash
set -euo pipefail

PROJECT_ROOT=/opt/projects/bersoncarebot
ENV_FILE=/opt/env/bersoncarebot/api.prod
WEBAPP_ENV_FILE=/opt/env/bersoncarebot/webapp.prod
MEDIA_WORKER_ENV_FILE=/opt/env/bersoncarebot/media-worker.prod
C4_OPERATIONAL_RUNTIME=deploy/postgres/c4-operational-runtime.sql
C4_OPERATIONAL_READINESS=deploy/host/assert-c4-operational-runtime-ready.sh
C4_MEDIA_CONTROL_CUTOVER=deploy/host/media-control-cutover-sequence.sh
SAAS_C2_SECRET_PREFLIGHT=deploy/host/saas-c2-secret-preflight.mjs
BACKUP_SCRIPT=/opt/backups/scripts/postgres-backup.sh
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
require_file "${PROJECT_ROOT}/${C4_MEDIA_CONTROL_CUTOVER}" "C4 media control cutover sequence"
require_file "${PROJECT_ROOT}/${SAAS_C2_SECRET_PREFLIGHT}" "SaaS C2 secret preflight"
require_unit_file "${API_SERVICE}"
require_unit_file "${WORKER_SERVICE}"
require_unit_file "${SCHEDULER_SERVICE}"
require_unit_file "${WEBAPP_SERVICE}"
require_unit_file "${MEDIA_WORKER_SERVICE}"

# shellcheck source=deploy/host/media-control-cutover-sequence.sh
source "${PROJECT_ROOT}/${C4_MEDIA_CONTROL_CUTOVER}"

# B0.2 (#1057): refuse before any build/restart work if the artifact retains a mock-payment surface.
bash "${PROJECT_ROOT}/deploy/host/assert-no-mock-payment-deploy.sh" "${PROJECT_ROOT}"

# All three service env files are checked as raw declarations before a build,
# migration, or restart can leave a media DB credential live.
node "${PROJECT_ROOT}/${SAAS_C2_SECRET_PREFLIGHT}" \
  --process-env-file="webapp:${WEBAPP_ENV_FILE}" \
  --process-env-file="integrator:${ENV_FILE}" \
  --process-env-file="media-worker:${MEDIA_WORKER_ENV_FILE}"

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

# B0 owner ruling: the future PROD A→B0 migration is deliberately not implemented here.
# This deploy is code-only until DEV and named TEST have completed their full green runtime passes.
# In particular it must never invoke the DEV-only `migrate-dev.sh` wrapper.
# Guardrail: fail before service restart if critical public columns are missing (shared list).
bash "${PROJECT_ROOT}/deploy/host/webapp-post-migrate-schema-check.sh"

# The first rollout may not have the three operational DB roles yet. Bring up only the new
# webapp first, so the root provisioner can prove the authenticated control route without
# restarting any DB operational process on an unprovisioned contract.
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

media_cutover_require_new_webapp_running(){
  [ "${chunk_ok}" = "1" ] || fail "new webapp did not reach the media-control cutover gate"
}
media_cutover_require_authenticated_control(){
  bash "${PROJECT_ROOT}/${C4_OPERATIONAL_READINESS}"
}
media_cutover_require_legacy_login_retired(){
  local absent
  absent="$(psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -qAtc \
    "SELECT (to_regrole('bcb_prod_operational_media_login') IS NULL)::text;")"
  [ "${absent}" = "true" ] ||
    fail "legacy media DB login still exists; root must run provision-c4-operational-runtime.sh now that the new webapp is live, then rerun deploy"
}
media_cutover_restart_worker(){
  sudo -n /bin/systemctl restart "${MEDIA_WORKER_SERVICE}"
}
run_media_control_cutover_sequence

sudo -n /bin/systemctl restart "${API_SERVICE}"
sudo -n /bin/systemctl restart "${WORKER_SERVICE}"
sudo -n /bin/systemctl restart "${SCHEDULER_SERVICE}"
if ! sudo -n /bin/systemctl is-active --quiet "${MEDIA_WORKER_SERVICE}"; then
  echo "deploy-prod: ${MEDIA_WORKER_SERVICE} is not active. Last journal lines:" >&2
  sudo -n journalctl -u "${MEDIA_WORKER_SERVICE}" -n 40 --no-pager 2>/dev/null || true
  fail "${MEDIA_WORKER_SERVICE} failed to start (ensure media-worker.prod has MEDIA_WORKER_CONTROL_URL, INTERNAL_JOB_SECRET, S3_*, FFMPEG_PATH; apps/media-worker built)."
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
