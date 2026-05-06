#!/usr/bin/env bash
# Production / host: load canonical env files, then run root `pnpm migrate`
# (integrator + webapp Drizzle). Paths match docs/ARCHITECTURE/SERVER CONVENTIONS.md.
#
# Usage (from repo root on host, as deploy):
#   pnpm migrate:prod:host
#
# Override file locations if needed:
#   API_ENV_FILE=/path/to/api.prod WEBAPP_ENV_FILE=/path/to/webapp.prod pnpm migrate:prod:host

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

API_ENV_FILE="${API_ENV_FILE:-/opt/env/bersoncarebot/api.prod}"
WEBAPP_ENV_FILE="${WEBAPP_ENV_FILE:-/opt/env/bersoncarebot/webapp.prod}"

for f in "$API_ENV_FILE" "$WEBAPP_ENV_FILE"; do
  if [[ ! -f "$f" ]]; then
    echo "migrate-prod-host: env file not found: $f" >&2
    exit 1
  fi
done

set -a
# shellcheck disable=SC1090
source "$API_ENV_FILE"
# shellcheck disable=SC1090
source "$WEBAPP_ENV_FILE"
set +a

exec pnpm migrate
