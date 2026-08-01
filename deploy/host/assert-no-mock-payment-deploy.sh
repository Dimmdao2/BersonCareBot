#!/bin/bash
# B0.2 (#1057): refuse deployment artifacts that retain any mock-payment surface.
# Usage: assert-no-mock-payment-deploy.sh <repo_root>
set -euo pipefail

[ "$#" -eq 1 ] || {
  echo "usage: assert-no-mock-payment-deploy.sh <repo_root>" >&2
  exit 2
}

REPO_ROOT="$1"

fail() {
  echo "assert-no-mock-payment-deploy: REFUSED — $*" >&2
  exit 1
}

[ -d "$REPO_ROOT" ] || fail "repo root not found: $REPO_ROOT"

mapfile -t MOCK_ROUTES < <(find "$REPO_ROOT" -type f -path '*/payments/mock-complete/route.ts' | sort)
if [ "${#MOCK_ROUTES[@]}" -ne 0 ]; then
  fail "found ${#MOCK_ROUTES[@]} */payments/mock-complete/route.ts file(s): ${MOCK_ROUTES[*]}"
fi

POLICY_FILE="$REPO_ROOT/apps/webapp/src/modules/payments/mockPaymentGatePolicy.ts"
[ ! -e "$POLICY_FILE" ] || fail "found isMockPaymentConfirmEnabled policy: $POLICY_FILE"

echo "assert-no-mock-payment-deploy: PASS — no mock-complete routes or mockPaymentGatePolicy.ts"
