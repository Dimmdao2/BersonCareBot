#!/usr/bin/env bash
# apply-test-nginx-webapp.sh — repo-managed TEST nginx vhost apply path.
#
# Scope is deliberately narrow:
#   - TEST host only: test.bersoncare.ru
#   - TEST upstreams only: integrator 127.0.0.1:3300, webapp 127.0.0.1:6300
#   - default action is dry-run; --apply is required to touch /etc/nginx
#   - no production vhost, env file, database, or service is touched
set -euo pipefail

SERVER_NAME="test.bersoncare.ru"
TARGET_AVAILABLE="/etc/nginx/sites-available/test.bersoncare.ru"
TARGET_ENABLED="/etc/nginx/sites-enabled/test.bersoncare.ru"
PROJECT_ROOT="/opt/projects/bersoncarebot-test"
WEBAPP_UPSTREAM="http://127.0.0.1:6300"
INTEGRATOR_UPSTREAM="http://127.0.0.1:3300"
WEBAPP_ACCESS_LOG="/var/log/nginx/bersoncare-test-webapp-access.log"
WEBAPP_LOG_FORMAT="bersoncare_webapp_detailed"
WEBAPP_LOG_FORMAT_CONF="/etc/nginx/conf.d/bersoncare-webapp-access-log-format.conf"
REPO_LOG_FORMAT_EXAMPLE="deploy/nginx/bersoncare-webapp-access-log.example.conf"
A2_CHECKER="docs/_TODO/SAAS_FOUNDATION/scripts/check-saas-a2-nginx-forwarded-host.mjs"
ACTION="dry-run"

usage() {
  cat <<'EOF'
Usage:
  bash deploy/host/apply-test-nginx-webapp.sh [--dry-run]
  bash deploy/host/apply-test-nginx-webapp.sh --apply

Default is --dry-run. --apply backs up the active TEST vhost, installs the
repo-managed TEST vhost, runs nginx -t, reloads nginx only on success, then
runs the SaaS A2 forwarded-host checker against nginx -T.
EOF
}

log() {
  echo "== [apply-test-nginx-webapp] $* =="
}

fatal() {
  echo "FATAL: $*" >&2
  exit 1
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --help|-h)
      usage
      exit 0
      ;;
    --dry-run)
      ACTION="dry-run"
      ;;
    --apply)
      ACTION="apply"
      ;;
    *)
      fatal "unknown argument: $1"
      ;;
  esac
  shift
done

assert_test_only() {
  [ "$SERVER_NAME" = "test.bersoncare.ru" ] || fatal "SERVER_NAME must be test.bersoncare.ru"
  [ "$TARGET_AVAILABLE" = "/etc/nginx/sites-available/test.bersoncare.ru" ] || fatal "TARGET_AVAILABLE must be the TEST vhost path"
  [ "$TARGET_ENABLED" = "/etc/nginx/sites-enabled/test.bersoncare.ru" ] || fatal "TARGET_ENABLED must be the TEST enabled vhost path"
  [ "$PROJECT_ROOT" = "/opt/projects/bersoncarebot-test" ] || fatal "PROJECT_ROOT must be TEST project root"
  [ "$WEBAPP_UPSTREAM" = "http://127.0.0.1:6300" ] || fatal "WEBAPP_UPSTREAM must be TEST webapp upstream"
  [ "$INTEGRATOR_UPSTREAM" = "http://127.0.0.1:3300" ] || fatal "INTEGRATOR_UPSTREAM must be TEST integrator upstream"

  case "$TARGET_AVAILABLE $TARGET_ENABLED $PROJECT_ROOT $WEBAPP_UPSTREAM $INTEGRATOR_UPSTREAM" in
    *prod*|*main*|*bersoncarebot-webapp*|*127.0.0.1:6200*|*127.0.0.1:3200*)
      fatal "refusing production-looking nginx target or upstream"
      ;;
  esac
}

assert_repo_log_format_example_present() {
  [ -f "$REPO_LOG_FORMAT_EXAMPLE" ] || fatal "missing repo log format example: $REPO_LOG_FORMAT_EXAMPLE"
}

ensure_webapp_access_log_format() {
  local rendered_format
  rendered_format="$(mktemp /tmp/bcb-test-nginx-log-format.XXXXXX)"
  awk '
    /^log_format bersoncare_webapp_detailed/ { in_block=1 }
    in_block { print }
    in_block && /;$/ { exit }
  ' "$REPO_LOG_FORMAT_EXAMPLE" >"$rendered_format"
  grep -q '^log_format bersoncare_webapp_detailed' "$rendered_format" \
    || fatal "repo log format example did not render bersoncare_webapp_detailed"

  if [ -f "$WEBAPP_LOG_FORMAT_CONF" ] \
    && sudo cmp -s "$rendered_format" "$WEBAPP_LOG_FORMAT_CONF"; then
    echo "   log format unchanged: $WEBAPP_LOG_FORMAT_CONF"
    rm -f "$rendered_format"
    return 0
  fi

  log "install webapp access log format ($WEBAPP_LOG_FORMAT)"
  local tmp_format
  tmp_format="$(sudo mktemp "${WEBAPP_LOG_FORMAT_CONF}.tmp.XXXXXX")"
  sudo install -m 0644 -o root -g root "$rendered_format" "$tmp_format"
  sudo mv -f -- "$tmp_format" "$WEBAPP_LOG_FORMAT_CONF"
  rm -f "$rendered_format"
}

