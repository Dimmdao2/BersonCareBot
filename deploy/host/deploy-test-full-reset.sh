#!/usr/bin/env bash
# Explicit owner-gated entrypoint for the destructive TEST migration rehearsal.
# Ordinary TEST code deploys must use deploy-test.sh and cannot reach this path implicitly.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

case "${1:-}" in
  --help|-h)
    export BCB_TEST_FULL_RESET_ENTRYPOINT=deploy-test-full-reset-v1
    exec bash "$SCRIPT_DIR/deploy-test-saas.sh" "$@"
    ;;
esac

case " ${*:-} " in
  *" --confirm-full-reset "*) ;;
  *)
    echo "FATAL: destructive TEST reset requires --confirm-full-reset" >&2
    echo "For ordinary code deploys use: bash deploy/host/deploy-test.sh [branch]" >&2
    exit 2
    ;;
esac

echo "== [deploy-test-full-reset] same-checkout cutover snapshot preflight =="
(
  cd "$REPO_ROOT"
  pnpm run check:prod-to-target-cutover
)

export BCB_TEST_FULL_RESET_ENTRYPOINT=deploy-test-full-reset-v1
exec bash "$SCRIPT_DIR/deploy-test-saas.sh" "$@"
