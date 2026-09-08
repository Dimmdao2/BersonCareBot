#!/usr/bin/env bash
# Apply the split Therapysto/Therapygo TEST nginx surfaces on 151.241.228.122.
# Default is a read-only render/check; --apply changes only the two named TEST vhosts.
set -euo pipefail

EXPECTED_HOST_IP="151.241.228.122"
STAFF_HOST="test.therapysto.ru"
ADMIN_HOST="admin.test.therapysto.ru"
PATIENT_HOST="test.therapygo.ru"
KNOWN_TENANT_HOST="berson.test.therapygo.ru"
LEGACY_HOST="test.bersoncare.ru"
SURFACE_CERT="/etc/letsencrypt/live/therapysto-test-surfaces"
LEGACY_CERT="/etc/letsencrypt/live/test.bersoncare.ru"
SURFACE_AVAILABLE="/etc/nginx/sites-available/therapysto-test-surfaces"
SURFACE_ENABLED="/etc/nginx/sites-enabled/therapysto-test-surfaces"
LEGACY_AVAILABLE="/etc/nginx/sites-available/test.bersoncare.ru"
LEGACY_ENABLED="/etc/nginx/sites-enabled/test.bersoncare.ru"
BACKUP_ROOT="/var/backups/bersoncare-test-surface-nginx"
WEBAPP_UPSTREAM="http://127.0.0.1:6300"
INTEGRATOR_UPSTREAM="http://127.0.0.1:3300"
A2_CHECKER="docs/_TODO/SAAS_FOUNDATION/scripts/check-saas-a2-nginx-forwarded-host.mjs"
ACTION="dry-run"

usage() {
  cat <<'EOF'
Usage:
  bash deploy/host/apply-test-surface-domains.sh [--dry-run]
  bash deploy/host/apply-test-surface-domains.sh --apply

The certificate must already exist at
/etc/letsencrypt/live/therapysto-test-surfaces and cover the four exact TEST
surface names. Wildcard clinic TLS is a separate DNS-01 step.
EOF
}

fatal() { echo "FATAL: $*" >&2; exit 1; }
log() { echo "== [apply-test-surface-domains] $* =="; }

while [ "$#" -gt 0 ]; do
  case "$1" in
    --dry-run) ACTION="dry-run" ;;
    --apply) ACTION="apply" ;;
    --help|-h) usage; exit 0 ;;
    *) fatal "unknown argument: $1" ;;
  esac
  shift
done

assert_test_only() {
  hostname -I | tr ' ' '\n' | grep -Fxq "$EXPECTED_HOST_IP" \
    || fatal "this script targets only TEST host $EXPECTED_HOST_IP"
  [ "$WEBAPP_UPSTREAM" = "http://127.0.0.1:6300" ] || fatal "unexpected webapp upstream"
  [ "$INTEGRATOR_UPSTREAM" = "http://127.0.0.1:3300" ] || fatal "unexpected integrator upstream"
  [ -f "$A2_CHECKER" ] || fatal "missing A2 checker: $A2_CHECKER"
  [ -f "$LEGACY_AVAILABLE" ] || fatal "missing legacy TEST vhost: $LEGACY_AVAILABLE"
  [ "$(readlink -f "$LEGACY_ENABLED")" = "$LEGACY_AVAILABLE" ] \
    || fatal "$LEGACY_ENABLED must point to $LEGACY_AVAILABLE"
}

assert_cert_covers() {
  local cert="$1"; shift
  sudo test -s "$cert/fullchain.pem" || fatal "missing certificate: $cert/fullchain.pem"
  sudo test -s "$cert/privkey.pem" || fatal "missing private key: $cert/privkey.pem"
  local hostname
  for hostname in "$@"; do
    sudo openssl x509 -in "$cert/fullchain.pem" -noout -checkhost "$hostname" >/dev/null \
      || fatal "$cert does not cover $hostname"
  done
  sudo openssl x509 -in "$cert/fullchain.pem" -noout -checkend 86400 >/dev/null \
    || fatal "$cert expires in less than 24 hours"
}

