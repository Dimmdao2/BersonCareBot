#!/bin/bash
set -euo pipefail

fail() {
  echo "legacy deploy: $*" >&2
  exit 1
}

assert_canonical_prod_host() {
  local current_hostname address
  current_hostname="$(hostname -s 2>/dev/null || true)"
  [ "$current_hostname" = "adelaide" ] ||
    fail "refusing PROD deploy on host '${current_hostname:-unknown}'; expected adelaide"
  for address in $(hostname -I 2>/dev/null || true); do
    [ "$address" = "135.106.162.170" ] && return 0
  done
  fail "refusing PROD deploy without local IPv4 135.106.162.170"
}

assert_canonical_prod_host

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${PROJECT_ROOT}"
pnpm install
pnpm build
pnpm --dir apps/integrator run db:migrate:prod