assert_active_test_vhost_present() {
  [ -f "$TARGET_AVAILABLE" ] || fatal "missing TEST nginx config: $TARGET_AVAILABLE"
  [ -e "$TARGET_ENABLED" ] || fatal "missing enabled TEST nginx config: $TARGET_ENABLED"
  [ "$(readlink -f "$TARGET_ENABLED")" = "$TARGET_AVAILABLE" ] || fatal "$TARGET_ENABLED must point to $TARGET_AVAILABLE"
  sudo test -r "$TARGET_AVAILABLE" || fatal "cannot read active TEST nginx config: $TARGET_AVAILABLE"
  sudo grep -q "server_name[[:space:]]\\+$SERVER_NAME" "$TARGET_AVAILABLE" || fatal "active config is not for $SERVER_NAME"
  sudo grep -q "proxy_pass[[:space:]]\\+$WEBAPP_UPSTREAM" "$TARGET_AVAILABLE" || fatal "active config does not point to TEST webapp upstream"
  sudo grep -q "proxy_pass[[:space:]]\\+$INTEGRATOR_UPSTREAM" "$TARGET_AVAILABLE" || fatal "active config does not point to TEST integrator upstream"
}

render_config() {
  local output="$1"
  cat >"$output" <<'NGINX'
# =============================================================================
# nginx vhost: test.bersoncare.ru
# Purpose: reverse proxy for the test BersonCareBot environment on 151.241.228.122
# Source:  deploy/host/apply-test-nginx-webapp.sh
# Access:  IP-allowlist — only owner VPN / loopback TEST traffic should reach this vhost
# =============================================================================

server {
    listen 80;
    server_name test.bersoncare.ru;
    return 301 https://$host$request_uri;
}

server {
    # This host runs nginx < 1.25.1; keep the combined ssl/http2 directive form.
    listen 443 ssl http2;
    server_name test.bersoncare.ru;

    access_log /var/log/nginx/bersoncare-test-webapp-access.log bersoncare_webapp_detailed;

    ssl_certificate     /etc/letsencrypt/live/test.bersoncare.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/test.bersoncare.ru/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    allow 10.9.0.0/24;
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

    # YooKassa callbacks originate from documented provider networks, not the
    # owner VPN. Keep this exception limited to the three existing webhook
    # routes; all other TEST traffic remains covered by the server-level deny.
    location ~ ^/api/payments/(?:saas-webhook|webhook|patient-acquiring-webhook)/yookassa$ {
        allow 10.9.0.0/24;
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

run_a2_checker_on_file() {
  local config_file="$1"
  node "$A2_CHECKER" --nginx-dump="$config_file"
}

dump_and_check_active_nginx() {
  local dump_file
  dump_file="$(mktemp /tmp/bcb-test-nginx-active.XXXXXX)"
  sudo nginx -T >"$dump_file" 2>/tmp/bcb-test-nginx-active.err
  run_a2_checker_on_file "$dump_file"
  rm -f "$dump_file" /tmp/bcb-test-nginx-active.err
}

rendered="$(mktemp /tmp/bcb-test-nginx-rendered.XXXXXX)"
tmp_target=""
cleanup() {
  rm -f "$rendered"
  if [ -n "${tmp_target:-}" ]; then
    sudo rm -f -- "$tmp_target" 2>/dev/null || true
  fi
}
trap cleanup EXIT

assert_test_only
assert_repo_log_format_example_present
assert_active_test_vhost_present
render_config "$rendered"
run_a2_checker_on_file "$rendered"

if [ "$ACTION" = "dry-run" ]; then
  log "dry-run OK"
  echo "   target: $TARGET_AVAILABLE"
  echo "   enabled: $TARGET_ENABLED -> $(readlink -f "$TARGET_ENABLED")"
  echo "   apply:  bash deploy/host/apply-test-nginx-webapp.sh --apply"
  exit 0
fi

ensure_webapp_access_log_format

log "backup active TEST nginx config"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup="${TARGET_AVAILABLE}.bak.${timestamp}"
sudo cp -p -- "$TARGET_AVAILABLE" "$backup"
echo "   backup: $backup"

log "install repo-managed TEST nginx config"
tmp_target="$(sudo mktemp "${TARGET_AVAILABLE}.tmp.XXXXXX")"
sudo install -m 0644 -o root -g root "$rendered" "$tmp_target"
sudo mv -f -- "$tmp_target" "$TARGET_AVAILABLE"
tmp_target=""

log "nginx config test"
if ! sudo nginx -t; then
  echo "FATAL: nginx -t failed; restoring backup" >&2
  sudo cp -p -- "$backup" "$TARGET_AVAILABLE"
  sudo nginx -t >/dev/null
  exit 1
fi

log "reload nginx"
sudo systemctl reload nginx

log "A2 active nginx dump check"
dump_and_check_active_nginx
log "DONE"
