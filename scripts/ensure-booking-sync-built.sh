#!/usr/bin/env bash
# Build @bersoncare/booking-rubitime-sync when dist/ is missing (fresh clone, isolated CI job).
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PKG="$ROOT/packages/booking-rubitime-sync"
if [[ ! -f "$PKG/dist/index.js" ]]; then
  pnpm --dir "$PKG" run build
fi
