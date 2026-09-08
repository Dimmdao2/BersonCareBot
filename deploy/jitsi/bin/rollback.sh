#!/usr/bin/env bash
# Tear the stack down to pre-apply state. Two modes:
#   bin/rollback.sh            stop and remove containers/networks, keep volumes (TLS material, coturn
#                               logs) and the vendored upstream release — a plain `bin/install.sh --apply`
#                               afterwards comes back up without re-fetching anything.
#   bin/rollback.sh --purge    also remove the named volumes and the secret store under
#                               /etc/bersoncarebot/jitsi-test/secrets/ — full reset, next --apply generates
#                               fresh internal passwords/TURN secret (does not touch JWT_APP_SECRET, which
#                               this package never stores).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$HERE"

on_dev_test_host=0
for address in $(hostname -I 2>/dev/null || true); do
  [[ "$address" == 151.241.228.122 ]] && on_dev_test_host=1
done
[[ "$on_dev_test_host" == 1 ]] || { echo "FATAL: not on 151.241.228.122" >&2; exit 1; }

ENV_FILE="${JITSI_TEST_ENV_FILE:-/opt/env/bersoncarebot/jitsi.test}"
JITSI_RELEASE_TAG="$(grep -E '^JITSI_RELEASE_TAG=' "$ENV_FILE" 2>/dev/null | cut -d= -f2 || true)"
VENDOR_DIR="$HERE/vendor/docker-jitsi-meet-${JITSI_RELEASE_TAG:-unknown}"

if [[ -d "$VENDOR_DIR" ]]; then
  docker compose \
    -f "$VENDOR_DIR/docker-compose.yml" \
    -f "$HERE/docker-compose.override.test.yml" \
    --env-file "$ENV_FILE" \
    -p bcb-jitsi-test down --remove-orphans
else
  # Vendor dir gone but containers might still exist under the project name — remove by project label only.
  docker compose -p bcb-jitsi-test down --remove-orphans 2>/dev/null || true
fi
echo "[jitsi-test] stack stopped and removed"

if [[ "${1:-}" == "--purge" ]]; then
  docker volume rm -f bcb-jitsi-test-turn-tls bcb-jitsi-test-turn-logs 2>/dev/null || true
  rm -rf "${JITSI_TEST_SECRET_STORE:-/etc/bersoncarebot/jitsi-test/secrets}"
  rm -f "$HERE/config/prosody/conf.d/00-turn-external.rendered.cfg.lua" "$HERE/coturn/turnserver.rendered.conf"
  echo "[jitsi-test] purged volumes + secret store + rendered config; next --apply starts fresh"
fi
