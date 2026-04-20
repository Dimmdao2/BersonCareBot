#!/bin/bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${REPO_ROOT}"
export CI=true
export BUILD_ID="${BUILD_ID:-$(git rev-parse --short HEAD)-$(date +%s)}"
export NEXT_PUBLIC_BUILD_ID="${NEXT_PUBLIC_BUILD_ID:-${BUILD_ID}}"
pnpm install --frozen-lockfile
bash "${REPO_ROOT}/scripts/ensure-booking-sync-built.sh"
pnpm --dir apps/webapp build
bash deploy/host/sync-webapp-standalone-assets.sh
cat > apps/webapp/.next/standalone/apps/webapp/.runtime-build-id <<EOF
BUILD_ID=${BUILD_ID}
NEXT_PUBLIC_BUILD_ID=${NEXT_PUBLIC_BUILD_ID}
EOF
