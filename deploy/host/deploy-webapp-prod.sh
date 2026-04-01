#!/bin/bash
set -euo pipefail

PROJECT_ROOT=/opt/projects/bersoncarebot
ENV_FILE=/opt/env/bersoncarebot/webapp.prod
BACKUP_SCRIPT=/opt/backups/scripts/postgres-backup.sh
WEBAPP_SERVICE=bersoncarebot-webapp-prod.service
WEBAPP_PORT=6200

fail() {
  echo "deploy-webapp-prod: $*" >&2
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
    fail "Missing systemd unit ${unit}. Run deploy/host/bootstrap-systemd-webapp-prod.sh on the host first."
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
git checkout -- apps/webapp/next-env.d.ts 2>/dev/null || true
git pull origin main

if [ -z "${DEPLOY_WEBAPP_PROD_RERUN:-}" ]; then
  export DEPLOY_WEBAPP_PROD_RERUN=1
  exec bash deploy/host/deploy-webapp-prod.sh
fi

# Reinstall webapp unit from repo so paths match current layout (apps/webapp).
# Requires deploy user to have NOPASSWD for install and systemctl daemon-reload (see HOST_DEPLOY_README).
require_sudo_rule "systemd unit install (bootstrap)" /usr/bin/install -m 0644 "${PROJECT_ROOT}/deploy/systemd/bersoncarebot-webapp-prod.service" /etc/systemd/system/bersoncarebot-webapp-prod.service
require_sudo_rule "systemd daemon-reload (bootstrap)" /bin/systemctl daemon-reload
bash deploy/host/bootstrap-systemd-webapp-prod.sh

require_file "${ENV_FILE}" "Production webapp environment file"
require_unit_file "${WEBAPP_SERVICE}"
require_file "${BACKUP_SCRIPT}" "Backup script (for pre-migration backup)"
require_sudo_rule "backup script" "${BACKUP_SCRIPT}" pre-migrations
require_sudo_rule "webapp restart" /bin/systemctl restart "${WEBAPP_SERVICE}"
require_sudo_rule "webapp status check" /bin/systemctl is-active --quiet "${WEBAPP_SERVICE}"

export CI=true
pnpm install --frozen-lockfile
pnpm --dir apps/webapp build

# Copy static assets into the standalone output so standalone server.js can serve them.
# Required because Next.js does not copy .next/static/ and public/ into standalone automatically.
STANDALONE_DIR=apps/webapp/.next/standalone/apps/webapp
mkdir -p "${STANDALONE_DIR}/.next"
# Replace, do not nest: if destination exists, `cp -r static dest/` copies into dest/static/ (broken second deploy).
rm -rf "${STANDALONE_DIR}/.next/static" "${STANDALONE_DIR}/public"
cp -r apps/webapp/.next/static "${STANDALONE_DIR}/.next/static"
cp -r apps/webapp/public "${STANDALONE_DIR}/public"

STANDALONE_CHUNKS="${STANDALONE_DIR}/.next/static/chunks"
chunk_js_count=$(find "${STANDALONE_CHUNKS}" -maxdepth 1 -type f -name "*.js" 2>/dev/null | wc -l | tr -d " ")
if [ "${chunk_js_count}" -lt 1 ]; then
  fail "Standalone has no JS under ${STANDALONE_CHUNKS} after copy. Run full webapp build first; paths must match apps/webapp/.next/standalone/apps/webapp"
fi

# Run webapp DB migrations (DATABASE_URL from webapp.prod)
set -a
source "${ENV_FILE}"
set +a

# Backup webapp DB before migrations (same contract as deploy-prod: pre-migrations → /opt/backups/postgres/pre-migrations/)
sudo -n "${BACKUP_SCRIPT}" pre-migrations

pnpm --dir apps/webapp run migrate

sudo -n /bin/systemctl restart "${WEBAPP_SERVICE}"
sleep 3
sudo -n /bin/systemctl is-active --quiet "${WEBAPP_SERVICE}"

for i in 1 2 3 4 5; do
  if curl -sf "http://127.0.0.1:${WEBAPP_PORT}/api/health" -o /tmp/bersoncare-webapp-health.json; then
    break
  fi
  if [ "$i" -eq 5 ]; then
    echo "Webapp health check failed after 5 attempts (port ${WEBAPP_PORT})"
    exit 1
  fi
  sleep 2
done

grep -q '"ok":true' /tmp/bersoncare-webapp-health.json
