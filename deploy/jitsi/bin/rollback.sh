#!/usr/bin/env bash
# Tears the stack down to its exact pre-apply state: containers, the project network, every named volume
# this package declares, the vendored upstream release, the rendered config files, and the host secret
# store — nothing this package created is left behind, matching "pre-apply" literally (see
# docs/audit/jitsi-coturn-test-package-2026-09-08.md finding F4). A subsequent bin/install.sh --apply
# starts completely fresh: new vendored download, new generated internal passwords/TURN secret, new CONFIG
# tree.
#
# This script never touches, and does not pretend to touch, anything outside the package's own footprint:
# DNS records, TLS certificates, the host nginx vhost, and the host firewall are unmodified by design (see
# NETWORK_POLICY.md) and are reported as such below, not silently ignored.
#
#   bin/rollback.sh              full exact-restore (see above).
#   bin/rollback.sh --keep-cache stop/remove containers, network and this package's named volumes, but
#                                 keep the vendored upstream download and the secret store so a follow-up
#                                 --apply does not re-fetch/re-generate anything. NOT the default and NOT
#                                 an exact pre-apply restore — use only for fast local iteration, never as
#                                 the rollback evidence RUNBOOK.md asks for.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$HERE"

on_dev_test_host=0
for address in $(hostname -I 2>/dev/null || true); do
  [[ "$address" == 151.241.228.122 ]] && on_dev_test_host=1
done
[[ "$on_dev_test_host" == 1 ]] || { echo "FATAL: not on 151.241.228.122" >&2; exit 1; }

MODE="${1:-}"
[[ -z "$MODE" || "$MODE" == "--keep-cache" ]] || { echo "usage: $0 [--keep-cache]" >&2; exit 2; }

ENV_FILE="${JITSI_TEST_ENV_FILE:-/opt/env/bersoncarebot/jitsi.test}"
JITSI_RELEASE_TAG="$(grep -E '^JITSI_RELEASE_TAG=' "$ENV_FILE" 2>/dev/null | cut -d= -f2 || true)"
CONFIG_DIR="$(grep -E '^CONFIG=' "$ENV_FILE" 2>/dev/null | cut -d= -f2 || true)"
VENDOR_DIR="$HERE/vendor/docker-jitsi-meet-${JITSI_RELEASE_TAG:-unknown}"

# `down -v` removes this project's own named volumes (bcb-jitsi-test-turn-logs) as part of the exact
# restore; it never touches an external/unmanaged volume because none is declared external here.
if [[ -d "$VENDOR_DIR" ]]; then
  docker compose \
    -f "$VENDOR_DIR/docker-compose.yml" \
    -f "$HERE/docker-compose.override.test.yml" \
    --env-file "$ENV_FILE" \
    --project-directory "$HERE" \
    -p bcb-jitsi-test down --remove-orphans -v
else
  # Vendor dir gone but containers might still exist under the project name — remove by project label only.
  docker compose -p bcb-jitsi-test down --remove-orphans -v 2>/dev/null || true
fi
echo "[jitsi-test] stack stopped, removed, and this project's named volumes dropped"

if [[ "$MODE" == "--keep-cache" ]]; then
  echo "[jitsi-test] --keep-cache: leaving vendor/ and the secret store in place (NOT an exact pre-apply restore)"
else
  rm -rf "$HERE/vendor"
  rm -f "$HERE/config/prosody/conf.d/00-turn-external.rendered.cfg.lua" "$HERE/coturn/turnserver.rendered.conf"
  rm -rf "${JITSI_TEST_SECRET_STORE:-/etc/bersoncarebot/jitsi-test/secrets}"
  if [[ -n "$CONFIG_DIR" && "$CONFIG_DIR" == /* ]]; then
    rm -rf "$CONFIG_DIR"
  fi
  echo "[jitsi-test] purged vendor/, rendered config, secret store, and CONFIG tree — pre-apply state restored"
fi

echo "[jitsi-test] unchanged by this script (external to this package, per NETWORK_POLICY.md): DNS records, TLS certificates, the host nginx vhost, and the host firewall"
