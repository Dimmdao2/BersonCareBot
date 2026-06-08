#!/bin/bash
# Toggle deploy maintenance flag for nginx (see deploy/nginx/webapp-maintenance-pages.example.conf).
set -euo pipefail

DEPLOY_MAINTENANCE_FLAG=/var/lib/bersoncarebot/deploy-maintenance.on
ACTION="${1:-}"

case "${ACTION}" in
  on)
    sudo -n mkdir -p /var/lib/bersoncarebot
    sudo -n touch "${DEPLOY_MAINTENANCE_FLAG}"
    echo "deploy-maintenance: on (${DEPLOY_MAINTENANCE_FLAG})"
    ;;
  off)
    if sudo -n test -f "${DEPLOY_MAINTENANCE_FLAG}"; then
      sudo -n rm -f "${DEPLOY_MAINTENANCE_FLAG}"
      echo "deploy-maintenance: off"
    fi
    ;;
  *)
    echo "usage: $0 on|off" >&2
    exit 1
    ;;
esac
