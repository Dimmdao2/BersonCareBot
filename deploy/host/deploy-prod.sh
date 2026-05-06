#!/bin/bash
set -euo pipefail

PROJECT_ROOT=/opt/projects/bersoncarebot
ENV_FILE=/opt/env/bersoncarebot/api.prod
WEBAPP_ENV_FILE=/opt/env/bersoncarebot/webapp.prod
BACKUP_SCRIPT=/opt/backups/scripts/postgres-backup.sh
STAGE13_CUTOVER_SCRIPT=deploy/host/run-stage13-cutover.sh
API_SERVICE=bersoncarebot-api-prod.service
WORKER_SERVICE=bersoncarebot-worker-prod.service
WEBAPP_SERVICE=bersoncarebot-webapp-prod.service
MEDIA_WORKER_SERVICE=bersoncarebot-media-worker-prod.service

fail() {
  echo "deploy-prod: $*" >&2
  exit 1
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
  if [ ! -e "/etc/systemd/system/${unit}" ]; then
    fail "Missing systemd unit ${unit}. Run deploy/host/bootstrap-systemd-prod.sh on the host before CI deploys."
  fi
}

require_sudo_rule() {
  local description="$1"
  shift

  if ! sudo -n -l "$@" >/dev/null 2>&1; then
    fail "Missing passwordless sudo permission for ${description}: $*"
  fi
}

cd "${PROJECT_ROOT}"
# Discard local changes to auto-generated file so pull never conflicts (Next.js overwrites it on build).
git checkout -- apps/webapp/next-env.d.ts 2>/dev/null || true
git pull origin main

# Re-exec self so we run the updated script (current process was started before pull).
if [ -z "${DEPLOY_PROD_RERUN:-}" ]; then
  export DEPLOY_PROD_RERUN=1
  exec bash deploy/host/deploy-prod.sh
fi

# Reinstall systemd units from repo so WorkingDirectory/ExecStart match current layout (apps/integrator).
# Requires deploy user to have NOPASSWD for install and systemctl daemon-reload (see HOST_DEPLOY_README).
require_sudo_rule "systemd unit install API (bootstrap)" /usr/bin/install -m 0644 "${PROJECT_ROOT}/deploy/systemd/bersoncarebot-api-prod.service" /etc/systemd/system/bersoncarebot-api-prod.service
require_sudo_rule "systemd unit install worker (bootstrap)" /usr/bin/install -m 0644 "${PROJECT_ROOT}/deploy/systemd/bersoncarebot-worker-prod.service" /etc/systemd/system/bersoncarebot-worker-prod.service
if [ -f "${PROJECT_ROOT}/deploy/systemd/bersoncarebot-webapp-prod.service" ]; then
  require_sudo_rule "systemd unit install webapp (bootstrap)" /usr/bin/install -m 0644 "${PROJECT_ROOT}/deploy/systemd/bersoncarebot-webapp-prod.service" /etc/systemd/system/bersoncarebot-webapp-prod.service
fi
if [ -f "${PROJECT_ROOT}/deploy/systemd/${MEDIA_WORKER_SERVICE}" ]; then
  require_sudo_rule "systemd unit install media-worker (bootstrap)" /usr/bin/install -m 0644 "${PROJECT_ROOT}/deploy/systemd/${MEDIA_WORKER_SERVICE}" "/etc/systemd/system/${MEDIA_WORKER_SERVICE}"
fi
require_sudo_rule "systemd daemon-reload (bootstrap)" /bin/systemctl daemon-reload
bash deploy/host/bootstrap-systemd-prod.sh

require_file "${ENV_FILE}" "Production environment file"
require_file "${WEBAPP_ENV_FILE}" "Production webapp environment file"
require_file "${BACKUP_SCRIPT}" "Backup script"
require_unit_file "${API_SERVICE}"
require_unit_file "${WORKER_SERVICE}"
require_unit_file "${WEBAPP_SERVICE}"

require_sudo_rule "backup script" "${BACKUP_SCRIPT}" pre-migrations
require_sudo_rule "API restart" /bin/systemctl restart "${API_SERVICE}"
require_sudo_rule "worker restart" /bin/systemctl restart "${WORKER_SERVICE}"
require_sudo_rule "API status check" /bin/systemctl is-active --quiet "${API_SERVICE}"
require_sudo_rule "worker status check" /bin/systemctl is-active --quiet "${WORKER_SERVICE}"

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

sudo -n /bin/systemctl restart "${API_SERVICE}"
sudo -n /bin/systemctl restart "${WORKER_SERVICE}"

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

if [ -e "/etc/systemd/system/${MEDIA_WORKER_SERVICE}" ] && [ -f "${WEBAPP_ENV_FILE}" ]; then
  sudo -n /bin/systemctl restart "${MEDIA_WORKER_SERVICE}"
  if ! sudo -n /bin/systemctl is-active --quiet "${MEDIA_WORKER_SERVICE}"; then
    echo "deploy-prod: ${MEDIA_WORKER_SERVICE} is not active. Last journal lines:" >&2
    sudo -n journalctl -u "${MEDIA_WORKER_SERVICE}" -n 40 --no-pager 2>/dev/null || true
    fail "${MEDIA_WORKER_SERVICE} failed to start (ensure webapp.prod has DATABASE_URL, S3_*, FFMPEG_PATH; apps/media-worker built)."
  fi
fi

sleep 3

if ! sudo -n /bin/systemctl is-active --quiet "${API_SERVICE}"; then
  echo "deploy-prod: ${API_SERVICE} is not active. Last journal lines:" >&2
  sudo -n journalctl -u "${API_SERVICE}" -n 40 --no-pager 2>/dev/null || true
  echo "deploy-prod: Ensure api.prod has PORT=3200, TELEGRAM_BOT_TOKEN, RUBITIME_*, SMSC_*, and values with \$ in single quotes." >&2
  exit 1
fi
if ! sudo -n /bin/systemctl is-active --quiet "${WORKER_SERVICE}"; then
  echo "deploy-prod: ${WORKER_SERVICE} is not active. Last journal lines:" >&2
  sudo -n journalctl -u "${WORKER_SERVICE}" -n 40 --no-pager 2>/dev/null || true
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