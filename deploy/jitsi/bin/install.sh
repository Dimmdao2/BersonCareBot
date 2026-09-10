#!/usr/bin/env bash
# Idempotent per-profile install/apply for the Jitsi/coturn stack (#1100 stream C).
#
# The profile (TEST host 151.241.228.122 or the NEW production host 135.106.187.95) comes from
# JITSI_DEPLOYMENT via bin/lib/profile.sh — there is no default, and the legacy production host
# 135.106.162.170 is refused under both profiles.
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
# The TEST profile is what has actually been exercised on a host; the prod profile has never been run
# anywhere — see ../README.md "Status and what remains". This script is reviewed, syntax-checked
# (`bash -n`), and dry-run-safe (--check performs no writes).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$HERE"
# shellcheck source=lib/profile.sh
source "$HERE/bin/lib/profile.sh"

MODE="${1:-}"
[[ "$MODE" == "--check" || "$MODE" == "--apply" ]] || {
  echo "usage: $0 --check|--apply" >&2
  exit 2
}

log() { echo "$JITSI_LOG_TAG $*"; }
fail() { echo "$JITSI_LOG_TAG FATAL: $*" >&2; exit 1; }

# --- 1. Host identity gate (fail closed) — profile-derived, and refuses the legacy production host under
#        every profile. See bin/lib/profile.sh. ---
jitsi_require_host

# --- 2. Load non-secret env (must exist; install.sh does not invent values) ---
ENV_FILE="$JITSI_ENV_FILE"
[[ -f "$ENV_FILE" ]] || fail "missing $ENV_FILE — copy $JITSI_ENV_EXAMPLE there first and fill in the externally-supplied JWT_APP_SECRET"
unset TURN_USERNAME TURN_PASSWORD
# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a
# The env file may re-declare JITSI_DEPLOYMENT; it must agree with the profile this run resolved, or every
# path/hostname assertion below would be checking a different deployment than the one being applied.
[[ "${JITSI_DEPLOYMENT:-}" == "$JITSI_PROFILE_RESOLVED" ]] \
  || fail "$ENV_FILE declares JITSI_DEPLOYMENT='${JITSI_DEPLOYMENT:-<unset>}' but this run resolved profile '$JITSI_PROFILE_RESOLVED'"

TURN_ENV_FILE="$JITSI_TURN_ENV_FILE"
[[ -f "$TURN_ENV_FILE" ]] || fail "missing $TURN_ENV_FILE — copy $JITSI_TURN_ENV_EXAMPLE there first"
# shellcheck disable=SC1090
set -a; source "$TURN_ENV_FILE"; set +a
# Same agreement check for the coturn env file: a mismatched pair of env files (one profile's Jitsi file
# beside the other profile's coturn file) would otherwise render a TURN realm/external IP from one host
# into a stack running on the other.
[[ "${JITSI_DEPLOYMENT:-}" == "$JITSI_PROFILE_RESOLVED" ]] \
  || fail "$TURN_ENV_FILE declares JITSI_DEPLOYMENT='${JITSI_DEPLOYMENT:-<unset>}' but this run resolved profile '$JITSI_PROFILE_RESOLVED'"
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

for prerequisite in unzip stat node; do
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
for required_turn_var in STUN_HOST STUN_PORT TURN_HOST TURN_PORT TURN_TRANSPORT TURNS_HOST TURNS_PORT TURN_TTL; do
  require_var "$required_turn_var"
