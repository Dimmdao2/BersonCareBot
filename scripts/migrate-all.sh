#!/usr/bin/env bash
# Unified migrations entrypoint:
# - integrator SQL migrations
# - webapp Drizzle migrations
#
# On production host it auto-loads canonical env files when present:
#   /opt/env/bersoncarebot/api.prod
#   /opt/env/bersoncarebot/webapp.prod
#
# You can override paths:
#   API_ENV_FILE=/path/api.prod WEBAPP_ENV_FILE=/path/webapp.prod pnpm migrate

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}"

API_ENV_FILE="${API_ENV_FILE:-/opt/env/bersoncarebot/api.prod}"
WEBAPP_ENV_FILE="${WEBAPP_ENV_FILE:-/opt/env/bersoncarebot/webapp.prod}"

api_exists=0
webapp_exists=0
[[ -f "${API_ENV_FILE}" ]] && api_exists=1
[[ -f "${WEBAPP_ENV_FILE}" ]] && webapp_exists=1

if [[ "${api_exists}" -eq 1 || "${webapp_exists}" -eq 1 ]]; then
  if [[ "${api_exists}" -ne 1 || "${webapp_exists}" -ne 1 ]]; then
    echo "migrate-all: expected both env files or none. api=${API_ENV_FILE} webapp=${WEBAPP_ENV_FILE}" >&2
    exit 1
  fi
  set -a
  # shellcheck disable=SC1090
  source "${API_ENV_FILE}"
  # shellcheck disable=SC1090
  source "${WEBAPP_ENV_FILE}"
  set +a
fi

pnpm --dir apps/integrator run migrate
pnpm --dir apps/webapp run migrate
