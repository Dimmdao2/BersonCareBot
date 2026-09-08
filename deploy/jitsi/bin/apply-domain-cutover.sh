#!/usr/bin/env bash
# Atomically move the existing TEST Jitsi/coturn env from legacy BersonCare
# hostnames to canonical Therapysto hostnames without reading or rewriting secrets.
set -euo pipefail
umask 077

MODE="${1:---check}"
EXPECTED_HOST_IP="151.241.228.122"
JITSI_ENV="${JITSI_TEST_ENV_FILE:-/opt/env/bersoncarebot/jitsi.test}"
TURN_ENV="${TURN_TEST_ENV_FILE:-/opt/env/bersoncarebot/jitsi-coturn.test}"
BACKUP_ROOT="/var/backups/bersoncare-jitsi-test-domain-cutover"

fail() { echo "[jitsi-test-domain] FATAL: $*" >&2; exit 1; }
[[ "$MODE" == --check || "$MODE" == --apply ]] || fail "usage: $0 [--check|--apply]"
[[ "$(id -u)" == 0 ]] || fail "$MODE must run as root"
hostname -I | tr ' ' '\n' | grep -Fxq "$EXPECTED_HOST_IP" \
  || fail "this script targets only TEST host $EXPECTED_HOST_IP"

for file in "$JITSI_ENV" "$TURN_ENV"; do
  [[ -f "$file" && ! -L "$file" ]] || fail "expected a regular TEST env file: $file"
done

render_env() {
  local source="$1" output="$2" kind="$3"
  awk -v kind="$kind" '
    BEGIN {
      canonical["XMPP_DOMAIN"]="meet.test.therapysto.ru"
      canonical["XMPP_AUTH_DOMAIN"]="auth.meet.test.therapysto.ru"
      canonical["XMPP_MUC_DOMAIN"]="muc.meet.test.therapysto.ru"
      canonical["XMPP_GUEST_DOMAIN"]="guest.meet.test.therapysto.ru"
      canonical["XMPP_INTERNAL_MUC_DOMAIN"]="internal-muc.meet.test.therapysto.ru"
      canonical["PUBLIC_URL"]="https://meet.test.therapysto.ru"
      canonical["P2P_STUN_SERVERS"]="turn.test.therapysto.ru:3478"
      canonical["JVB_STUN_SERVERS"]="turn.test.therapysto.ru:3478"
      canonical["STUN_HOST"]="turn.test.therapysto.ru"
      canonical["TURN_HOST"]="turn.test.therapysto.ru"
      canonical["TURNS_HOST"]="turn.test.therapysto.ru"
      canonical["TURN_REALM"]="turn.test.therapysto.ru"
      canonical["TURN_CERT_DOMAIN"]="turn.test.therapysto.ru"
    }
    /^[A-Za-z_][A-Za-z0-9_]*=/ {
      split($0, parts, "="); key=parts[1]
      allowed=(kind == "jitsi" && key ~ /^(XMPP_DOMAIN|XMPP_AUTH_DOMAIN|XMPP_MUC_DOMAIN|XMPP_GUEST_DOMAIN|XMPP_INTERNAL_MUC_DOMAIN|PUBLIC_URL|P2P_STUN_SERVERS|JVB_STUN_SERVERS|STUN_HOST|TURN_HOST|TURNS_HOST)$/) ||
              (kind == "turn" && key ~ /^(TURN_REALM|TURN_CERT_DOMAIN)$/)
      if (allowed) {
        if (++seen[key] > 1) exit 42
        print key "=" canonical[key]
        next
      }
    }
    { print }
    END {
      for (key in canonical) {
        allowed=(kind == "jitsi" && key ~ /^(XMPP_DOMAIN|XMPP_AUTH_DOMAIN|XMPP_MUC_DOMAIN|XMPP_GUEST_DOMAIN|XMPP_INTERNAL_MUC_DOMAIN|PUBLIC_URL|P2P_STUN_SERVERS|JVB_STUN_SERVERS|STUN_HOST|TURN_HOST|TURNS_HOST)$/) ||
                (kind == "turn" && key ~ /^(TURN_REALM|TURN_CERT_DOMAIN)$/)
        if (allowed && !seen[key]) print key "=" canonical[key]
      }
    }
  ' "$source" >"$output" || fail "cannot render $source"
}

validate_line() {
  local file="$1" key="$2" value="$3"
  [[ "$(grep -c "^${key}=" "$file")" == 1 ]] || fail "$key is not unique in rendered env"
  grep -Fxq "$key=$value" "$file" || fail "$key mismatch in rendered env"
}

jitsi_rendered="$(mktemp /tmp/bcb-jitsi-domain.XXXXXX)"
turn_rendered="$(mktemp /tmp/bcb-turn-domain.XXXXXX)"
cleanup() { rm -f "$jitsi_rendered" "$turn_rendered"; }
trap cleanup EXIT
render_env "$JITSI_ENV" "$jitsi_rendered" jitsi
render_env "$TURN_ENV" "$turn_rendered" turn
validate_line "$jitsi_rendered" PUBLIC_URL https://meet.test.therapysto.ru
validate_line "$jitsi_rendered" XMPP_DOMAIN meet.test.therapysto.ru
validate_line "$jitsi_rendered" TURN_HOST turn.test.therapysto.ru
validate_line "$turn_rendered" TURN_REALM turn.test.therapysto.ru
validate_line "$turn_rendered" TURN_CERT_DOMAIN turn.test.therapysto.ru
bash -n "$jitsi_rendered"
bash -n "$turn_rendered"

if [[ "$MODE" == --check ]]; then
  echo "[jitsi-test-domain] rendered canonical TEST domains successfully; no env changed"
  exit 0
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_dir="$BACKUP_ROOT/$timestamp"
install -d -m 0700 -o root -g root "$backup_dir"
cp -a -- "$JITSI_ENV" "$backup_dir/jitsi.test"
cp -a -- "$TURN_ENV" "$backup_dir/jitsi-coturn.test"

install_preserving_metadata() {
  local rendered="$1" target="$2" mode owner group tmp
  mode="$(stat -c %a "$target")"
  owner="$(stat -c %u "$target")"
  group="$(stat -c %g "$target")"
  tmp="$(mktemp "${target}.tmp.XXXXXX")"
  install -m "$mode" -o "$owner" -g "$group" "$rendered" "$tmp"
  mv -f -- "$tmp" "$target"
}

install_preserving_metadata "$jitsi_rendered" "$JITSI_ENV"
install_preserving_metadata "$turn_rendered" "$TURN_ENV"
echo "[jitsi-test-domain] applied canonical domains; backup: $backup_dir"
