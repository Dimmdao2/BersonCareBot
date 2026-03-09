#!/bin/bash
set -e
set -o pipefail

cd /opt/projects/bersoncarebot
git pull origin main

# Re-exec self so we run the updated script (current process was started before pull).
if [ -z "${DEPLOY_PROD_RERUN}" ]; then
  export DEPLOY_PROD_RERUN=1
  exec bash deploy/host/deploy-prod.sh
fi

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

# Health check: use PORT from .env.prod (same as API). Production must have PORT=3200 in .env.prod. Retry for slow startup.
API_PORT="${PORT:-3200}"
for i in 1 2 3 4 5; do
  if curl -sf "http://127.0.0.1:${API_PORT}/health" -o /tmp/bersoncarebot-health.json; then
    break
  fi
  if [ "$i" -eq 5 ]; then
    echo "Health check failed after 5 attempts (port ${API_PORT})"
    exit 1
  fi
  sleep 2
done

grep -q '"ok":true' /tmp/bersoncarebot-health.json
grep -q '"db":"up"' /tmp/bersoncarebot-health.json