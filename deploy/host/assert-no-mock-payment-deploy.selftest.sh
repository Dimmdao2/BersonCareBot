#!/bin/bash
# B0.2 (#1057) self-test: proves assert-no-mock-payment-deploy.sh actually refuses a bad artifact
# and actually passes a good one — a gate whose refusal is never demonstrated is indistinguishable
# from a gate that silently no-ops. Run manually: bash deploy/host/assert-no-mock-payment-deploy.selftest.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
GATE="$SCRIPT_DIR/assert-no-mock-payment-deploy.sh"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Build a minimal fixture tree containing only what the gate reads: the mock-complete routes plus
# the predicate/schema source it cross-checks itself against.
mkdir -p "$TMP/apps/webapp/src/modules/payments" "$TMP/apps/webapp/src/config"
cp "$REPO_ROOT/apps/webapp/src/modules/payments/mockPaymentGatePolicy.ts" "$TMP/apps/webapp/src/modules/payments/"
cp "$REPO_ROOT/apps/webapp/src/config/env.ts" "$TMP/apps/webapp/src/config/"
while IFS= read -r route; do
  rel="${route#"$REPO_ROOT"/}"
  mkdir -p "$TMP/$(dirname "$rel")"
  cp "$route" "$TMP/$rel"
done < <(find "$REPO_ROOT/apps/webapp/src/app/api" -type f -path '*/payments/mock-complete/route.ts')

pass=0
fail=0

expect_refused() {
  local label="$1"; shift
  if out="$("$@" 2>&1)"; then
    echo "SELFTEST FAILED (expected refusal, gate exited 0): $label"
    echo "$out"
    fail=$((fail + 1))
  else
    echo "OK — gate refused as expected: $label"
    echo "$out" | sed 's/^/    /'
    pass=$((pass + 1))
  fi
}

expect_passed() {
  local label="$1"; shift
  if out="$("$@" 2>&1)"; then
    echo "OK — gate passed as expected: $label"
    echo "$out" | sed 's/^/    /'
    pass=$((pass + 1))
  else
    echo "SELFTEST FAILED (expected pass, gate exited nonzero): $label"
    echo "$out"
    fail=$((fail + 1))
  fi
}

echo "=== 1. baseline: unmodified fixture, NODE_ENV=production -> must PASS ==="
expect_passed "clean artifact + production env" "$GATE" "$TMP" production ""

echo
echo "=== 2. break it: target env NODE_ENV=development -> must REFUSE ==="
expect_refused "NODE_ENV=development on target" "$GATE" "$TMP" development ""

echo
echo "=== 3. break it: target env has no NODE_ENV line at all (the B0.1 danger: schema defaults it to"
echo "    'development') -> caller resolves the same \${NODE_ENV:-development} default the app itself"
echo "    uses, so this reaches the gate as NODE_ENV=development, same as case 2 -> must REFUSE ==="
UNSET_ENV_FILE="$TMP/webapp.env-with-no-node-env"
: > "$UNSET_ENV_FILE"
resolved_node_env="$(bash -c "set -a && . '$UNSET_ENV_FILE' && set +a && printf '%s' \"\${NODE_ENV:-development}\"")"
expect_refused "env file with no NODE_ENV line, caller-resolved to '$resolved_node_env'" "$GATE" "$TMP" "$resolved_node_env" ""

echo
echo "=== 4. break it: target env NODE_ENV=production but VITEST_WORKER_ID set -> must REFUSE ==="
expect_refused "VITEST_WORKER_ID set on target" "$GATE" "$TMP" production "3"

echo
echo "=== 5. revert env break, confirm PASS again ==="
expect_passed "clean artifact + production env (after env break reverted)" "$GATE" "$TMP" production ""

echo
echo "=== 6. break it: strip the guard from one mock-complete route -> must REFUSE ==="
victim="$(find "$TMP/apps/webapp/src/app/api" -type f -path '*/payments/mock-complete/route.ts' | sort | head -1)"
cp "$victim" "$victim.bak"
# Delete the guard line and the isMockPaymentConfirmEnabled import — simulates the check being
# edited out of a route, e.g. during a refactor that didn't notice it was load-bearing.
grep -v 'isMockPaymentConfirmEnabled\|mockPaymentGatePolicy' "$victim.bak" > "$victim"
expect_refused "route with guard stripped: $victim" "$GATE" "$TMP" production ""

echo
echo "=== 7. restore the route, confirm PASS again ==="
mv "$victim.bak" "$victim"
expect_passed "clean artifact restored + production env" "$GATE" "$TMP" production ""

echo
echo "=== 8. break it: predicate source drifts from this gate's bash mirror -> must REFUSE (fail-closed on drift) ==="
policy="$TMP/apps/webapp/src/modules/payments/mockPaymentGatePolicy.ts"
cp "$policy" "$policy.bak"
sed -i "s/nodeEnv === 'development' || input.isTestEnv/nodeEnv !== 'production'/" "$policy"
expect_refused "predicate body edited without updating the gate mirror" "$GATE" "$TMP" production ""
mv "$policy.bak" "$policy"

echo
echo "=== summary: $pass passed, $fail failed ==="
[ "$fail" -eq 0 ]
