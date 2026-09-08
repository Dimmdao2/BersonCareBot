#!/usr/bin/env bash
# Restart the stack in place: re-render config (in case a secret rotated) and recreate containers without
# re-fetching the upstream release. Idempotent, TEST-only.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$HERE"

on_dev_test_host=0
for address in $(hostname -I 2>/dev/null || true); do
  [[ "$address" == 151.241.228.122 ]] && on_dev_test_host=1
done
[[ "$on_dev_test_host" == 1 ]] || { echo "FATAL: not on 151.241.228.122" >&2; exit 1; }

ENV_FILE="${JITSI_TEST_ENV_FILE:-/opt/env/bersoncarebot/jitsi.test}"
[[ -f "$ENV_FILE" ]] || { echo "FATAL: missing $ENV_FILE" >&2; exit 1; }
unset TURN_USERNAME TURN_PASSWORD
# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a
TURN_ENV_FILE="${TURN_TEST_ENV_FILE:-/opt/env/bersoncarebot/jitsi-coturn.test}"
[[ -f "$TURN_ENV_FILE" ]] || { echo "FATAL: missing $TURN_ENV_FILE" >&2; exit 1; }
# shellcheck disable=SC1090
set -a; source "$TURN_ENV_FILE"; set +a
VENDOR_DIR="$HERE/vendor/docker-jitsi-meet-${JITSI_RELEASE_TAG}"
[[ -d "$VENDOR_DIR" ]] || { echo "FATAL: $VENDOR_DIR missing — run bin/install.sh --apply first" >&2; exit 1; }

bash "$HERE/bin/render-secrets.sh"
# The renderer atomically rewrote TURN_CREDENTIALS and internal XMPP passwords. Re-source the private env
# before Compose so process-environment placeholders cannot override the just-rendered values.
set -a; source "$ENV_FILE"; set +a
unset TURN_USERNAME TURN_PASSWORD

COMPOSE_ARGS=(
  -f "$VENDOR_DIR/docker-compose.yml"
  -f "$HERE/docker-compose.override.test.yml"
  --env-file "$ENV_FILE"
  # See install.sh's identical flag: without it, the override's relative bind-mount sources resolve
  # against $VENDOR_DIR (the first -f file's directory), not deploy/jitsi/.
  --project-directory "$HERE"
  -p bcb-jitsi-test
)

docker compose "${COMPOSE_ARGS[@]}" config >/dev/null || {
  echo "FATAL: docker compose config failed against the merged upstream+override tree — nothing was recreated" >&2
  exit 1
}

docker compose "${COMPOSE_ARGS[@]}" up -d --force-recreate
bash "$HERE/bin/reconcile-xmpp-service-credentials.sh"

echo "[jitsi-test] restarted; run bin/health-check.sh to confirm"
