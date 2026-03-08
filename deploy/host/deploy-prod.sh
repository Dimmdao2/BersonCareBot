#!/bin/bash
set -e
set -o pipefail

cd /opt/projects/bersoncarebot

git pull origin main
pnpm install --frozen-lockfile
pnpm build

set -a
source /opt/projects/bersoncarebot/.env.prod
set +a

node dist/infra/db/migrate.js

sudo systemctl restart bersoncarebot-api-prod
sudo systemctl restart bersoncarebot-worker-prod

sleep 3

sudo systemctl is-active --quiet bersoncarebot-api-prod
sudo systemctl is-active --quiet bersoncarebot-worker-prod

curl -f http://127.0.0.1:3200/health | tee /tmp/bersoncarebot-health.json

grep -q '"ok":true' /tmp/bersoncarebot-health.json
grep -q '"db":"up"' /tmp/bersoncarebot-health.json

sudo systemctl --no-pager --full status bersoncarebot-api-prod
sudo systemctl --no-pager --full status bersoncarebot-worker-prod

sudo journalctl -u bersoncarebot-api-prod -n 50 --no-pager
sudo journalctl -u bersoncarebot-worker-prod -n 50 --no-pager