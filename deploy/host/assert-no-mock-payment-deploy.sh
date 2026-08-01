#!/bin/bash
# B0.2 (#1057, owner ruling 01.08 "моки надо запретить деплоить — вот и все"): refuses a deploy
# outright if it would make any */payments/mock-complete route reachable. Routes and the predicate
# are NOT removed — they stay a dev/test tool (H-4, #818) — this only blocks the artifact from
# leaving with the mock path live.
#
# Two independent checks; either one failing stops the deploy:
#   1. structural — every mock-complete route file in the checked-out source still guards itself
#      with isMockPaymentConfirmEnabled as the FIRST thing the handler does (catches the guard being
#      edited out, or a new mock-complete route added without it).
#   2. environment — mirrors mockPaymentGatePolicy.ts's predicate and config/env.ts's NODE_ENV
#      default against the resolved NODE_ENV/VITEST_WORKER_ID of the environment the target unit
#      will actually load. B0.1 flagged that the env schema defaults NODE_ENV to 'development' when
#      unset — an env file that forgets to set NODE_ENV would otherwise silently enable the mock on
#      a deployed host.
#
# The caller resolves NODE_ENV/VITEST_WORKER_ID from the real env file itself (permission/sudo model
# differs between the TEST and PROD callers) and passes the resolved values here as plain arguments —
# this script does no env-file IO of its own.
#
# Usage: assert-no-mock-payment-deploy.sh <repo_root> <node_env> [vitest_worker_id]
set -euo pipefail

REPO_ROOT="${1:?usage: assert-no-mock-payment-deploy.sh <repo_root> <node_env> [vitest_worker_id]}"
TARGET_NODE_ENV="${2:?usage: assert-no-mock-payment-deploy.sh <repo_root> <node_env> [vitest_worker_id]}"
TARGET_VITEST_WORKER_ID="${3:-}"

fail() {
  echo "assert-no-mock-payment-deploy: REFUSED — $*" >&2
  exit 1
}

# --- 1. structural: every mock-complete route must still guard itself, first, with the predicate ---

API_DIR="${REPO_ROOT}/apps/webapp/src/app/api"
[ -d "$API_DIR" ] || fail "webapp API dir not found: $API_DIR"

mapfile -t MOCK_ROUTES < <(find "$API_DIR" -type f -path '*/payments/mock-complete/route.ts' | sort)
[ "${#MOCK_ROUTES[@]}" -ge 1 ] || fail "found zero */payments/mock-complete routes under $API_DIR — the route surface changed shape; update this gate before deploying"

for route in "${MOCK_ROUTES[@]}"; do
  grep -q "from '@/modules/payments/mockPaymentGatePolicy'" "$route" ||
    fail "mock route no longer imports mockPaymentGatePolicy, would deploy ungated: $route"

  guard_line="$(grep -n 'isMockPaymentConfirmEnabled(' "$route" | grep -v ':import ' | head -1 | cut -d: -f1)"
  [ -n "${guard_line:-}" ] || fail "mock route no longer calls isMockPaymentConfirmEnabled, would deploy ungated: $route"

  # the guard must run before any dependency/DB access, i.e. actually gate the whole handler
  first_dep_line="$(grep -n 'buildAppDeps(\|withExplicitOrganizationPrincipal(' "$route" | head -1 | cut -d: -f1)"
  if [ -n "${first_dep_line:-}" ] && [ "$guard_line" -gt "$first_dep_line" ]; then
    fail "mock route calls dependencies before the isMockPaymentConfirmEnabled guard, gate ordering broken: $route"
  fi
done

# --- 2. environment: mirror the predicate + NODE_ENV default; confirm the mirror is still accurate ---

POLICY_FILE="${REPO_ROOT}/apps/webapp/src/modules/payments/mockPaymentGatePolicy.ts"
ENV_SCHEMA_FILE="${REPO_ROOT}/apps/webapp/src/config/env.ts"
[ -f "$POLICY_FILE" ] || fail "predicate source not found, can't confirm this gate's bash mirror is still accurate: $POLICY_FILE"
[ -f "$ENV_SCHEMA_FILE" ] || fail "env schema source not found, can't confirm this gate's bash mirror is still accurate: $ENV_SCHEMA_FILE"

grep -q "nodeEnv === 'development' || input.isTestEnv" "$POLICY_FILE" ||
  fail "isMockPaymentConfirmEnabled body no longer matches this gate's bash mirror — update both together: $POLICY_FILE"
grep -q "NODE_ENV: z.enum(\['development', 'test', 'production'\]).default('development')" "$ENV_SCHEMA_FILE" ||
  fail "NODE_ENV schema/default no longer matches this gate's bash mirror — update both together: $ENV_SCHEMA_FILE"

is_test_env=0
[ "$TARGET_NODE_ENV" = "test" ] && is_test_env=1
[ -n "$TARGET_VITEST_WORKER_ID" ] && is_test_env=1

mock_enabled=0
[ "$TARGET_NODE_ENV" = "development" ] && mock_enabled=1
[ "$is_test_env" -eq 1 ] && mock_enabled=1

if [ "$mock_enabled" -eq 1 ]; then
  fail "isMockPaymentConfirmEnabled would return true for the target environment (NODE_ENV=${TARGET_NODE_ENV:-<unset>}, VITEST_WORKER_ID=${TARGET_VITEST_WORKER_ID:-<unset>}) — mock payment routes would be reachable; the deployed unit's env file must set NODE_ENV=production"
fi

echo "assert-no-mock-payment-deploy: OK — ${#MOCK_ROUTES[@]} mock-complete routes gated, target NODE_ENV=${TARGET_NODE_ENV} resolves isMockPaymentConfirmEnabled=false"
