#!/usr/bin/env bash
# Repo-managed TEST nginx vhost apply path for meet.test.bersoncare.ru. Default is read-only --check;
# --apply is root-only, backs up any previous target, validates nginx before reload, and restores on failure.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:---check}"
SERVER_NAME="meet.test.bersoncare.ru"
UPSTREAM="http://127.0.0.1:8000"
TEMPLATE="$HERE/nginx/meet-test.vhost.template.conf"
TARGET_AVAILABLE="/etc/nginx/sites-available/$SERVER_NAME"
TARGET_ENABLED="/etc/nginx/sites-enabled/$SERVER_NAME"

fail() { echo "[jitsi-test-nginx] FATAL: $*" >&2; exit 1; }
[[ "$MODE" == --check || "$MODE" == --apply ]] || fail "usage: $0 [--check|--apply]"

on_dev_test_host=0
for address in $(hostname -I 2>/dev/null || true); do
  [[ "$address" == 151.241.228.122 ]] && on_dev_test_host=1
done
[[ "$on_dev_test_host" == 1 ]] || fail "this script targets only DEV/RELAY/TEST host 151.241.228.122"
[[ -f "$TEMPLATE" ]] || fail "missing $TEMPLATE"
command -v nginx >/dev/null 2>&1 || fail "nginx is not installed"
[[ -s /etc/letsencrypt/live/bcb-jitsi-test/fullchain.pem ]] || fail "missing bcb-jitsi-test certificate"
[[ -s /etc/letsencrypt/live/bcb-jitsi-test/privkey.pem ]] || fail "missing bcb-jitsi-test private key"

rendered="$(mktemp /tmp/bcb-jitsi-test-nginx.XXXXXX)"
backup=""
cleanup() { rm -f "$rendered"; }
trap cleanup EXIT
sed -e "s|__SERVER_NAME__|$SERVER_NAME|g" -e "s|__UPSTREAM__|$UPSTREAM|g" "$TEMPLATE" >"$rendered"
if grep -q '__[A-Z_]*__' "$rendered"; then
  fail "unresolved template placeholder"
fi

if [[ "$MODE" == --check ]]; then
  echo "[jitsi-test-nginx] prerequisites and rendered vhost are valid; no host file changed"
  exit 0
fi
[[ "$(id -u)" == 0 ]] || fail "--apply must run as root"

if [[ -e "$TARGET_AVAILABLE" ]]; then
  backup="$(mktemp /tmp/bcb-jitsi-test-nginx.previous.XXXXXX)"
  cp -a -- "$TARGET_AVAILABLE" "$backup"
fi
restore() {
  if [[ -n "$backup" ]]; then
    install -m 0644 -o root -g root "$backup" "$TARGET_AVAILABLE"
  else
    rm -f -- "$TARGET_AVAILABLE" "$TARGET_ENABLED"
  fi
  nginx -t >/dev/null 2>&1 && systemctl reload nginx >/dev/null 2>&1 || true
  [[ -z "$backup" ]] || rm -f "$backup"
}

install -m 0644 -o root -g root "$rendered" "$TARGET_AVAILABLE"
ln -sfn "$TARGET_AVAILABLE" "$TARGET_ENABLED"
if ! nginx -t; then
  restore
  fail "nginx validation failed; previous vhost restored"
fi
if ! systemctl reload nginx; then
  restore
  fail "nginx reload failed; previous vhost restored"
fi
[[ -z "$backup" ]] || rm -f "$backup"
echo "[jitsi-test-nginx] applied $TARGET_AVAILABLE and reloaded nginx"
