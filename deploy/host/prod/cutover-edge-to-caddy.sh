#!/bin/bash
# Atomic cutover of the new prod host's public 80/443 from nginx directly to the on-demand TLS edge
# (Caddy). Run as root on 135.106.187.95, once the blue-green pipeline is installed and at least one
# colour has been deployed (bcb_webapp must already resolve to something in
# /etc/nginx/conf.d/20-bcb-upstream.conf, or this cutover has nothing to forward requests to).
#
#   bash cutover-edge-to-caddy.sh
#
# What it does, in order — nothing here is executed by this repository change, only written:
#   1. preflight: host identity, root, required files and env keys present
#   2. installs Caddy from its official apt repository if not already present (idempotent)
#   3. validates the Caddyfile + env BEFORE touching nginx at all — a bad config fails here with the
#      live public site completely untouched
#   4. backs up the current public /etc/nginx/sites-available/bcb, replaces it with the
#      loopback-only internal template, `nginx -t`, reload — this is the one step that stops nginx
#      answering the public internet directly
#   5. installs the Caddyfile + a systemd env-file override, enables and (re)starts caddy.service —
#      this is the step that makes Caddy the new public listener
#   6. verifies: caddy active, listening on 80/443, nginx no longer publicly bound, an end-to-end
#      request for a known platform domain reaches the application through the new path
#
# Between steps 4 and 5 nothing is listening on the public 80/443 (nginx has released them, Caddy has
# not bound them yet) — a gap of a few seconds. That is an accepted property of a same-host cutover,
# not a bug: SERVER CONVENTIONS.md documents this host as reachable on 443 only from the dev box while
# it is a trial production, so nothing external is depending on zero-gap availability yet. Re-run this
# script during a maintenance window once that changes.
#
# Rollback: deploy/host/prod/rollback-edge-to-nginx.sh restores the pre-cutover nginx site from the
# timestamped backup this script writes and stops caddy. It is a separate script, not an automatic
# on-failure branch here, because a failure discovered by the post-flip checks below can mean several
# different things (nginx fine but caddy misconfigured, caddy fine but the ask endpoint unreachable,
# a DNS/firewall fact this script cannot see) and picking the wrong automatic response would hide
# which one happened. See docs/_TODO/CUSTOM_DOMAIN_TLS_EDGE_RUNBOOK_2026-09-07.md.
set -uo pipefail

BCB_ROOT=/opt/bersoncarebot
BCB_ENV_DIR="$BCB_ROOT/env"
BCB_PIPELINE="$BCB_ROOT/pipeline"
BCB_PUBLIC_SITE=/etc/nginx/sites-available/bcb
CADDY_ENV_FILE="$BCB_ENV_DIR/caddy.prod"
CADDYFILE_DEST=/etc/caddy/Caddyfile

say()  { printf '\033[1m==>\033[0m %s\n' "$*"; }
info() { printf '    %s\n' "$*"; }
die()  { printf '\033[31mFATAL: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" = 0 ] || die "must run as root"
[ -f /etc/bcb-pipeline.conf ] || die "pipeline not installed (run setup-docker-bluegreen.sh first)"
. /etc/bcb-pipeline.conf
[ -f "$BCB_PIPELINE/bcb-bluegreen-lib.sh" ] || die "pipeline library missing at $BCB_PIPELINE/bcb-bluegreen-lib.sh"
. "$BCB_PIPELINE/bcb-bluegreen-lib.sh"
require_prod_host

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CADDYFILE_SRC="$SRC_DIR/../../caddy/Caddyfile.template"
NGINX_TEMPLATE_SRC="$SRC_DIR/../../nginx/prod/bcb-internal.conf.template"

say "preflight"
[ -f "$CADDYFILE_SRC" ] || die "missing $CADDYFILE_SRC"
[ -f "$NGINX_TEMPLATE_SRC" ] || die "missing $NGINX_TEMPLATE_SRC"
[ -f "$CADDY_ENV_FILE" ] || die "missing $CADDY_ENV_FILE — copy deploy/env/.env.caddy.prod.example there and fill it in first"
[ -f "$BCB_PUBLIC_SITE" ] || die "missing $BCB_PUBLIC_SITE — run setup-nginx-tls.sh / setup-docker-bluegreen.sh first"
grep -q 'bcb_webapp' "$BCB_PUBLIC_SITE" || die "$BCB_PUBLIC_SITE has no bcb_webapp proxy_pass yet — deploy at least one colour before this cutover"

# Every key the Caddyfile references with {$VAR} (no default) must exist, or Caddy will fail to
# start with an error that names the file but not which line depends on the missing host fact.
for key in CADDY_ACME_EMAIL CADDY_PLATFORM_DOMAINS CADDY_ASK_URL CADDY_UPSTREAM; do
  grep -qE "^${key}=" "$CADDY_ENV_FILE" || die "$CADDY_ENV_FILE is missing $key"
done
CADDY_UPSTREAM_VALUE=$(sed -n 's/^CADDY_UPSTREAM=//p' "$CADDY_ENV_FILE" | tail -1)
INTERNAL_PORT="${CADDY_UPSTREAM_VALUE##*:}"
case "$INTERNAL_PORT" in
  ''|*[!0-9]*) die "CADDY_UPSTREAM in $CADDY_ENV_FILE is not host:port (got '$CADDY_UPSTREAM_VALUE')" ;;
