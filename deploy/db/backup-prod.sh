#!/bin/bash
# Legacy one-DB helper (старые имена БД). Для production с двумя БД используйте:
#   deploy/postgres/postgres-backup.sh → установка в /opt/backups/scripts/postgres-backup.sh
# См. deploy/postgres/README.md
set -euo pipefail
mkdir -p /opt/backups/postgres/bersoncarebot
pg_dump -h 127.0.0.1 -U bersoncarebot_user bersoncarebot_prod \
  > /opt/backups/postgres/bersoncarebot/prod_$(date +%F_%H-%M).sql
