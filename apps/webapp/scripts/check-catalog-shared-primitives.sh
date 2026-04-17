#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

TARGETS=(
  src/shared/ui/CatalogSplitLayout.tsx
  src/shared/ui/VirtualizedItemGrid.tsx
)

fail=0

if rg -n '@/app/app/doctor/exercises|/exercises/|lfk-exercises' "${TARGETS[@]}" >/dev/null 2>&1; then
  echo "check-catalog-shared-primitives: domain imports detected in shared primitives"
  rg -n '@/app/app/doctor/exercises|/exercises/|lfk-exercises' "${TARGETS[@]}" || true
  fail=1
fi

if rg -n '\bExercise(TileCard)?\b' "${TARGETS[@]}" >/dev/null 2>&1; then
  echo "check-catalog-shared-primitives: Exercise-specific symbols detected in shared primitives"
  rg -n '\bExercise(TileCard)?\b' "${TARGETS[@]}" || true
  fail=1
fi

if ! rg -n 'export function VirtualizedItemGrid<T>\(' src/shared/ui/VirtualizedItemGrid.tsx >/dev/null 2>&1; then
  echo "check-catalog-shared-primitives: VirtualizedItemGrid generic signature <T> is missing"
  fail=1
fi

exit "$fail"