render_surface_vhost() {
  local output="$1"
  cat >"$output" <<'NGINX'
# Split TEST product surfaces: Therapysto staff/admin + Therapygo patient/known tenant.
# Source: deploy/host/apply-test-surface-domains.sh
server {
    listen 80;
    server_name test.therapysto.ru admin.test.therapysto.ru test.therapygo.ru berson.test.therapygo.ru;
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://$host$request_uri; }
}

server {
    listen 443 ssl http2;
    server_name test.therapysto.ru admin.test.therapysto.ru test.therapygo.ru berson.test.therapygo.ru;

    access_log /var/log/nginx/bersoncare-test-webapp-access.log bersoncare_webapp_detailed;
    ssl_certificate     /etc/letsencrypt/live/therapysto-test-surfaces/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/therapysto-test-surfaces/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    allow 10.9.0.0/24;
    allow 172.31.9.0/24;
    allow 172.17.0.0/16;
    allow 151.241.228.122;
    allow 127.0.0.1;
    deny all;

    client_max_body_size 55m;
    error_page 502 503 504 =200 /maintenance.html;

    location = /maintenance.html {
        alias /opt/projects/bersoncarebot-test/apps/webapp/public/maintenance.html;
        internal;
        default_type text/html;
        charset utf-8;
        add_header Cache-Control "no-store" always;
        add_header Retry-After "60" always;
    }

    location ~ ^/(health|internal|api/bersoncare|api/telegram) {
        proxy_pass http://127.0.0.1:3300;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }

    location ~ ^/api/payments/(?:saas-webhook|webhook|patient-acquiring-webhook)/yookassa$ {
        allow 10.9.0.0/24;
        allow 172.31.9.0/24;
        allow 172.17.0.0/16;
        allow 151.241.228.122;
        allow 127.0.0.1;
        allow 185.71.76.0/27;
        allow 185.71.77.0/27;
        allow 77.75.153.0/25;
        allow 77.75.156.11/32;
        allow 77.75.156.35/32;
        allow 77.75.154.128/25;
        allow 2a02:5180::/32;
        deny all;

        proxy_pass http://127.0.0.1:6300;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }

    location / {
        proxy_pass http://127.0.0.1:6300;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }
}
NGINX
}

render_legacy_vhost() {
  local output="$1"
  cat >"$output" <<'NGINX'
# Transitional legacy TEST host. Browser routes move to the split product domains;
# the existing payment callback remains live while provider configuration catches up.
# Source: deploy/host/apply-test-surface-domains.sh
server {
    listen 80;
    server_name test.bersoncare.ru;
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://$host$request_uri; }
}

server {
    listen 443 ssl http2;
    server_name test.bersoncare.ru;
    ssl_certificate     /etc/letsencrypt/live/test.bersoncare.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/test.bersoncare.ru/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    allow 10.9.0.0/24;
    allow 172.31.9.0/24;
    allow 172.17.0.0/16;
    allow 151.241.228.122;
    allow 127.0.0.1;
    deny all;

    location ~ ^/api/payments/(?:saas-webhook|webhook|patient-acquiring-webhook)/yookassa$ {
        allow 10.9.0.0/24;
        allow 172.31.9.0/24;
        allow 172.17.0.0/16;
        allow 151.241.228.122;
        allow 127.0.0.1;
        allow 185.71.76.0/27;
        allow 185.71.77.0/27;
        allow 77.75.153.0/25;
        allow 77.75.156.11/32;
        allow 77.75.156.35/32;
        allow 77.75.154.128/25;
        allow 2a02:5180::/32;
        deny all;
        proxy_pass http://127.0.0.1:6300;
        proxy_set_header Host test.therapysto.ru;
        proxy_set_header X-Forwarded-Host test.therapysto.ru;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location ~ ^/(?:app/patient|book|join|live|setup)(?:/|$) {
        return 307 https://test.therapygo.ru$request_uri;
    }
    location / {
        return 307 https://test.therapysto.ru$request_uri;
    }
}
NGINX
}

install_root_file() {
  local source="$1" target="$2" tmp
  tmp="$(sudo mktemp "${target}.tmp.XXXXXX")"
  sudo install -m 0644 -o root -g root "$source" "$tmp"
  sudo mv -f -- "$tmp" "$target"
}

assert_test_only
assert_cert_covers "$SURFACE_CERT" "$STAFF_HOST" "$ADMIN_HOST" "$PATIENT_HOST" "$KNOWN_TENANT_HOST"
assert_cert_covers "$LEGACY_CERT" "$LEGACY_HOST"

surface_rendered="$(mktemp /tmp/therapysto-test-surfaces.XXXXXX)"
legacy_rendered="$(mktemp /tmp/bersoncare-test-legacy.XXXXXX)"
combined_rendered="$(mktemp /tmp/therapysto-test-nginx-combined.XXXXXX)"
cleanup() { rm -f "$surface_rendered" "$legacy_rendered" "$combined_rendered"; }
trap cleanup EXIT
render_surface_vhost "$surface_rendered"
render_legacy_vhost "$legacy_rendered"
cat "$surface_rendered" "$legacy_rendered" >"$combined_rendered"
node "$A2_CHECKER" --nginx-dump="$combined_rendered"

if [ "$ACTION" = "dry-run" ]; then
  log "dry-run OK"
  echo "   surfaces: $STAFF_HOST $ADMIN_HOST $PATIENT_HOST $KNOWN_TENANT_HOST"
  echo "   legacy:   $LEGACY_HOST -> split domains"
  echo "   apply:    bash deploy/host/apply-test-surface-domains.sh --apply"
  exit 0
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_dir="$BACKUP_ROOT/$timestamp"
sudo install -d -m 0700 -o root -g root "$backup_dir"
sudo cp -a -- "$LEGACY_AVAILABLE" "$backup_dir/test.bersoncare.ru"
if sudo test -e "$SURFACE_AVAILABLE"; then
  sudo cp -a -- "$SURFACE_AVAILABLE" "$backup_dir/therapysto-test-surfaces"
fi

restore() {
  sudo cp -a -- "$backup_dir/test.bersoncare.ru" "$LEGACY_AVAILABLE"
  if sudo test -e "$backup_dir/therapysto-test-surfaces"; then
    sudo cp -a -- "$backup_dir/therapysto-test-surfaces" "$SURFACE_AVAILABLE"
    sudo ln -sfn "$SURFACE_AVAILABLE" "$SURFACE_ENABLED"
  else
    sudo rm -f -- "$SURFACE_AVAILABLE" "$SURFACE_ENABLED"
  fi
  sudo nginx -t >/dev/null 2>&1 && sudo systemctl reload nginx >/dev/null 2>&1 || true
}

log "install split TEST vhosts"
install_root_file "$surface_rendered" "$SURFACE_AVAILABLE"
install_root_file "$legacy_rendered" "$LEGACY_AVAILABLE"
sudo ln -sfn "$SURFACE_AVAILABLE" "$SURFACE_ENABLED"
sudo ln -sfn "$LEGACY_AVAILABLE" "$LEGACY_ENABLED"
if ! sudo nginx -t; then restore; fatal "nginx validation failed; previous vhosts restored"; fi
if ! sudo systemctl reload nginx; then restore; fatal "nginx reload failed; previous vhosts restored"; fi

active_dump="$(mktemp /tmp/therapysto-test-nginx-active.XXXXXX)"
sudo nginx -T >"$active_dump" 2>/dev/null
node "$A2_CHECKER" --nginx-dump="$active_dump"
rm -f "$active_dump"
log "apply OK; backup: $backup_dir"
