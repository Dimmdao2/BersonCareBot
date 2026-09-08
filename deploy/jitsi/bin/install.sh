#!/usr/bin/env bash
# Idempotent TEST-only install/apply for the Jitsi/coturn stack (#1100 stream C).
#
#   bin/install.sh --check   read-only: verify prerequisites (host identity, DNS, TLS material, upstream
#                            tag reachability, secret inputs present, port collisions), print exactly what
#                            is missing, exit non-zero if anything is. Changes nothing.
#   bin/install.sh --apply   run --check first (fails closed on any missing prerequisite), then fetch the
#                            pinned upstream release (verifying its archive hash before unzipping),
#                            create the CONFIG tree, render config from templates + the secret store, dry-run
#                            the full merged compose config, and bring the stack up. Safe to re-run: every
#                            step is written to be a no-op when its target state already holds.
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
COTURN_CONTAINER_UID="${COTURN_CONTAINER_UID:-1000}"
COTURN_CONTAINER_GID="${COTURN_CONTAINER_GID:-1000}"
export COTURN_CONTAINER_UID COTURN_CONTAINER_GID

missing=0
require_var() {
  local name="$1" val="${!1:-}"
  if [[ -z "$val" || "$val" == __*__ ]]; then
    echo "  MISSING  $name (still a placeholder or empty)"
    missing=1
  fi
}

for prerequisite in unzip stat; do
  if ! command -v "$prerequisite" >/dev/null 2>&1; then
    echo "  MISSING  $prerequisite — required by bin/install.sh; install it before --apply (this script never installs host packages)"
    missing=1
  fi
done

