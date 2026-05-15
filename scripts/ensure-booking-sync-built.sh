#!/usr/bin/env bash
# Build @bersoncare/booking-rubitime-sync when dist/ is missing (fresh clone, isolated CI job).
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ODS="$ROOT/packages/operator-db-schema"
if [[ ! -f "$ODS/dist/index.js" ]]; then
  pnpm --dir "$ODS" run build
fi
PKG="$ROOT/packages/booking-rubitime-sync"
if [[ ! -f "$PKG/dist/index.js" ]]; then
  pnpm --dir "$PKG" run build
fi
PM="$ROOT/packages/platform-merge"
# Stale dist without newer exports or merge internals breaks webapp tests / integrator at runtime.
if [[ ! -f "$PM/dist/index.js" ]] ||
  [[ ! -f "$PM/dist/mergeFailureClassification.js" ]] ||
  [[ ! -f "$PM/dist/pgPlatformUserMerge.js" ]] ||
  ! grep -q classifyMergeFailure "$PM/dist/index.js" 2>/dev/null ||
  ! grep -q dedupeSingletonSymptomTrackingsForMerge "$PM/dist/pgPlatformUserMerge.js" 2>/dev/null; then
  pnpm --dir "$PM" run build
fi
