#!/usr/bin/env bash
# Generates/loads host-side Prosody/JVB/coturn secrets and renders coturn's private config template.
# Scope is exactly the boundary in README.md: this script owns internal XMPP passwords and the coturn shared
# secret; it never touches, generates, or reads the app JWT signing secret (JWT_APP_SECRET), which is an
# externally supplied input already present in the sourced env file by the time this script runs.
#
# Secret store: /etc/bersoncarebot/jitsi-test/secrets/ (0700, owner deploy:deploy), one file per value,
# 0600 — same shape as the existing Postgres mTLS material convention in
# docs/ARCHITECTURE/SERVER CONVENTIONS.md §mTLS (root/owner-only directory, narrow file perms, never
# world-readable, never printed). Never logged, never echoed — every write below is silent on success.
#
# argv safety (docs/audit/jitsi-coturn-test-package-2026-09-08.md finding F3): every substitution below is
# done with bash's own `${var//pattern/repl}` string replacement or the `printf` builtin, never by handing a
# secret value to `sed -e "s#...#${secret}#"` as a separate process's argument — a same-host process can
# read another process's argv (e.g. via /proc/<pid>/cmdline) but not a bash builtin that never execs.
#
# Atomicity: every rendered file is written to a temp file in the same directory (so the final `mv` is a
# same-filesystem rename, not a copy) and given its final 0600 mode before that rename — a crash mid-render
# leaves either the old file or nothing, never a half-written one.
set -euo pipefail
umask 077

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STORE="${JITSI_TEST_SECRET_STORE:-/etc/bersoncarebot/jitsi-test/secrets}"
PACKAGE_ROOT="/etc/bersoncarebot/jitsi-test"
STORE="$(realpath -m -- "$STORE")"
[[ "$STORE" == "$PACKAGE_ROOT/"?* ]] || {
  echo "FATAL: JITSI_TEST_SECRET_STORE must resolve below $PACKAGE_ROOT; refusing $STORE" >&2
  exit 1
}

log() { echo "[jitsi-test/secrets] $*"; }

install -d -m 0700 -o "$(id -u)" -g "$(id -g)" "$STORE" 2>/dev/null || install -d -m 0700 "$STORE"

gen_if_missing() {
  local file="$1"
  if [[ ! -s "$STORE/$file" ]]; then
    log "generating $file"
    openssl rand -base64 32 > "$STORE/$file.tmp.$$"
    chmod 0600 "$STORE/$file.tmp.$$"
    mv -f "$STORE/$file.tmp.$$" "$STORE/$file"
  fi
}

# Writes $value into the line "$key=..." of $file, in place, atomically, without ever passing $value as a
# process argument (pure bash — printf here is the shell builtin, not /usr/bin/printf, because no `=` in
# the command triggers an external exec).
write_env_var_inplace() {
  local file="$1" key="$2" value="$3"
  local tmp; tmp="$(mktemp "$(dirname "$file")/.$(basename "$file").tmp.XXXXXX")"
  local mode; mode="$(stat -c%a "$file" 2>/dev/null || echo 600)"
  local found=0 line
  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ "$line" == "$key="* ]]; then
      printf '%s=%s\n' "$key" "$value"
      found=1
    else
      printf '%s\n' "$line"
    fi
  done < "$file" > "$tmp"
  [[ "$found" == 1 ]] || printf '%s=%s\n' "$key" "$value" >> "$tmp"
  chmod "$mode" "$tmp"
  mv -f "$tmp" "$file"
}

# Internal-only credentials this package fully owns.
gen_if_missing "jicofo-auth-password"
gen_if_missing "jvb-auth-password"
gen_if_missing "turn-shared-secret"

JICOFO_AUTH_PASSWORD="$(cat "$STORE/jicofo-auth-password")"
JVB_AUTH_PASSWORD="$(cat "$STORE/jvb-auth-password")"
TURN_SHARED_SECRET="$(cat "$STORE/turn-shared-secret")"

# --- Patch the private app env file that install.sh's `docker compose --env-file` actually reads ---
# We do not overwrite the operator-edited jitsi.test file's non-secret values; we only patch in the
# generated internal passwords and the coturn HMAC key, in place, idempotently, and without a secret ever
# appearing in argv. The key is consumed only by upstream Prosody's global external_services template as
# TURN_CREDENTIALS; it is never served to the browser as a static TURN username/password.
ENV_FILE="${JITSI_TEST_ENV_FILE:-/opt/env/bersoncarebot/jitsi.test}"
[[ -w "$ENV_FILE" ]] || { echo "FATAL: $ENV_FILE must be writable to synchronize private Jitsi credentials" >&2; exit 1; }
[[ "$(stat -c '%a' "$ENV_FILE")" == "600" ]] || {
  echo "FATAL: $ENV_FILE must be mode 0600 before storing TURN_CREDENTIALS" >&2
  exit 1
}
write_env_var_inplace "$ENV_FILE" JICOFO_AUTH_PASSWORD "$JICOFO_AUTH_PASSWORD"
write_env_var_inplace "$ENV_FILE" JVB_AUTH_PASSWORD "$JVB_AUTH_PASSWORD"
write_env_var_inplace "$ENV_FILE" TURN_CREDENTIALS "$TURN_SHARED_SECRET"

# --- Render coturn's turnserver.conf ---
denied_lines=""
IFS=',' read -ra ranges <<< "${TURN_DENY_PEER_RANGES:-}"
for r in "${ranges[@]}"; do
  [[ -z "$r" ]] && continue
  denied_lines+="denied-peer-ip=${r}"$'\n'
done

coturn_render_conf="$HERE/coturn/turnserver.rendered.conf"
coturn_tmp="$(mktemp "$HERE/coturn/.turnserver.rendered.conf.tmp.XXXXXX")"
while IFS= read -r line || [[ -n "$line" ]]; do
  if [[ "$line" == "__DENIED_PEER_IP_LINES__" ]]; then
    printf '%s' "$denied_lines"
    continue
  fi
  line="${line//__TURN_LISTEN_PORT__/${TURN_LISTEN_PORT:-3478}}"
  line="${line//__TURN_TLS_LISTEN_PORT__/${TURN_TLS_LISTEN_PORT:-5349}}"
  line="${line//__TURN_RELAY_MIN__/${TURN_RELAY_MIN:-49152}}"
  line="${line//__TURN_RELAY_MAX__/${TURN_RELAY_MAX:-49252}}"
  line="${line//__TURN_SHARED_SECRET__/${TURN_SHARED_SECRET}}"
  line="${line//__TURN_REALM__/${TURN_REALM:-turn.test.therapysto.ru}}"
  line="${line//__TURN_EXTERNAL_IP__/${TURN_EXTERNAL_IP:-151.241.228.122}}"
  line="${line//__TURN_MAX_ALLOCATIONS__/${TURN_MAX_ALLOCATIONS:-8}}"
  printf '%s\n' "$line"
done < "$HERE/coturn/turnserver.conf.template" > "$coturn_tmp"
chmod 0600 "$coturn_tmp"
mv -f "$coturn_tmp" "$coturn_render_conf"
log "rendered coturn/turnserver.rendered.conf"

log "done — no secret value was printed above"
