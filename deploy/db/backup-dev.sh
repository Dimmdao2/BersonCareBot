#!/bin/bash
set -euo pipefail
mkdir -p /opt/backups/postgres/bersoncarebot
pg_dump -h 127.0.0.1 -U bersoncarebot_dev_user bersoncarebot_dev \
  > /opt/backups/postgres/bersoncarebot/dev_$(date +%F_%H-%M).sql
