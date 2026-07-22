#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT=/opt/projects/bersoncarebot-test
TEST_ENV_FILE=/opt/env/bersoncarebot/webapp.test

fail(){
  echo "FATAL: protected TEST smoke fixture update failed: $1" >&2
  exit 1
}

[ "$(id -u)" -eq 0 ] || fail "root operator session is required"
[ "$(realpath -e -- "$PROJECT_ROOT")" = "$PROJECT_ROOT" ] || fail "canonical TEST checkout is missing"
[ -f "$TEST_ENV_FILE" ] && [ ! -L "$TEST_ENV_FILE" ] || fail "canonical webapp.test env is missing or symlinked"

export BCB_OPERATOR_TEST_ENV_FILE="$TEST_ENV_FILE"
exec pnpm --dir "$PROJECT_ROOT/apps/webapp" exec tsx \
  scripts/update-saas-product-smoke-fixture-canonical-slots.ts \
  --project-root="$PROJECT_ROOT"
