#!/bin/bash
set -euo pipefail
mkdir -p /opt/backups/postgres/bersoncarebot
pg_dump -h 127.0.0.1 -U bersoncarebot_user bersoncarebot_prod \
  > /opt/backups/postgres/bersoncarebot/prod_$(date +%F_%H-%M).sql
