#!/bin/bash
# Read-only edge-health probe for the on-demand TLS edge: is caddy up, and how many days are left on
# every certificate it is currently holding. Complements, and does not replace or duplicate, the
# application's own apps/webapp/src/app/api/internal/domain-health/tick route: that route externally
# probes each org-configured hostname's DNS+cert independent of what is running this edge; this
# script instead asks Caddy's own certificate store what it currently holds, which is the only place
# an edge-process failure (crashed, config drifted, storage lost) would show up before any org's
# hostname probe does.
#
# Exit non-zero on: caddy not active, not listening on 80/443, admin API unreachable, or any held
# certificate within CADDY_CERT_EXPIRY_WARN_DAYS (default 14) of expiring. It is scheduled by the
# repository-owned bersoncarebot-caddy-edge-health.timer, separately from the application's external
# per-domain monitor and without an ad-hoc crontab entry.
#
#   bash check-caddy-edge-health.sh [--warn-days N]
set -uo pipefail

ADMIN_BASE="${CADDY_ADMIN_BASE:-http://127.0.0.1:2019}"
WARN_DAYS="${CADDY_CERT_EXPIRY_WARN_DAYS:-14}"
[ "${1:-}" = "--warn-days" ] && WARN_DAYS="${2:?--warn-days needs a number}"

fail=0
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
bad()  { printf '  \033[31m✗\033[0m %s — %s\n' "$1" "$2"; fail=1; }

if ! systemctl is-active --quiet bersoncarebot-caddy-edge.service; then
  bad "bersoncarebot-caddy-edge.service" "not active"
  exit 1
fi
ok "bersoncarebot-caddy-edge.service active"

for port in 80 443; do
  if ss -tlnH 2>/dev/null | grep -q ":$port "; then
    ok "listening on $port"
  else
    bad "listening on $port" "no socket found"
  fi
done

# The admin API is bound to loopback only by Caddy's default (never exposed by this change to
# anything but this host), so this call only ever reaches it from a session already on the box.
CONFIG_JSON=$(curl -fsS -m 5 "$ADMIN_BASE/config/" 2>/dev/null) || {
  bad "admin API ($ADMIN_BASE)" "unreachable — cannot enumerate held certificates"
  exit 1
}
ok "admin API reachable"

# Caddy does not expose a single "list every cert + expiry" admin endpoint; the certificates
# themselves are PEM files under CADDY_DATA_DIR. Reading the files directly is the documented way to
# audit what Caddy is actually holding, independent of what the config claims it manages.
DATA_DIR="${CADDY_DATA_DIR:-/opt/bersoncarebot/state/caddy}"
CERT_ROOT="$DATA_DIR/certificates"
if [ ! -d "$CERT_ROOT" ]; then
  bad "certificate store" "$CERT_ROOT does not exist yet — no certificate has been issued"
  exit 1
fi

found=0
while IFS= read -r -d '' crt; do
  found=1
  subject=$(openssl x509 -noout -subject -in "$crt" 2>/dev/null | sed 's/^subject=//')
  end_epoch=$(openssl x509 -noout -enddate -in "$crt" 2>/dev/null | sed 's/^notAfter=//' | xargs -I{} date -d "{}" +%s 2>/dev/null)
  if [ -z "$end_epoch" ]; then
    bad "$crt" "could not read expiry"
    continue
  fi
  days_left=$(( (end_epoch - $(date +%s)) / 86400 ))
  if [ "$days_left" -lt 0 ]; then
    bad "$subject" "EXPIRED $(( -days_left )) days ago"
  elif [ "$days_left" -lt "$WARN_DAYS" ]; then
    bad "$subject" "expires in $days_left days (< ${WARN_DAYS}d threshold) — renewal likely failing"
  else
    ok "$subject — $days_left days left"
  fi
done < <(find "$CERT_ROOT" -type f -name '*.crt' -print0 2>/dev/null)

[ "$found" = 1 ] || bad "certificate store" "$CERT_ROOT exists but holds no .crt files"

exit "$fail"
