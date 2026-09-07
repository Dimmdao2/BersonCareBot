#!/bin/bash
# Atomic cutover of public 80/443 from nginx to the pinned Caddy TLS edge on
# 135.106.187.95. Run as root only after explicit owner authorization.
#
# The installed pipeline owns every file used below. Caddy keeps public TLS;
# loopback-only nginx keeps the existing blue/green bcb_webapp upstream switch.
set -euo pipefail

BCB_ROOT=/opt/bersoncarebot
BCB_ENV_DIR="$BCB_ROOT/env"
BCB_PIPELINE="$BCB_ROOT/pipeline"
BCB_PUBLIC_SITE=/etc/nginx/sites-available/bcb
CADDY_ENV_FILE="$BCB_ENV_DIR/caddy.prod"
CADDYFILE_DEST=/etc/caddy/Caddyfile
CADDY_BINARY=/usr/local/bin/bcb-caddy
CADDY_SERVICE=bersoncarebot-caddy-edge.service
CADDY_HEALTH_TIMER=bersoncarebot-caddy-edge-health.timer

say()  { printf '\033[1m==>\033[0m %s\n' "$*"; }
info() { printf '    %s\n' "$*"; }
die()  { printf '\033[31mFATAL: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" = 0 ] || die "must run as root"
[ -f /etc/bcb-pipeline.conf ] || die "pipeline not installed (run setup-docker-bluegreen.sh first)"
. /etc/bcb-pipeline.conf
[ -f "$BCB_PIPELINE/bcb-bluegreen-lib.sh" ] || die "pipeline library missing at $BCB_PIPELINE/bcb-bluegreen-lib.sh"
. "$BCB_PIPELINE/bcb-bluegreen-lib.sh"
require_prod_host

CADDYFILE_SRC="$BCB_PIPELINE/Caddyfile.template"
NGINX_TEMPLATE_SRC="$BCB_PIPELINE/bcb-internal.conf.template"
CADDY_BUILD="$BCB_PIPELINE/build-caddy-edge.sh"

say "preflight"
for file in "$CADDYFILE_SRC" "$NGINX_TEMPLATE_SRC" "$CADDY_BUILD" \
            "$BCB_PIPELINE/bersoncarebot-caddy-edge.service" \
            "$BCB_PIPELINE/bersoncarebot-caddy-edge-health.service" \
            "$BCB_PIPELINE/bersoncarebot-caddy-edge-health.timer"; do
  [ -f "$file" ] || die "missing installed edge asset: $file"
done
[ -x "$CADDY_BUILD" ] || die "not executable: $CADDY_BUILD"
[ -f "$CADDY_ENV_FILE" ] || die "missing $CADDY_ENV_FILE"
[ -f "$BCB_PUBLIC_SITE" ] || die "missing $BCB_PUBLIC_SITE"
grep -q 'bcb_webapp' "$BCB_PUBLIC_SITE" || die "$BCB_PUBLIC_SITE has no bcb_webapp proxy_pass yet"
for key in CADDY_ACME_EMAIL CADDY_PLATFORM_DOMAINS CADDY_REGRU_USERNAME CADDY_REGRU_PASSWORD CADDY_ASK_URL CADDY_UPSTREAM; do
  grep -qE "^${key}=" "$CADDY_ENV_FILE" || die "$CADDY_ENV_FILE is missing $key"
done
CADDY_UPSTREAM_VALUE=$(sed -n 's/^CADDY_UPSTREAM=//p' "$CADDY_ENV_FILE" | tail -1)
INTERNAL_PORT="${CADDY_UPSTREAM_VALUE##*:}"
case "$INTERNAL_PORT" in
  ''|*[!0-9]*) die "CADDY_UPSTREAM is not host:port" ;;
esac
[[ "$CADDY_UPSTREAM_VALUE" == 127.0.0.1:* ]] || die "CADDY_UPSTREAM must be loopback-only"

say "building pinned Caddy v2.11.2 + REG.RU module v0.1.10"
getent group caddy >/dev/null || groupadd --system caddy
id caddy >/dev/null 2>&1 || useradd --system --gid caddy --home-dir /var/lib/caddy --shell /usr/sbin/nologin caddy
"$CADDY_BUILD" --output "$CADDY_BINARY" || die "pinned Caddy build failed"
chown root:root "$CADDY_BINARY"
chmod 0755 "$CADDY_BINARY"

