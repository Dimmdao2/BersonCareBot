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
# repository-owned therapysto-caddy-edge-health.timer, separately from the application's external
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

if ! systemctl is-active --quiet therapysto-caddy-edge.service; then
  bad "therapysto-caddy-edge.service" "not active"
  exit 1
fi
ok "therapysto-caddy-edge.service active"

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
DATA_DIR="${CADDY_DATA_DIR:-/opt/therapysto/state/caddy}"
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

# coturn держит СОБСТВЕННУЮ копию сертификата на turn: он работает под не-root учёткой и до хранилища
# Caddy не дотягивается. Копию обновляет therapysto-turn-cert-sync.timer. Если таймер молча встанет,
# в хранилище Caddy всё будет свежим, а видео однажды перестанет соединяться по TLS — поэтому копию
# проверяем отдельно, и отдельно проверяем, что она совпадает с тем, что держит Caddy.
TURN_DOMAIN="${CADDY_TURN_DOMAIN:-turn.therapysto.ru}"
COTURN_CERT="${COTURN_TLS_DIR:-/etc/therapysto/jitsi-prod/config/coturn/tls}/fullchain.pem"
if [ -s "$COTURN_CERT" ]; then
  end_epoch=$(openssl x509 -noout -enddate -in "$COTURN_CERT" 2>/dev/null | sed 's/^notAfter=//' | xargs -I{} date -d "{}" +%s 2>/dev/null)
  if [ -z "$end_epoch" ]; then
    bad "coturn copy" "could not read expiry of $COTURN_CERT"
  else
    days_left=$(( (end_epoch - $(date +%s)) / 86400 ))
    if [ "$days_left" -lt "$WARN_DAYS" ]; then
      bad "coturn copy ($TURN_DOMAIN)" "expires in $days_left days — the turn cert sync timer is probably not running"
    else
      ok "coturn copy ($TURN_DOMAIN) — $days_left days left"
    fi
  fi
  store_cert=$(find "$CERT_ROOT" -type f -path "*/$TURN_DOMAIN/$TURN_DOMAIN.crt" 2>/dev/null | sort | head -1)
  if [ -z "$store_cert" ]; then
    bad "coturn copy ($TURN_DOMAIN)" "Caddy holds no certificate for this name — nothing renews it"
  elif ! cmp -s "$store_cert" "$COTURN_CERT"; then
    bad "coturn copy ($TURN_DOMAIN)" "differs from what Caddy holds — run sync-coturn-tls.sh"
  else
    ok "coturn copy matches the Caddy store"
  fi
else
  bad "coturn copy" "$COTURN_CERT is missing — video TLS has no certificate"
fi

exit "$fail"
