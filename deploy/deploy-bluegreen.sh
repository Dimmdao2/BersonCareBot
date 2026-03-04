#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/tgcarebot/app"
ENV_FILE="/opt/tgcarebot/.env"
STATE_DIR="/opt/tgcarebot/deploy"
SLOT_FILE="${STATE_DIR}/current_slot"
NGINX_SITE="/etc/nginx/sites-available/tgcarebot.conf"

cd "${APP_DIR}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing ${ENV_FILE}"
  exit 1
fi

if ! command -v jq >/dev/null 2>&1 || ! command -v curl >/dev/null 2>&1; then
  sudo -n apt-get update
  sudo -n apt-get install -y jq curl
fi

cp "${ENV_FILE}" .env

export GIT_TERMINAL_PROMPT=0
git fetch --prune origin
git checkout -B main origin/main
git reset --hard origin/main

mkdir -p "${STATE_DIR}"
ACTIVE_SLOT="blue"
if [[ -f "${SLOT_FILE}" ]]; then
  ACTIVE_SLOT="$(cat "${SLOT_FILE}")"
fi

if [[ "${ACTIVE_SLOT}" == "blue" ]]; then
  CANDIDATE_SLOT="green"
  CANDIDATE_PORT="3002"
else
  CANDIDATE_SLOT="blue"
  CANDIDATE_PORT="3001"
fi

echo "Active slot: ${ACTIVE_SLOT}"
echo "Candidate slot: ${CANDIDATE_SLOT} on port ${CANDIDATE_PORT}"

docker compose build "api_${CANDIDATE_SLOT}" worker admin
docker compose up -d db worker admin "api_${CANDIDATE_SLOT}"

docker compose run --rm "api_${CANDIDATE_SLOT}" pnpm run db:migrate

for i in {1..20}; do
  if curl -fsS "http://127.0.0.1:${CANDIDATE_PORT}/health" >/dev/null; then
    break
  fi
  sleep 2
done

curl -fsS "http://127.0.0.1:${CANDIDATE_PORT}/health" >/dev/null

sudo -n sed -E -i \
  "s#proxy_pass http://127\\.0\\.0\\.1:(3000|3001|3002);#proxy_pass http://127.0.0.1:${CANDIDATE_PORT};#g" \
  "${NGINX_SITE}"

sudo -n nginx -t
sudo -n systemctl reload nginx

echo "${CANDIDATE_SLOT}" > "${SLOT_FILE}"

echo "Switched traffic to ${CANDIDATE_SLOT}"
docker compose ps
