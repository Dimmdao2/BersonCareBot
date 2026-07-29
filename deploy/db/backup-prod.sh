#!/bin/bash
# Legacy one-DB helper (старые имена БД). Для production с двумя БД используйте:
#   deploy/postgres/postgres-backup.sh → установка в /opt/backups/scripts/postgres-backup.sh
# См. deploy/postgres/README.md
set -euo pipefail

fail() {
  echo "backup-prod: $*" >&2
  exit 1
}

assert_canonical_prod_host() {
  local current_hostname address found_ip=0
  current_hostname="$(hostname -s 2>/dev/null || true)"
  [ "$current_hostname" = "adelaide" ] ||
    fail "refusing legacy PROD backup on host '${current_hostname:-unknown}'; expected adelaide"
  for address in $(hostname -I 2>/dev/null || true); do
    if [ "$address" = "135.106.162.170" ]; then
      found_ip=1
      break
    fi
  done
  [ "$found_ip" -eq 1 ] ||
    fail "refusing legacy PROD backup without local IPv4 135.106.162.170"
}

assert_canonical_prod_host

mkdir -p /opt/backups/postgres/bersoncarebot
pg_dump -h 127.0.0.1 -U bersoncarebot_user bersoncarebot_prod \
  > /opt/backups/postgres/bersoncarebot/prod_$(date +%F_%H-%M).sql
