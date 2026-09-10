#!/usr/bin/env bash
# Repo-managed nginx vhost apply path for the profile's canonical Therapysto meet host. Default is
# read-only --check; --apply is root-only, backs up any previous target, validates nginx before reload, and
# restores on failure. Which template, which server names and which ACME lineage are used comes from
# bin/lib/profile.sh — TEST and PROD share this one code path.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/profile.sh
source "$HERE/bin/lib/profile.sh"

MODE="${1:---check}"
PRIMARY_SERVER_NAME="$JITSI_MEET_HOST"
SERVER_NAMES="$JITSI_NGINX_SERVER_NAMES"
# Loopback target of the Jitsi web container (docker-compose.override.test.yml maps
# 127.0.0.1:${HTTP_PORT}:8000, and HTTP_PORT is 8000 in both env templates).
UPSTREAM="http://127.0.0.1:8000"
TEMPLATE="$HERE/nginx/$JITSI_NGINX_TEMPLATE_NAME"
TARGET_AVAILABLE="/etc/nginx/sites-available/$PRIMARY_SERVER_NAME"
TARGET_ENABLED="/etc/nginx/sites-enabled/$PRIMARY_SERVER_NAME"

fail() { echo "[jitsi-${JITSI_DEPLOYMENT}-nginx] FATAL: $*" >&2; exit 1; }
[[ "$MODE" == --check || "$MODE" == --apply ]] || fail "usage: $0 [--check|--apply]"
[[ "$(id -u)" == 0 ]] || fail "$MODE must run as root because the ACME certificate is root-readable only"

jitsi_require_host
[[ -f "$TEMPLATE" ]] || fail "missing $TEMPLATE"
command -v nginx >/dev/null 2>&1 || fail "nginx is not installed"
[[ -s "/etc/letsencrypt/live/$JITSI_TLS_LINEAGE/fullchain.pem" ]] || fail "missing $JITSI_TLS_LINEAGE certificate"
[[ -s "/etc/letsencrypt/live/$JITSI_TLS_LINEAGE/privkey.pem" ]] || fail "missing $JITSI_TLS_LINEAGE private key"

rendered="$(mktemp "/tmp/${JITSI_COMPOSE_PROJECT}-nginx.XXXXXX")"
backup=""
cleanup() { rm -f "$rendered"; }
trap cleanup EXIT
sed -e "s|__SERVER_NAMES__|$SERVER_NAMES|g" -e "s|__UPSTREAM__|$UPSTREAM|g" -e "s|__TLS_LINEAGE__|$JITSI_TLS_LINEAGE|g" "$TEMPLATE" >"$rendered"
if grep -q '__[A-Z_]*__' "$rendered"; then
  fail "unresolved template placeholder"
fi

if [[ "$MODE" == --check ]]; then
  echo "[jitsi-${JITSI_DEPLOYMENT}-nginx] prerequisites and rendered vhost are valid; no host file changed"
  exit 0
fi
if [[ -e "$TARGET_AVAILABLE" ]]; then
  backup="$(mktemp "/tmp/${JITSI_COMPOSE_PROJECT}-nginx.previous.XXXXXX")"
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
echo "[jitsi-${JITSI_DEPLOYMENT}-nginx] applied $TARGET_AVAILABLE and reloaded nginx"
