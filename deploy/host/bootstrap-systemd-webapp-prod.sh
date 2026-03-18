#!/bin/bash
set -euo pipefail

PROJECT_ROOT=/opt/projects/bersoncarebot
SYSTEMD_DIR=/etc/systemd/system
WEBAPP_SERVICE=bersoncarebot-webapp-prod.service
WEBAPP_UNIT_SOURCE="${PROJECT_ROOT}/deploy/systemd/${WEBAPP_SERVICE}"

fail() {
  echo "bootstrap-systemd-webapp-prod: $*" >&2
  exit 1
}

run_as_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  else
    sudo -n "$@"
  fi
}

if [ ! -f "${WEBAPP_UNIT_SOURCE}" ]; then
  fail "Webapp unit template not found: ${WEBAPP_UNIT_SOURCE}"
fi

run_as_root install -m 0644 "${WEBAPP_UNIT_SOURCE}" "${SYSTEMD_DIR}/${WEBAPP_SERVICE}"
run_as_root /bin/systemctl daemon-reload

if [ -f /opt/env/bersoncarebot/webapp.prod ] && [ -d "${PROJECT_ROOT}/apps/webapp/.next" ]; then
  run_as_root /bin/systemctl enable --now "${WEBAPP_SERVICE}"
else
  run_as_root /bin/systemctl enable "${WEBAPP_SERVICE}"
  echo "Webapp unit installed and enabled, but not started because /opt/env/bersoncarebot/webapp.prod or build artifacts are missing."
fi
