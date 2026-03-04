#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/tgcarebot/app"
STATE_DIR="/opt/tgcarebot/deploy"
SLOT_FILE="${STATE_DIR}/current_slot"
NGINX_SITE="/etc/nginx/sites-available/tgcarebot.conf"

cd "${APP_DIR}"

ACTIVE_SLOT="blue"
if [[ -f "${SLOT_FILE}" ]]; then
  ACTIVE_SLOT="$(cat "${SLOT_FILE}")"
fi

if [[ "${ACTIVE_SLOT}" == "blue" ]]; then
  TARGET_SLOT="green"
  TARGET_PORT="3002"
else
  TARGET_SLOT="blue"
  TARGET_PORT="3001"
fi

docker compose up -d "api_${TARGET_SLOT}"

for i in {1..20}; do
  if curl -fsS "http://127.0.0.1:${TARGET_PORT}/health" >/dev/null; then
    break
  fi
  sleep 2
done

curl -fsS "http://127.0.0.1:${TARGET_PORT}/health" >/dev/null

sudo -n sed -E -i \
  "s#proxy_pass http://127\\.0\\.0\\.1:(3000|3001|3002);#proxy_pass http://127.0.0.1:${TARGET_PORT};#g" \
  "${NGINX_SITE}"

sudo -n nginx -t
sudo -n systemctl reload nginx

mkdir -p "${STATE_DIR}"
echo "${TARGET_SLOT}" > "${SLOT_FILE}"
echo "Rollback complete. Active slot: ${TARGET_SLOT}"
