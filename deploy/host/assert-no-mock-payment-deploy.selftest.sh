#!/bin/bash
# B0.2 (#1057) self-test: the gate passes an empty artifact and refuses each mock surface.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GATE="$SCRIPT_DIR/assert-no-mock-payment-deploy.sh"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

pass=0
fail=0

expect_passed() {
  local label="$1"; shift
  if out="$("$@" 2>&1)"; then
    echo "OK — $label"
    pass=$((pass + 1))
  else
    echo "SELFTEST FAILED (expected PASS): $label"
    echo "$out"
    fail=$((fail + 1))
  fi
}

expect_refused() {
  local label="$1"; shift
  if out="$("$@" 2>&1)"; then
    echo "SELFTEST FAILED (expected REFUSED): $label"
    echo "$out"
    fail=$((fail + 1))
  else
    echo "OK — $label"
    pass=$((pass + 1))
  fi
}

expect_passed "empty surface passes" bash "$GATE" "$TMP"

route="$TMP/apps/webapp/src/app/api/booking/payments/mock-complete/route.ts"
mkdir -p "$(dirname "$route")"
touch "$route"
expect_refused "mock-complete route refuses" bash "$GATE" "$TMP"
rm "$route"

policy="$TMP/apps/webapp/src/modules/payments/mockPaymentGatePolicy.ts"
mkdir -p "$(dirname "$policy")"
touch "$policy"
expect_refused "mock payment predicate refuses" bash "$GATE" "$TMP"

echo "=== summary: $pass/3 passed, $fail failed ==="
[ "$pass" -eq 3 ] && [ "$fail" -eq 0 ]