done
[[ "$TURN_EXTERNAL_IP" == "$JITSI_EXPECTED_HOST_IP" ]] || { echo "  MISMATCH TURN_EXTERNAL_IP=$TURN_EXTERNAL_IP, expected $JITSI_EXPECTED_HOST_IP"; missing=1; }
[[ "${CONFIG:-}" == /* ]] || { echo "  MISMATCH CONFIG=${CONFIG:-<empty>}, must be an absolute path (see $JITSI_ENV_EXAMPLE)"; missing=1; }
for own_turn_host in STUN_HOST TURN_HOST TURNS_HOST; do
  [[ "${!own_turn_host}" == "$JITSI_TURN_HOST" ]] || {
    echo "  MISMATCH $own_turn_host must be $JITSI_TURN_HOST"; missing=1;
  }
done
[[ "${STUN_PORT:-}" == "3478" && "${TURN_PORT:-}" == "3478" && "${TURNS_PORT:-}" == "5349" && "${TURN_TRANSPORT:-}" == "udp" && "${TURN_TTL:-}" == "3600" ]] || {
  echo "  MISMATCH upstream external_services must advertise STUN/TURN UDP on 3478, TURNS TCP on 5349, TTL 3600"; missing=1;
}
[[ -z "${TURN_USERNAME:-}" && -z "${TURN_PASSWORD:-}" ]] || {
  echo "  MISMATCH TURN_USERNAME/TURN_PASSWORD must remain unset; upstream must issue ephemeral TURN credentials from TURN_CREDENTIALS"; missing=1;
}
for stun_var in P2P_STUN_SERVERS JVB_STUN_SERVERS; do
  stun_value="${!stun_var:-}"
  if [[ -z "$stun_value" || "$stun_value" == *://* || "$stun_value" == stun:* || "$stun_value" == turn:* ]]; then
    echo "  MISMATCH $stun_var must use docker-jitsi-meet's host:port form without a URI scheme"
    missing=1
  fi
done

package_root="$JITSI_PACKAGE_ROOT"
resolved_config="$(realpath -m -- "${CONFIG:-/}")"
resolved_secret_store="$(realpath -m -- "$JITSI_TEST_SECRET_STORE")"
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
for host in "$JITSI_MEET_HOST" "$JITSI_TURN_HOST"; do
  if ! getent ahostsv4 "$host" >/dev/null 2>&1; then
    echo "  MISSING  DNS A record for $host -> $JITSI_EXPECTED_HOST_IP (create at the DNS provider first)"
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
    echo "  MISSING  $tls_path — stage a certificate for $JITSI_TURN_HOST first"
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
  --filter "label=com.docker.compose.project=$JITSI_COMPOSE_PROJECT" \
  --format '{{.Label "com.docker.compose.service"}}' 2>/dev/null | sort -u || true)"
existing_project_complete=1
for service in web prosody jicofo jvb coturn; do
  grep -qx "$service" <<<"$existing_services" || existing_project_complete=0
done

if [[ "$existing_project_complete" == 1 ]]; then
  log "exact $JITSI_COMPOSE_PROJECT project is already running; its own listeners are allowed for idempotent re-apply"
elif [[ -n "$existing_services" ]]; then
  echo "  COLLISION  partial $JITSI_COMPOSE_PROJECT project is running (${existing_services//$'\n'/, }); stop or repair it before apply"
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
  -p "$JITSI_COMPOSE_PROJECT"
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

# Режим 0775, а не 0755, и это не небрежность. Каталоги создаёт учётка, под которой выполняется
# install.sh, а ПИШУТ в них служебные пользователи внутри апстрим-образов — там это фиксированный
# uid 1000, и поменять его образы не дают. Когда uid учётки случайно совпадал с 1000 (как на TEST),
# вопрос не возникал; на проде под 1000 живёт человек, и отдавать ему каталоги стека нельзя.
# Поэтому доступ выдаётся по ГРУППЕ: каталоги остаются за учёткой стека, группа — её же, а
# контейнеры получают эту группу дополнительной (`group_add` в оверлее). Тот же приём этот хост уже
# использует, чтобы контейнеры приложения читали ключи mTLS.
log "creating CONFIG tree at $CONFIG (docker-jitsi-meet's own required subdirectories)"
for sub in web storage/web storage/transcripts tmp/web-load-test \
           prosody/config prosody/prosody-plugins-custom storage/prosody \
           jicofo jvb; do
  install -d -m 0775 "$CONFIG/$sub" 2>/dev/null || fail "could not create $CONFIG/$sub — operator prerequisite: $(dirname "$JITSI_PACKAGE_ROOT") must exist and be writable by this user (same convention as postgres-mtls), see docs/ARCHITECTURE/SERVER CONVENTIONS.md §mTLS"
done

log "creating coturn writable log/state directories for UID:GID ${COTURN_CONTAINER_UID}:${COTURN_CONTAINER_GID}"
for coturn_writable_dir in "$HERE/coturn/log" "$HERE/coturn/state"; do
  install -d -m 0700 "$coturn_writable_dir" || fail "could not create $coturn_writable_dir for coturn logs/state"
  [[ "$(stat -c '%a:%u:%g' "$coturn_writable_dir")" == "700:${COTURN_CONTAINER_UID}:${COTURN_CONTAINER_GID}" ]] || \
    fail "$coturn_writable_dir must be mode 0700 and owned by ${COTURN_CONTAINER_UID}:${COTURN_CONTAINER_GID}"
done

log "rendering secrets + templates (upstream global external_services credentials, coturn turnserver.conf)"
bash "$HERE/bin/render-secrets.sh"
# render-secrets.sh atomically synchronizes TURN_CREDENTIALS and the internal XMPP passwords. Reload the
# env file so Compose sees those current private values rather than the placeholder sourced for preflight.
set -a; source "$ENV_FILE"; set +a
unset TURN_USERNAME TURN_PASSWORD

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
  -p "$JITSI_COMPOSE_PROJECT"
)

log "validating the final merged compose context after rendering"
docker compose "${COMPOSE_ARGS[@]}" config >/dev/null || fail "docker compose config failed after rendering — see output above; nothing was started"

log "bringing the compose stack up (project $JITSI_COMPOSE_PROJECT)"
docker compose "${COMPOSE_ARGS[@]}" up -d
bash "$HERE/bin/reconcile-xmpp-service-credentials.sh"

log "apply complete; run bin/health-check.sh to verify config actually landed and the stack is healthy"