log "checking required config values are filled in (not printing any value)"
require_var JITSI_RELEASE_TAG
require_var ARCHIVE_SHA256
require_var CONFIG
require_var XMPP_DOMAIN
require_var JWT_APP_SECRET
require_var COTURN_IMAGE_TAG
require_var COTURN_CONTAINER_UID
require_var COTURN_CONTAINER_GID
require_var TURN_EXTERNAL_IP
[[ "$TURN_EXTERNAL_IP" == 151.241.228.122 ]] || { echo "  MISMATCH TURN_EXTERNAL_IP=$TURN_EXTERNAL_IP, expected 151.241.228.122"; missing=1; }
[[ "${CONFIG:-}" == /* ]] || { echo "  MISMATCH CONFIG=${CONFIG:-<empty>}, must be an absolute path (see env/jitsi-test.env.example)"; missing=1; }
for stun_var in P2P_STUN_SERVERS JVB_STUN_SERVERS; do
  stun_value="${!stun_var:-}"
  if [[ -z "$stun_value" || "$stun_value" == *://* || "$stun_value" == stun:* || "$stun_value" == turn:* ]]; then
    echo "  MISMATCH $stun_var must use docker-jitsi-meet's host:port form without a URI scheme"
    missing=1
  fi
done

package_root="/etc/bersoncarebot/jitsi-test"
resolved_config="$(realpath -m -- "${CONFIG:-/}")"
resolved_secret_store="$(realpath -m -- "${JITSI_TEST_SECRET_STORE:-$package_root/secrets}")"
[[ "$resolved_config" == "$package_root/"?* ]] || {
  echo "  MISMATCH CONFIG must be an exact descendant of $package_root (resolved: $resolved_config)"
  missing=1
}
[[ "$resolved_secret_store" == "$package_root/"?* ]] || {
  echo "  MISMATCH JITSI_TEST_SECRET_STORE must be an exact descendant of $package_root (resolved: $resolved_secret_store)"
  missing=1
}
if ! [[ "${COTURN_CONTAINER_UID:-}" =~ ^[0-9]+$ && "${COTURN_CONTAINER_GID:-}" =~ ^[0-9]+$ ]]; then
  echo "  MISMATCH COTURN_CONTAINER_UID/COTURN_CONTAINER_GID must be numeric"
  missing=1
elif [[ "$(id -u)" != "$COTURN_CONTAINER_UID" || "$(id -g)" != "$COTURN_CONTAINER_GID" ]]; then
  echo "  MISMATCH run install.sh as UID:GID ${COTURN_CONTAINER_UID}:${COTURN_CONTAINER_GID} so its 0600 rendered config is readable by coturn"
  missing=1
fi

# --- 3. DNS prerequisite (NETWORK_POLICY.md) ---
for host in "meet.test.bersoncare.ru" "turn.test.bersoncare.ru"; do
  if ! getent ahostsv4 "$host" >/dev/null 2>&1; then
    echo "  MISSING  DNS A record for $host -> 151.241.228.122 (create at the DNS provider first)"
    missing=1
  fi
done

# --- 4. Private TLS copy for coturn's own 5349 listener (nginx handles the web vhost's cert). ---
# The root-owned ACME source is intentionally not mounted. A certificate hook/operator must stage this
# exact deploy-owned copy before --apply; coturn gets read-only access through its non-root numeric user.
coturn_tls_dir="${CONFIG:-}/coturn/tls"
if [[ ! -d "$coturn_tls_dir" ]]; then
  echo "  MISSING  $coturn_tls_dir — stage the deploy-owned private TLS copy first; see NETWORK_POLICY.md"
  missing=1
elif [[ "$(stat -c '%a:%u:%g' "$coturn_tls_dir")" != "700:${COTURN_CONTAINER_UID:-unknown}:${COTURN_CONTAINER_GID:-unknown}" ]]; then
  echo "  MISMATCH $coturn_tls_dir must be mode 0700 and owned by ${COTURN_CONTAINER_UID:-unknown}:${COTURN_CONTAINER_GID:-unknown}"
  missing=1
fi
for tls_file in fullchain.pem privkey.pem; do
  tls_path="$coturn_tls_dir/$tls_file"
  if [[ ! -s "$tls_path" ]]; then
    echo "  MISSING  $tls_path — stage a certificate for turn.test.bersoncare.ru first"
    missing=1
  elif [[ "$(stat -c '%a:%u:%g' "$tls_path")" != "600:${COTURN_CONTAINER_UID:-unknown}:${COTURN_CONTAINER_GID:-unknown}" ]]; then
    echo "  MISMATCH $tls_path must be mode 0600 and owned by ${COTURN_CONTAINER_UID:-unknown}:${COTURN_CONTAINER_GID:-unknown}"
    missing=1
  fi
done

# --- 5. Upstream release reachable at the pinned tag (read-only network check) ---
RELEASE_URL="https://github.com/jitsi/docker-jitsi-meet/archive/refs/tags/${JITSI_RELEASE_TAG}.zip"
if ! curl -fsIL "$RELEASE_URL" >/dev/null 2>&1; then
  echo "  MISSING  upstream release archive for tag $JITSI_RELEASE_TAG not reachable at $RELEASE_URL"
  missing=1
fi

# --- 6. Host port-collision preflight — every exact surface this package owns, checked before any
#        download/render/mutation happens (not just at `docker compose up` time, when it would be too
#        late: the vendor fetch and secret render below would already have run). ---
existing_services="$(docker ps \
  --filter label=com.docker.compose.project=bcb-jitsi-test \
  --format '{{.Label "com.docker.compose.service"}}' 2>/dev/null | sort -u || true)"
existing_project_complete=1
for service in web prosody jicofo jvb coturn; do
  grep -qx "$service" <<<"$existing_services" || existing_project_complete=0
done

if [[ "$existing_project_complete" == 1 ]]; then
  log "exact bcb-jitsi-test project is already running; its own listeners are allowed for idempotent re-apply"
elif [[ -n "$existing_services" ]]; then
  echo "  COLLISION  partial bcb-jitsi-test project is running (${existing_services//$'\n'/, }); stop or repair it before apply"
  missing=1
elif ! command -v ss >/dev/null 2>&1; then
  echo "  MISSING  ss (iproute2) — required to check port collisions before mutating anything; install it first"
  missing=1
else
  port_busy() {
    local proto="$1" port="$2"
    if [[ "$proto" == tcp ]]; then
      [[ -n "$(ss -H -ltn "sport = :$port" 2>/dev/null)" ]]
    else
      [[ -n "$(ss -H -lun "sport = :$port" 2>/dev/null)" ]]
    fi
  }
  require_port_free() {
    local proto="$1" port="$2" what="$3"
    if port_busy "$proto" "$port"; then
      echo "  COLLISION  $proto/$port already has a listener on this host ($what)"
      missing=1
    fi
  }
  require_port_free tcp "${HTTP_PORT:-8000}" "loopback web (nginx -> Jitsi web container)"
  require_port_free udp "${JVB_PORT:-10000}" "JVB media"
  require_port_free tcp "${JVB_TCP_PORT:-4443}" "JVB TCP harvester"
  require_port_free udp "${TURN_LISTEN_PORT:-3478}" "coturn STUN/TURN"
  require_port_free tcp "${TURN_LISTEN_PORT:-3478}" "coturn STUN/TURN"
  require_port_free tcp "${TURN_TLS_LISTEN_PORT:-5349}" "coturn TURN-over-TLS"
  relay_min="${TURN_RELAY_MIN:-49152}" relay_max="${TURN_RELAY_MAX:-49252}"
  relay_collisions=""
  for ((p = relay_min; p <= relay_max; p++)); do
    port_busy udp "$p" && relay_collisions+="$p "
  done
  if [[ -n "$relay_collisions" ]]; then
    echo "  COLLISION  udp relay range ${relay_min}-${relay_max} already occupied at: ${relay_collisions% }"
    missing=1
  fi
fi

if [[ "$missing" == 1 ]]; then
  fail "prerequisites not met — see MISSING/MISMATCH/COLLISION lines above; nothing was changed"
fi
log "all prerequisites present"

[[ "$MODE" == "--check" ]] && { log "--check complete, no changes made"; exit 0; }

# --- --apply from here ---
# Parse the complete pinned upstream+override tree before writing vendor/, CONFIG or secrets. When the
# archive is not cached yet it is verified and unpacked under mktemp first; only a successfully rendered
# candidate is moved into the package-owned vendor directory.
VENDOR_DIR="$HERE/vendor/docker-jitsi-meet-${JITSI_RELEASE_TAG}"
candidate_vendor="$VENDOR_DIR"
tmp_zip=""
tmp_unpack=""
cleanup_download() {
  [[ -z "$tmp_zip" || ! -e "$tmp_zip" ]] || rm -f "$tmp_zip"
  [[ -z "$tmp_unpack" || ! -d "$tmp_unpack" ]] || rm -rf "$tmp_unpack"
}
trap cleanup_download EXIT

if [[ ! -d "$VENDOR_DIR" ]]; then
  log "fetching pinned upstream release $JITSI_RELEASE_TAG into an isolated preflight directory"
  tmp_zip="$(mktemp)"
  tmp_unpack="$(mktemp -d)"
  curl -fsSL "$RELEASE_URL" -o "$tmp_zip"
  actual_sha256="$(sha256sum "$tmp_zip" | cut -d' ' -f1)"
  if [[ "$actual_sha256" != "$ARCHIVE_SHA256" ]]; then
    fail "downloaded archive for tag $JITSI_RELEASE_TAG does not match ARCHIVE_SHA256 in $ENV_FILE (expected $ARCHIVE_SHA256, got $actual_sha256) — refusing to unzip; see VERSIONS.md 'Bumping the pin' before re-recording this value"
  fi
  unzip -q "$tmp_zip" -d "$tmp_unpack"
  candidate_vendor="$tmp_unpack/docker-jitsi-meet-${JITSI_RELEASE_TAG}"
else
  log "upstream release $JITSI_RELEASE_TAG already vendored, using it for preflight"
fi
[[ -f "$candidate_vendor/docker-compose.yml" ]] || fail "candidate release at $candidate_vendor has no docker-compose.yml — bad tag or corrupted archive"

candidate_compose_args=(
  -f "$candidate_vendor/docker-compose.yml"
  -f "$HERE/docker-compose.override.test.yml"
  --env-file "$ENV_FILE"
  --project-directory "$HERE"
  -p bcb-jitsi-test
)
log "preflight: validating the full merged compose config before package mutation"
docker compose "${candidate_compose_args[@]}" config >/dev/null || fail "docker compose config failed against the merged upstream+override tree — nothing was changed"

if [[ "$candidate_vendor" != "$VENDOR_DIR" ]]; then
  mkdir -p "$HERE/vendor"
  mv "$candidate_vendor" "$VENDOR_DIR"
  candidate_vendor="$VENDOR_DIR"
  cleanup_download
  trap - EXIT
fi

log "creating CONFIG tree at $CONFIG (docker-jitsi-meet's own required subdirectories)"
for sub in web storage/web storage/transcripts tmp/web-load-test \
           prosody/config prosody/prosody-plugins-custom storage/prosody \
           jicofo jvb; do
  install -d -m 0755 "$CONFIG/$sub" 2>/dev/null || fail "could not create $CONFIG/$sub — operator prerequisite: /etc/bersoncarebot must exist and be writable by this user (same convention as postgres-mtls), see docs/ARCHITECTURE/SERVER CONVENTIONS.md §mTLS"
done

log "creating coturn writable log/state directories for UID:GID ${COTURN_CONTAINER_UID}:${COTURN_CONTAINER_GID}"
for coturn_writable_dir in "$HERE/coturn/log" "$HERE/coturn/state"; do
  install -d -m 0700 "$coturn_writable_dir" || fail "could not create $coturn_writable_dir for coturn logs/state"
  [[ "$(stat -c '%a:%u:%g' "$coturn_writable_dir")" == "700:${COTURN_CONTAINER_UID}:${COTURN_CONTAINER_GID}" ]] || \
    fail "$coturn_writable_dir must be mode 0700 and owned by ${COTURN_CONTAINER_UID}:${COTURN_CONTAINER_GID}"
done

log "rendering secrets + templates (prosody turn_external include, coturn turnserver.conf)"
bash "$HERE/bin/render-secrets.sh"

COMPOSE_ARGS=(
  -f "$VENDOR_DIR/docker-compose.yml"
  -f "$HERE/docker-compose.override.test.yml"
  --env-file "$ENV_FILE"
  # Compose resolves every relative bind-mount source (the override's ./config/..., ./coturn/...) against
  # the directory of the *first* -f file by default — since that is $VENDOR_DIR here, without this flag
  # every one of this package's own config files would resolve to a path inside the downloaded upstream
  # release instead of deploy/jitsi/, reproducing finding F1 with different symptoms. Confirmed with
  # `docker compose ... config` against a real vendored tree before landing this fix.
  --project-directory "$HERE"
  -p bcb-jitsi-test
)

log "validating the final merged compose context after rendering"
docker compose "${COMPOSE_ARGS[@]}" config >/dev/null || fail "docker compose config failed after rendering — see output above; nothing was started"

log "bringing the compose stack up (project bcb-jitsi-test)"
docker compose "${COMPOSE_ARGS[@]}" up -d

log "apply complete; run bin/health-check.sh to verify config actually landed and the stack is healthy"
