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

sudo /bin/systemctl restart bersoncarebot-api-prod.service
sudo /bin/systemctl restart bersoncarebot-worker-prod.service

sleep 3

sudo /bin/systemctl is-active --quiet bersoncarebot-api-prod.service
sudo /bin/systemctl is-active --quiet bersoncarebot-worker-prod.service

curl -f http://127.0.0.1:3200/health | tee /tmp/bersoncarebot-health.json

grep -q '"ok":true' /tmp/bersoncarebot-health.json
grep -q '"db":"up"' /tmp/bersoncarebot-health.json