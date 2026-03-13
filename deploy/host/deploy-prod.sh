#!/bin/bash
set -euo pipefail

PROJECT_ROOT=/opt/projects/bersoncarebot
ENV_FILE=/opt/env/bersoncarebot.prod
WEBAPP_ENV_FILE=/opt/env/bersoncarebot-webapp.prod
BACKUP_SCRIPT=/opt/backups/scripts/postgres-backup.sh
API_SERVICE=bersoncarebot-api-prod.service
WORKER_SERVICE=bersoncarebot-worker-prod.service
WEBAPP_SERVICE=bersoncarebot-webapp-prod.service

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
git pull origin main

# Re-exec self so we run the updated script (current process was started before pull).
if [ -z "${DEPLOY_PROD_RERUN:-}" ]; then
  export DEPLOY_PROD_RERUN=1
  exec bash deploy/host/deploy-prod.sh
fi

require_file "${ENV_FILE}" "Production environment file"
require_file "${BACKUP_SCRIPT}" "Backup script"
require_unit_file "${API_SERVICE}"
require_unit_file "${WORKER_SERVICE}"

require_sudo_rule "backup script" "${BACKUP_SCRIPT}" pre-migrations
require_sudo_rule "API restart" /bin/systemctl restart "${API_SERVICE}"
require_sudo_rule "worker restart" /bin/systemctl restart "${WORKER_SERVICE}"
require_sudo_rule "API status check" /bin/systemctl is-active --quiet "${API_SERVICE}"
require_sudo_rule "worker status check" /bin/systemctl is-active --quiet "${WORKER_SERVICE}"

pnpm install --frozen-lockfile
pnpm build
pnpm build:webapp

set -a
source "${ENV_FILE}"
set +a

# Backup before migrations: write to pre-migrations folder (run as root).
# Script must support first arg "pre-migrations" and write to /opt/backups/postgres/pre-migrations/
sudo -n "${BACKUP_SCRIPT}" pre-migrations

node dist/infra/db/migrate.js

sudo -n /bin/systemctl restart "${API_SERVICE}"
sudo -n /bin/systemctl restart "${WORKER_SERVICE}"

if [ -e "/etc/systemd/system/${WEBAPP_SERVICE}" ] && [ -f "${WEBAPP_ENV_FILE}" ]; then
  sudo -n /bin/systemctl restart "${WEBAPP_SERVICE}"
fi

sleep 3

sudo -n /bin/systemctl is-active --quiet "${API_SERVICE}"
sudo -n /bin/systemctl is-active --quiet "${WORKER_SERVICE}"

# Health check: use PORT from env (same as API). Production must have PORT=3200 in /opt/env/bersoncarebot.prod. Retry for slow startup.
API_PORT="${PORT:-3200}"
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