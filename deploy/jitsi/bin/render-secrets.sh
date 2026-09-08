#!/usr/bin/env bash
# Generates/loads host-side Prosody/JVB/coturn secrets and renders the two config templates that need them.
# Scope is exactly the boundary in README.md: this script owns internal XMPP passwords and the coturn shared
# secret; it never touches, generates, or reads the app JWT signing secret (JWT_APP_SECRET), which is an
# externally supplied input already present in the sourced env file by the time this script runs.
#
# Secret store: /etc/bersoncarebot/jitsi-test/secrets/ (0700, owner deploy:deploy), one file per value,
# 0600 — same shape as the existing Postgres mTLS material convention in
# docs/ARCHITECTURE/SERVER CONVENTIONS.md §mTLS (root/owner-only directory, narrow file perms, never
# world-readable, never printed). Never logged, never echoed — every write below is silent on success.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STORE="${JITSI_TEST_SECRET_STORE:-/etc/bersoncarebot/jitsi-test/secrets}"

log() { echo "[jitsi-test/secrets] $*"; }

install -d -m 0700 -o "$(id -u)" -g "$(id -g)" "$STORE" 2>/dev/null || install -d -m 0700 "$STORE"

gen_if_missing() {
  local file="$1"
  if [[ ! -s "$STORE/$file" ]]; then
    log "generating $file"
    umask 077
    openssl rand -base64 32 > "$STORE/$file"
    chmod 0600 "$STORE/$file"
  fi
}

# Internal-only credentials this package fully owns.
gen_if_missing "jicofo-auth-password"
gen_if_missing "jvb-auth-password"
gen_if_missing "turn-shared-secret"

JICOFO_AUTH_PASSWORD="$(cat "$STORE/jicofo-auth-password")"
JVB_AUTH_PASSWORD="$(cat "$STORE/jvb-auth-password")"
TURN_SHARED_SECRET="$(cat "$STORE/turn-shared-secret")"

# --- Render the rendered app env file that install.sh's `docker compose --env-file` actually reads ---
# We do not overwrite the operator-edited jitsi.test file's non-secret values; we only patch in the
# generated internal passwords, in place, idempotently.
ENV_FILE="${JITSI_TEST_ENV_FILE:-/opt/env/bersoncarebot/jitsi.test}"
if [[ -w "$ENV_FILE" ]]; then
  sed -i \
    -e "s#^JICOFO_AUTH_PASSWORD=.*#JICOFO_AUTH_PASSWORD=${JICOFO_AUTH_PASSWORD}#" \
    -e "s#^JVB_AUTH_PASSWORD=.*#JVB_AUTH_PASSWORD=${JVB_AUTH_PASSWORD}#" \
    "$ENV_FILE"
fi

# --- Render Prosody's turn_external include ---
TURN_HOST="${TURN_CERT_DOMAIN:-turn.test.bersoncare.ru}"
TURN_PORT="${TURN_LISTEN_PORT:-3478}"
sed \
  -e "s#__TURN_SHARED_SECRET__#${TURN_SHARED_SECRET}#" \
  -e "s#__TURN_HOST__#${TURN_HOST}#" \
  -e "s#__TURN_PORT__#${TURN_PORT}#" \
  "$HERE/config/prosody/conf.d/00-turn-external.cfg.lua.template" \
  > "$HERE/config/prosody/conf.d/00-turn-external.rendered.cfg.lua"
chmod 0600 "$HERE/config/prosody/conf.d/00-turn-external.rendered.cfg.lua"
log "rendered config/prosody/conf.d/00-turn-external.rendered.cfg.lua"

# --- Render coturn's turnserver.conf ---
denied_lines=""
IFS=',' read -ra ranges <<< "${TURN_DENY_PEER_RANGES:-}"
for r in "${ranges[@]}"; do
  [[ -z "$r" ]] && continue
  denied_lines+="denied-peer-ip=${r}"$'\n'
done

render_conf="$HERE/coturn/turnserver.rendered.conf"
: > "$render_conf"
while IFS= read -r line || [[ -n "$line" ]]; do
  if [[ "$line" == "__DENIED_PEER_IP_LINES__" ]]; then
    printf '%s' "$denied_lines" >> "$render_conf"
    continue
  fi
  line="${line//__TURN_LISTEN_PORT__/${TURN_LISTEN_PORT:-3478}}"
  line="${line//__TURN_TLS_LISTEN_PORT__/${TURN_TLS_LISTEN_PORT:-5349}}"
  line="${line//__TURN_RELAY_MIN__/${TURN_RELAY_MIN:-49152}}"
  line="${line//__TURN_RELAY_MAX__/${TURN_RELAY_MAX:-49252}}"
  line="${line//__TURN_SHARED_SECRET__/${TURN_SHARED_SECRET}}"
  line="${line//__TURN_REALM__/${TURN_REALM:-test.bersoncare.ru}}"
  line="${line//__TURN_EXTERNAL_IP__/${TURN_EXTERNAL_IP:-151.241.228.122}}"
  line="${line//__TURN_MAX_ALLOCATIONS__/${TURN_MAX_ALLOCATIONS:-8}}"
  printf '%s\n' "$line" >> "$render_conf"
done < "$HERE/coturn/turnserver.conf.template"
chmod 0600 "$render_conf"
log "rendered coturn/turnserver.rendered.conf"

log "done — no secret value was printed above"
