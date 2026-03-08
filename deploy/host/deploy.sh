#!/bin/bash
set -euo pipefail
pnpm install
pnpm build
node dist/infra/db/migrate.js