say "validating Caddyfile + root-owned env before touching nginx"
install -d -m 0750 -o caddy -g caddy "$(sed -n 's/^CADDY_DATA_DIR=//p' "$CADDY_ENV_FILE" | tail -1)"
(
  set -a
  . "$CADDY_ENV_FILE"
  set +a
  "$CADDY_BINARY" validate --config "$CADDYFILE_SRC" --adapter caddyfile
) || die "Caddyfile did not validate — nginx has NOT been touched"

say "backing up and replacing the public nginx site"
BACKUP="/etc/nginx/sites-available/bcb.pre-caddy.$(date +%s)"
cp "$BCB_PUBLIC_SITE" "$BACKUP"
info "previous public site saved at $BACKUP"
sed "s/__BCB_EDGE_INTERNAL_PORT__/$INTERNAL_PORT/" "$NGINX_TEMPLATE_SRC" > "$BCB_PUBLIC_SITE"
if ! nginx -t >/dev/null 2>&1; then
  cp "$BACKUP" "$BCB_PUBLIC_SITE"
  die "generated internal nginx site is invalid; restored $BACKUP unchanged"
fi
systemctl reload nginx || {
  cp "$BACKUP" "$BCB_PUBLIC_SITE"
  nginx -t && systemctl reload nginx
  die "nginx reload failed; restored previous public site"
}

say "installing Caddy edge and its health timer"
install -d -m 0755 /etc/caddy
install -m 0644 "$CADDYFILE_SRC" "$CADDYFILE_DEST"
install -m 0644 "$BCB_PIPELINE/bersoncarebot-caddy-edge.service" "/etc/systemd/system/$CADDY_SERVICE"
install -m 0644 "$BCB_PIPELINE/bersoncarebot-caddy-edge-health.service" /etc/systemd/system/bersoncarebot-caddy-edge-health.service
install -m 0644 "$BCB_PIPELINE/bersoncarebot-caddy-edge-health.timer" "/etc/systemd/system/$CADDY_HEALTH_TIMER"
systemctl daemon-reload
systemctl enable --now "$CADDY_SERVICE" >/dev/null 2>&1
systemctl restart "$CADDY_SERVICE" || die "Caddy failed to start — run rollback-edge-to-nginx.sh now"
systemctl enable --now "$CADDY_HEALTH_TIMER" >/dev/null 2>&1

say "verifying"
set +o pipefail
vfail=0
vcheck() { if eval "$2"; then echo "  ok   $1"; else echo "  FAIL $1"; vfail=1; fi; }

sleep 2
vcheck "Caddy edge is active"              "systemctl is-active --quiet $CADDY_SERVICE"
vcheck "caddy listening on 80"              'ss -tlnH | grep -q ":80 "'
vcheck "caddy listening on 443"             'ss -tlnH | grep -q ":443 "'
vcheck "nginx no longer bound publicly"     '! ss -tlnH | grep -E "0\\.0\\.0\\.0:443|:::443" | grep -q .'
vcheck "internal nginx answers on loopback" "curl -fsS -o /dev/null -H 'Host: therapysto.ru' http://127.0.0.1:$INTERNAL_PORT/"
vcheck "caddy routes a known platform Host" \
  "[ \"\$(curl -s -o /dev/null -w '%{http_code}' -H 'Host: therapysto.ru' http://127.0.0.1:80/)\" = 308 ] || \
   [ \"\$(curl -s -o /dev/null -w '%{http_code}' -H 'Host: therapysto.ru' http://127.0.0.1:80/)\" = 301 ]"
vcheck "edge health timer is active"        "systemctl is-active --quiet $CADDY_HEALTH_TIMER"
vcheck "edge health timer is enabled"       "systemctl is-enabled --quiet $CADDY_HEALTH_TIMER"

[ "$vfail" = 0 ] && say "DONE — Caddy is the public edge and the health timer is enabled." \
  || die "one or more checks failed — rollback-edge-to-nginx.sh restores the pre-cutover nginx site"
