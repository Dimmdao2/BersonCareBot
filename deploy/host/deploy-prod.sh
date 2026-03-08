#!/bin/bash
set -e
set -o pipefail

cd /opt/projects/bersoncarebot
git pull origin main
pnpm install --frozen-lockfile
pnpm build
node dist/infra/db/migrate.js
systemctl restart bersoncarebot-api-prod
systemctl restart bersoncarebot-worker-prod
curl -f http://127.0.0.1:3200/health
