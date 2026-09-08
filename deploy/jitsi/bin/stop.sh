#!/usr/bin/env bash
# Stops the compose project using the *same complete compose context* install.sh/restart.sh use (both
# compose files + the env file) — not bare `docker compose -p bcb-jitsi-test down`, which has no compose
# file to read and cannot resolve the project definition it would need to tear down cleanly (see
# docs/audit/jitsi-coturn-test-package-2026-09-08.md finding F4; this is what
# deploy/systemd/bersoncarebot-jitsi-test.service's ExecStop calls).
#
# This only stops/removes containers and the default (bridge) network for this project — it does not
# remove volumes, the secret store, rendered config, or the vendored release. That is bin/rollback.sh's
# job, invoked deliberately by an operator, not something a routine `systemctl stop`/`restart` should do.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$HERE"

ENV_FILE="${JITSI_TEST_ENV_FILE:-/opt/env/bersoncarebot/jitsi.test}"
if [[ ! -f "$ENV_FILE" ]]; then
  # Nothing was ever applied (no env file yet) — there is nothing this project could have started.
  echo "[jitsi-test] $ENV_FILE not present, nothing to stop"
  exit 0
fi
# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a
TURN_ENV_FILE="${TURN_TEST_ENV_FILE:-/opt/env/bersoncarebot/jitsi-coturn.test}"
[[ -f "$TURN_ENV_FILE" ]] || { echo "[jitsi-test] FATAL: missing $TURN_ENV_FILE" >&2; exit 1; }
# shellcheck disable=SC1090
set -a; source "$TURN_ENV_FILE"; set +a
VENDOR_DIR="$HERE/vendor/docker-jitsi-meet-${JITSI_RELEASE_TAG:-unknown}"

if [[ -d "$VENDOR_DIR" ]]; then
  docker compose \
    -f "$VENDOR_DIR/docker-compose.yml" \
    -f "$HERE/docker-compose.override.test.yml" \
    --env-file "$ENV_FILE" \
    --project-directory "$HERE" \
    -p bcb-jitsi-test down
else
  # Vendor dir gone but containers might still exist under the project name — remove by project label only.
  docker compose -p bcb-jitsi-test down 2>/dev/null || true
fi
echo "[jitsi-test] stopped"
