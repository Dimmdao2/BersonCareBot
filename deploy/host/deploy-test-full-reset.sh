#!/usr/bin/env bash
# Explicit owner-gated entrypoint for the destructive TEST migration rehearsal.
# Ordinary TEST code deploys must use deploy-test.sh and cannot reach this path implicitly.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# The shared closure/full-reset engine this wrapper delegates to. Fail by name here instead of
# letting `exec` hit a missing file: a checkout that is missing this engine must say so, not print
# a bare "No such file or directory" for an unnamed target.
SHARED_RESET_ENGINE="$SCRIPT_DIR/deploy-test-saas.sh"
[ -e "$SHARED_RESET_ENGINE" ] || {
  echo "FATAL: deploy-test-full-reset requires $SHARED_RESET_ENGINE, which is not present in this checkout" >&2
  exit 3
}

case "${1:-}" in
  --help|-h)
    export BCB_TEST_FULL_RESET_ENTRYPOINT=deploy-test-full-reset-v1
    exec bash "$SHARED_RESET_ENGINE" "$@"
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
exec bash "$SHARED_RESET_ENGINE" "$@"
