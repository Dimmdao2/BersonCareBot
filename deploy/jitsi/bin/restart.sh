#!/usr/bin/env bash
# Restart the stack in place: re-render config (in case a secret rotated) and recreate containers without
# re-fetching the upstream release. Idempotent, and bound to the profile resolved by bin/lib/profile.sh.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$HERE"
# shellcheck source=lib/profile.sh
source "$HERE/bin/lib/profile.sh"

jitsi_require_host

ENV_FILE="$JITSI_ENV_FILE"
[[ -f "$ENV_FILE" ]] || { echo "FATAL: missing $ENV_FILE" >&2; exit 1; }
unset TURN_USERNAME TURN_PASSWORD
# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a
[[ "${JITSI_DEPLOYMENT:-}" == "$JITSI_PROFILE_RESOLVED" ]] \
  || { echo "FATAL: $ENV_FILE declares JITSI_DEPLOYMENT='${JITSI_DEPLOYMENT:-<unset>}', this run resolved '$JITSI_PROFILE_RESOLVED'" >&2; exit 1; }
TURN_ENV_FILE="$JITSI_TURN_ENV_FILE"
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
  -p "$JITSI_COMPOSE_PROJECT"
)

docker compose "${COMPOSE_ARGS[@]}" config >/dev/null || {
  echo "FATAL: docker compose config failed against the merged upstream+override tree — nothing was recreated" >&2
  exit 1
}

docker compose "${COMPOSE_ARGS[@]}" up -d --force-recreate
bash "$HERE/bin/reconcile-xmpp-service-credentials.sh"

echo "$JITSI_LOG_TAG restarted; run bin/health-check.sh to confirm"
