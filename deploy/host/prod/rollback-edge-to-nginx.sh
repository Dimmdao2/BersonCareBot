#!/bin/bash
# Reverts deploy/host/prod/cutover-edge-to-caddy.sh: stops caddy, restores nginx as the public
# listener on 80/443 from the most recent pre-cutover backup, and verifies nginx is serving again.
# Run as root on 135.106.187.95.
#
#   bash rollback-edge-to-nginx.sh                 # use the most recent therapysto.pre-caddy.* backup
#   bash rollback-edge-to-nginx.sh /path/to/backup  # use a specific one
#
# This does not touch the blue-green pipeline, docker, or any deployed colour — only the nginx site
# file and the Caddy edge service/timer. Whatever colour was live before the cutover is still live
# after this.
set -uo pipefail

THERAPYSTO_PUBLIC_SITE=/etc/nginx/sites-available/therapysto

say()  { printf '\033[1m==>\033[0m %s\n' "$*"; }
info() { printf '    %s\n' "$*"; }
die()  { printf '\033[31mFATAL: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" = 0 ] || die "must run as root"
[ -f /etc/therapysto-pipeline.conf ] || die "pipeline not installed"

BACKUP="${1:-}"
if [ -z "$BACKUP" ]; then
  BACKUP=$(ls -1t /etc/nginx/sites-available/therapysto.pre-caddy.* 2>/dev/null | head -1)
fi
[ -n "$BACKUP" ] && [ -f "$BACKUP" ] || die "no therapysto.pre-caddy.* backup found; pass one explicitly"
info "restoring from $BACKUP"

say "stopping Caddy edge and its health timer"
systemctl disable --now therapysto-caddy-edge-health.timer 2>/dev/null || true
systemctl disable --now therapysto-caddy-edge.service 2>/dev/null || true

say "restoring the public nginx site"
cp "$BACKUP" "$THERAPYSTO_PUBLIC_SITE"
nginx -t || die "restored nginx site is invalid — this should not happen; $BACKUP itself may be corrupt"
systemctl reload nginx || systemctl restart nginx || die "nginx did not come back after restore"

say "verifying"
set +o pipefail
vfail=0
vcheck() { if eval "$2"; then echo "  ok   $1"; else echo "  FAIL $1"; vfail=1; fi; }

sleep 1
vcheck "Caddy edge is stopped"     '! systemctl is-active --quiet therapysto-caddy-edge.service'
vcheck "edge health timer stopped" '! systemctl is-active --quiet therapysto-caddy-edge-health.timer'
vcheck "nginx listening on 80"     'ss -tlnH | grep -q ":80 "'
vcheck "nginx listening on 443"    'ss -tlnH | grep -q ":443 "'

[ "$vfail" = 0 ] && say "DONE — nginx is the public edge again, exactly as before the cutover." \
  || die "rollback verification failed — investigate before assuming the host is serving traffic"
