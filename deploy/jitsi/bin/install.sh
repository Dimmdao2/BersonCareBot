#!/usr/bin/env bash
# Idempotent TEST-only install/apply for the Jitsi/coturn stack (#1100 stream C).
#
#   bin/install.sh --check   read-only: verify prerequisites (host identity, DNS, TLS material, upstream
#                            tag reachability, secret inputs present), print exactly what is missing, exit
#                            non-zero if anything is. Changes nothing.
#   bin/install.sh --apply   run --check first (fails closed on any missing prerequisite), then fetch the
#                            pinned upstream release, render config from templates + the secret store, and
#                            bring the compose stack up. Safe to re-run: every step is written to be a no-op
#                            when its target state already holds.
#
# This script has not been run against any host by the worker that wrote it — see ../README.md "Status and
# what remains". It is reviewed, syntax-checked (`bash -n`), and dry-run-safe (--check performs no writes).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$HERE"

MODE="${1:-}"
[[ "$MODE" == "--check" || "$MODE" == "--apply" ]] || {
  echo "usage: $0 --check|--apply" >&2
  exit 2
}

log() { echo "[jitsi-test] $*"; }
fail() { echo "[jitsi-test] FATAL: $*" >&2; exit 1; }

# --- 1. Host identity gate (fail closed) — same idiom as deploy/host/deploy-test.sh ---
on_dev_test_host=0
for address in $(hostname -I 2>/dev/null || true); do
  [[ "$address" == 151.241.228.122 ]] && on_dev_test_host=1
done
[[ "$on_dev_test_host" == 1 ]] || fail "this package targets only DEV/RELAY/TEST host 151.241.228.122; refusing to run here"

# --- 2. Load non-secret env (must exist; install.sh does not invent values) ---
ENV_FILE="${JITSI_TEST_ENV_FILE:-/opt/env/bersoncarebot/jitsi.test}"
[[ -f "$ENV_FILE" ]] || fail "missing $ENV_FILE — copy env/jitsi-test.env.example there first and fill in the externally-supplied JWT_APP_SECRET"
# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a

TURN_ENV_FILE="${TURN_TEST_ENV_FILE:-/opt/env/bersoncarebot/jitsi-coturn.test}"
[[ -f "$TURN_ENV_FILE" ]] || fail "missing $TURN_ENV_FILE — copy env/coturn-test.env.example there first"
# shellcheck disable=SC1090
set -a; source "$TURN_ENV_FILE"; set +a

missing=0
require_var() {
  local name="$1" val="${!1:-}"
  if [[ -z "$val" || "$val" == __*__ ]]; then
    echo "  MISSING  $name (still a placeholder or empty)"
    missing=1
  fi
}

log "checking required config values are filled in (not printing any value)"
require_var JITSI_RELEASE_TAG
require_var XMPP_DOMAIN
require_var JWT_APP_SECRET
require_var COTURN_IMAGE_TAG
require_var TURN_EXTERNAL_IP
[[ "$TURN_EXTERNAL_IP" == 151.241.228.122 ]] || { echo "  MISMATCH TURN_EXTERNAL_IP=$TURN_EXTERNAL_IP, expected 151.241.228.122"; missing=1; }

# --- 3. DNS prerequisite (NETWORK_POLICY.md) ---
for host in "meet.test.bersoncare.ru" "turn.test.bersoncare.ru"; do
  if ! getent ahostsv4 "$host" >/dev/null 2>&1; then
    echo "  MISSING  DNS A record for $host -> 151.241.228.122 (create at the DNS provider first)"
    missing=1
  fi
done

# --- 4. TLS material prerequisite for coturn's own 5349 listener (nginx handles the web vhost's cert) ---
if [[ ! -s /etc/coturn/tls/fullchain.pem || ! -s /etc/coturn/tls/privkey.pem ]]; then
  echo "  MISSING  /etc/coturn/tls/{fullchain,privkey}.pem — issue a certificate for turn.test.bersoncare.ru first"
  missing=1
fi

# --- 5. Upstream release reachable at the pinned tag (read-only network check) ---
RELEASE_URL="https://github.com/jitsi/docker-jitsi-meet/archive/refs/tags/${JITSI_RELEASE_TAG}.zip"
if ! curl -fsIL "$RELEASE_URL" >/dev/null 2>&1; then
  echo "  MISSING  upstream release archive for tag $JITSI_RELEASE_TAG not reachable at $RELEASE_URL"
  missing=1
fi

if [[ "$missing" == 1 ]]; then
  fail "prerequisites not met — see MISSING/MISMATCH lines above; nothing was changed"
fi
log "all prerequisites present"

[[ "$MODE" == "--check" ]] && { log "--check complete, no changes made"; exit 0; }

# --- --apply from here ---
VENDOR_DIR="$HERE/vendor/docker-jitsi-meet-${JITSI_RELEASE_TAG}"
if [[ ! -d "$VENDOR_DIR" ]]; then
  log "fetching pinned upstream release $JITSI_RELEASE_TAG"
  mkdir -p "$HERE/vendor"
  tmp_zip="$(mktemp)"
  curl -fsSL "$RELEASE_URL" -o "$tmp_zip"
  unzip -q "$tmp_zip" -d "$HERE/vendor"
  rm -f "$tmp_zip"
else
  log "upstream release $JITSI_RELEASE_TAG already vendored, skipping fetch"
fi
[[ -f "$VENDOR_DIR/docker-compose.yml" ]] || fail "vendored release at $VENDOR_DIR has no docker-compose.yml — bad tag or corrupted archive"

log "rendering secrets + templates (prosody turn_external include, coturn turnserver.conf)"
bash "$HERE/bin/render-secrets.sh"

log "bringing the compose stack up (project bcb-jitsi-test)"
docker compose \
  -f "$VENDOR_DIR/docker-compose.yml" \
  -f "$HERE/docker-compose.override.test.yml" \
  --env-file "$ENV_FILE" \
  -p bcb-jitsi-test up -d

log "apply complete; run bin/health-check.sh to verify config actually landed and the stack is healthy"