esac
[[ "$CADDY_UPSTREAM_VALUE" == 127.0.0.1:* ]] || die "CADDY_UPSTREAM must be a 127.0.0.1 loopback address, got '$CADDY_UPSTREAM_VALUE' — it must never point at a publicly reachable address"

say "installing caddy (idempotent)"
if ! command -v caddy >/dev/null; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl gnupg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt-get install -y -qq caddy || die "caddy install failed"
fi
command -v caddy >/dev/null || die "caddy still not on PATH after install"

say "validating Caddyfile + env BEFORE touching the live public site"
install -d -m 0750 -o caddy -g caddy "$(sed -n 's/^CADDY_DATA_DIR=//p' "$CADDY_ENV_FILE" | tail -1)"
# `{$VAR}` in the Caddyfile is expanded from caddy's own process environment at load time — matching
# the pattern bcb-bluegreen-lib.sh already uses for reading env files (surface_host()) rather than
# depending on a specific `caddy validate` flag existing in whatever Caddy version apt installs.
( set -a; . "$CADDY_ENV_FILE"; set +a
  caddy validate --config "$CADDYFILE_SRC" --adapter caddyfile ) \
  || die "Caddyfile did not validate — nginx has NOT been touched"

say "backing up and replacing the public nginx site"
BACKUP="/etc/nginx/sites-available/bcb.pre-caddy.$(date +%s)"
cp "$BCB_PUBLIC_SITE" "$BACKUP"
info "previous public site saved at $BACKUP"
sed "s/__BCB_EDGE_INTERNAL_PORT__/$INTERNAL_PORT/" "$NGINX_TEMPLATE_SRC" > "$BCB_PUBLIC_SITE"
if ! nginx -t >/dev/null 2>&1; then
  cp "$BACKUP" "$BCB_PUBLIC_SITE"
  die "generated internal nginx site is invalid; restored $BACKUP unchanged — nothing else was touched"
fi
systemctl reload nginx || { cp "$BACKUP" "$BCB_PUBLIC_SITE"; nginx -t && systemctl reload nginx; die "nginx reload failed; restored previous public site"; }
say "nginx is now internal-only on 127.0.0.1:$INTERNAL_PORT"

say "installing Caddyfile and starting caddy"
install -d -m 0755 /etc/caddy
install -m 0644 "$CADDYFILE_SRC" "$CADDYFILE_DEST"
install -d -m 0755 /etc/systemd/system/caddy.service.d
cat > /etc/systemd/system/caddy.service.d/override.conf <<EOF
# Managed by deploy/host/prod/cutover-edge-to-caddy.sh. Loads the same non-secret operational values
# the Caddyfile expects via {\$VAR} — see deploy/env/.env.caddy.prod.example.
[Service]
EnvironmentFile=$CADDY_ENV_FILE
EOF
systemctl daemon-reload
systemctl enable --now caddy >/dev/null 2>&1
systemctl restart caddy || die "caddy failed to start — public 80/443 currently has NO listener; run rollback-edge-to-nginx.sh now"

say "verifying"
set +o pipefail
vfail=0
vcheck() { if eval "$2"; then echo "  ok   $1"; else echo "  FAIL $1"; vfail=1; fi; }

sleep 2
vcheck "caddy is active"                  'systemctl is-active caddy'
vcheck "caddy listening on 80"            'ss -tlnH | grep -q ":80 "'
vcheck "caddy listening on 443"           'ss -tlnH | grep -q ":443 "'
vcheck "nginx no longer bound publicly"   '! ss -tlnH | grep -E "0\.0\.0\.0:443|:::443" | grep -q .'
vcheck "internal nginx answers on loopback" "curl -fsS -o /dev/null -H 'Host: therapysto.ru' http://127.0.0.1:$INTERNAL_PORT/"
# End-to-end through the new public path: Caddy's plain-HTTP block responds immediately (it does not
# wait on ACME issuance the way a TLS handshake for a brand-new cert would), and a redirect to https
# for a known platform Host proves the request reached Caddy's routing rather than a stale listener.
vcheck "caddy routes a known platform Host" \
  "[ \"\$(curl -s -o /dev/null -w '%{http_code}' -H 'Host: therapysto.ru' http://127.0.0.1:80/)\" = 308 ] || \
   [ \"\$(curl -s -o /dev/null -w '%{http_code}' -H 'Host: therapysto.ru' http://127.0.0.1:80/)\" = 301 ]"

[ "$vfail" = 0 ] && say "DONE — Caddy is the public edge; nginx forwards to it unchanged on the loopback." \
  || die "one or more checks failed — see above; rollback-edge-to-nginx.sh reverts to the pre-cutover nginx site"
