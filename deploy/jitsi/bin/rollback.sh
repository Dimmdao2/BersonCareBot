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
#   bin/rollback.sh              full exact-restore (see above), for the profile bin/lib/profile.sh resolves.
#   bin/rollback.sh --keep-cache stop/remove containers, network and this package's named volumes, but
#                                 keep the vendored upstream download and the secret store so a follow-up
#                                 --apply does not re-fetch/re-generate anything. NOT the default and NOT
#                                 an exact pre-apply restore — use only for fast local iteration, never as
#                                 the rollback evidence RUNBOOK.md asks for.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$HERE"
# shellcheck source=lib/profile.sh
source "$HERE/bin/lib/profile.sh"

jitsi_require_host

MODE="${1:-}"
[[ -z "$MODE" || "$MODE" == "--keep-cache" ]] || { echo "usage: $0 [--keep-cache]" >&2; exit 2; }

ENV_FILE="$JITSI_ENV_FILE"
[[ -f "$ENV_FILE" ]] || { echo "FATAL: missing $ENV_FILE" >&2; exit 1; }
# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a
[[ "${JITSI_DEPLOYMENT:-}" == "$JITSI_PROFILE_RESOLVED" ]] \
  || { echo "FATAL: $ENV_FILE declares JITSI_DEPLOYMENT='${JITSI_DEPLOYMENT:-<unset>}', this run resolved '$JITSI_PROFILE_RESOLVED'" >&2; exit 1; }
TURN_ENV_FILE="$JITSI_TURN_ENV_FILE"
[[ -f "$TURN_ENV_FILE" ]] || { echo "FATAL: missing $TURN_ENV_FILE" >&2; exit 1; }
# shellcheck disable=SC1090
set -a; source "$TURN_ENV_FILE"; set +a
CONFIG_DIR="$(realpath -m -- "${CONFIG:-/}")"
SECRET_STORE_DIR="$(realpath -m -- "$JITSI_TEST_SECRET_STORE")"
PACKAGE_ROOT="$JITSI_PACKAGE_ROOT"
[[ "$CONFIG_DIR" == "$PACKAGE_ROOT/"?* ]] || {
  echo "FATAL: CONFIG must resolve below $PACKAGE_ROOT; refusing rollback target $CONFIG_DIR" >&2
  exit 1
}
[[ "$SECRET_STORE_DIR" == "$PACKAGE_ROOT/"?* ]] || {
  echo "FATAL: JITSI_TEST_SECRET_STORE must resolve below $PACKAGE_ROOT; refusing rollback target $SECRET_STORE_DIR" >&2
  exit 1
}
VENDOR_DIR="$HERE/vendor/docker-jitsi-meet-${JITSI_RELEASE_TAG:-unknown}"

# `down -v` removes upstream's project-owned volumes. Coturn's private bind-mounted log/state directories
# are removed below as part of the exact restore; no external/unmanaged volume is declared here.
if [[ -d "$VENDOR_DIR" ]]; then
  docker compose \
    -f "$VENDOR_DIR/docker-compose.yml" \
    -f "$HERE/docker-compose.override.test.yml" \
    --env-file "$ENV_FILE" \
    --project-directory "$HERE" \
    -p "$JITSI_COMPOSE_PROJECT" down --remove-orphans -v
else
  # Vendor dir gone but containers might still exist under the project name — remove by project label only.
  docker compose -p "$JITSI_COMPOSE_PROJECT" down --remove-orphans -v 2>/dev/null || true
fi
echo "$JITSI_LOG_TAG stack stopped and removed with this project's named volumes"

if [[ "$MODE" == "--keep-cache" ]]; then
  echo "$JITSI_LOG_TAG --keep-cache: leaving vendor/ and the secret store in place (NOT an exact pre-apply restore)"
else
  rm -rf "$HERE/vendor"
  rm -f "$HERE/coturn/turnserver.rendered.conf"
  rm -rf "$HERE/coturn/log" "$HERE/coturn/state"
  rm -rf "$SECRET_STORE_DIR"
  rm -rf "$CONFIG_DIR"
  echo "$JITSI_LOG_TAG purged vendor/, rendered config, coturn log/state, secret store, and CONFIG tree — pre-apply state restored"
fi

echo "$JITSI_LOG_TAG unchanged by this script (external to this package, per NETWORK_POLICY.md): DNS records, TLS certificates, the host nginx vhost, and the host firewall"
