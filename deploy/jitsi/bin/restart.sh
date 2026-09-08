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
JITSI_RELEASE_TAG="$(grep -E '^JITSI_RELEASE_TAG=' "$ENV_FILE" | cut -d= -f2)"
VENDOR_DIR="$HERE/vendor/docker-jitsi-meet-${JITSI_RELEASE_TAG}"
[[ -d "$VENDOR_DIR" ]] || { echo "FATAL: $VENDOR_DIR missing — run bin/install.sh --apply first" >&2; exit 1; }

bash "$HERE/bin/render-secrets.sh"

docker compose \
  -f "$VENDOR_DIR/docker-compose.yml" \
  -f "$HERE/docker-compose.override.test.yml" \
  --env-file "$ENV_FILE" \
  -p bcb-jitsi-test up -d --force-recreate

echo "[jitsi-test] restarted; run bin/health-check.sh to confirm"
