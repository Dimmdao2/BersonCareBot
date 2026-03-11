#!/bin/bash
set -euo pipefail

PROJECT_ROOT=/opt/projects/bersoncarebot
SYSTEMD_DIR=/etc/systemd/system
API_SERVICE=bersoncarebot-api-prod.service
WORKER_SERVICE=bersoncarebot-worker-prod.service
API_UNIT_SOURCE="${PROJECT_ROOT}/deploy/systemd/${API_SERVICE}"
WORKER_UNIT_SOURCE="${PROJECT_ROOT}/deploy/systemd/${WORKER_SERVICE}"

fail() {
  echo "bootstrap-systemd-prod: $*" >&2
  exit 1
}

run_as_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  else
    sudo "$@"
  fi
}

require_file() {
  local path="$1"
  local description="$2"
  if [ ! -f "$path" ]; then
    fail "${description} not found: ${path}"
  fi
}

require_file "${API_UNIT_SOURCE}" "API unit template"
require_file "${WORKER_UNIT_SOURCE}" "Worker unit template"

run_as_root install -m 0644 "${API_UNIT_SOURCE}" "${SYSTEMD_DIR}/${API_SERVICE}"
run_as_root install -m 0644 "${WORKER_UNIT_SOURCE}" "${SYSTEMD_DIR}/${WORKER_SERVICE}"
run_as_root /bin/systemctl daemon-reload

if [ -f "${PROJECT_ROOT}/.env.prod" ] \
  && [ -f "${PROJECT_ROOT}/dist/main.js" ] \
  && [ -f "${PROJECT_ROOT}/dist/infra/runtime/worker/main.js" ]; then
  run_as_root /bin/systemctl enable --now "${API_SERVICE}"
  run_as_root /bin/systemctl enable --now "${WORKER_SERVICE}"
else
  run_as_root /bin/systemctl enable "${API_SERVICE}"
  run_as_root /bin/systemctl enable "${WORKER_SERVICE}"
  echo "Units installed and enabled, but not started because .env.prod or build artifacts are missing."
  echo "Run deploy/host/deploy-prod.sh after the first build to start the services."
fi
