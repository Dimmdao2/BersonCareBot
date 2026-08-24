#!/usr/bin/env bash
# Future TEST domain cutover preparation. It remains inert without --apply and an exact owner gate.
set -euo pipefail

ACTION=preflight
OFFLINE=0
HOST_MAP=""
OUT=""
HERMETIC_ROOT="${THERAPYSTO_CUTOVER_HERMETIC_ROOT:-}"
if [[ -n "$HERMETIC_ROOT" ]]; then
  [[ "$HERMETIC_ROOT" == /tmp/* && "$HERMETIC_ROOT" != *'/../'* ]] || {
    echo "FATAL: THERAPYSTO_CUTOVER_HERMETIC_ROOT must stay below /tmp" >&2
    exit 1
  }
  WEBAPP_ENV_FILE="$HERMETIC_ROOT/webapp.test"
  TARGET_AVAILABLE="$HERMETIC_ROOT/test.bersoncare.ru"
else
  WEBAPP_ENV_FILE="/opt/env/bersoncarebot/webapp.test"
  TARGET_AVAILABLE="/etc/nginx/sites-available/test.bersoncare.ru"
fi
BASE_RENDERER="deploy/host/apply-test-nginx-webapp.sh"
PROJECT_ROOT="$(pwd)"
WEBAPP_SERVICE="bersoncarebot-webapp-test.service"
WEBAPP_HEALTH_URL="http://127.0.0.1:6300/api/health"

usage() { cat <<'EOF'
Usage: bash deploy/host/therapysto-domain-cutover.sh --host-map FILE [--offline] [--render FILE|--apply|--approval-digest]

The protected host map contains exactly the approved TEST hosts, DNS target, platform and
custom certificate pairs, process origins and exact DB-backed Yandex callback allowlist.
--offline validates and renders only; it never calls host, DNS, TLS, service or sudo binaries.
--apply additionally requires THERAPYSTO_CUTOVER_OWNER_APPROVED=yes and an approval digest
matching this exact map. It compiles the candidate before replacing the active TEST seam.
EOF
}
die() { echo "FATAL: $*" >&2; exit 1; }

while (($#)); do
  case "$1" in
    --host-map) HOST_MAP=${2:-}; shift 2 ;;
    --offline) OFFLINE=1; shift ;;
    --render) ACTION=render; OUT=${2:-}; shift 2 ;;
    --apply) ACTION=apply; shift ;;
    --approval-digest) ACTION=digest; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
done

[[ ! ( $OFFLINE -eq 1 && "$ACTION" == apply ) ]] || die "--offline cannot be combined with --apply"
[[ -n "$HOST_MAP" && -f "$HOST_MAP" ]] || die "--host-map FILE is required"

declare -A map_values=()
allowed_keys=(
  STAFF_HOST PLATFORM_ADMIN_HOST PATIENT_DEFAULT_HOST PATIENT_BRANDED_HOST CLINIC_CUSTOM_HOST
  EXPECTED_DNS_TARGET PLATFORM_TLS_CERTIFICATE_PATH PLATFORM_TLS_CERTIFICATE_KEY_PATH
  CLINIC_TLS_CERTIFICATE_PATH CLINIC_TLS_CERTIFICATE_KEY_PATH APP_BASE_URL PATIENT_APP_ORIGIN
  YANDEX_OAUTH_REDIRECT_URIS CERT_EXPIRY_WARN_DAYS
)
is_allowed_key() { local key; for key in "${allowed_keys[@]}"; do [[ "$key" == "$1" ]] && return 0; done; return 1; }
load_host_map() {
  local line key value
  while IFS= read -r line || [[ -n "$line" ]]; do
    line=${line%$'\r'}
    [[ -z "$line" || "$line" == \#* ]] && continue
    [[ "$line" =~ ^([A-Z0-9_]+)=(.*)$ ]] || die "host map contains invalid assignment"
    key=${BASH_REMATCH[1]}; value=${BASH_REMATCH[2]}
    is_allowed_key "$key" || die "host map key is not approved: $key"
    [[ -z ${map_values[$key]+x} ]] || die "host map repeats $key"
    [[ "$value" != *[[:space:]\'\"\`\\\$\;\&\|\(\)\<\>]* ]] || die "$key contains unsafe characters"
    map_values[$key]=$value
  done <"$HOST_MAP"
  for key in "${allowed_keys[@]}"; do [[ -n ${map_values[$key]:-} ]] || die "host map requires $key"; done
}
load_host_map
for key in "${allowed_keys[@]}"; do printf -v "$key" '%s' "${map_values[$key]}"; done

valid_host() { [[ "$1" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$ ]]; }
for key in STAFF_HOST PLATFORM_ADMIN_HOST PATIENT_DEFAULT_HOST PATIENT_BRANDED_HOST CLINIC_CUSTOM_HOST; do valid_host "${!key}" || die "$key must be a lowercase DNS hostname"; done
hosts=("$STAFF_HOST" "$PLATFORM_ADMIN_HOST" "$PATIENT_DEFAULT_HOST" "$PATIENT_BRANDED_HOST" "$CLINIC_CUSTOM_HOST")
[[ $(printf '%s\n' "${hosts[@]}" | sort -u | wc -l) -eq 5 ]] || die "host map values must be distinct"
[[ "$EXPECTED_DNS_TARGET" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$|^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$ ]] || die "EXPECTED_DNS_TARGET must be an approved IPv4 address or hostname"
for key in PLATFORM_TLS_CERTIFICATE_PATH PLATFORM_TLS_CERTIFICATE_KEY_PATH CLINIC_TLS_CERTIFICATE_PATH CLINIC_TLS_CERTIFICATE_KEY_PATH; do [[ "${!key}" == /* ]] || die "$key must be an absolute path"; done
[[ "$PLATFORM_TLS_CERTIFICATE_PATH" != "$CLINIC_TLS_CERTIFICATE_PATH" && "$PLATFORM_TLS_CERTIFICATE_KEY_PATH" != "$CLINIC_TLS_CERTIFICATE_KEY_PATH" ]] || die "platform and clinic TLS pairs must be separate"
[[ "$APP_BASE_URL" == "https://$STAFF_HOST" ]] || die "APP_BASE_URL must exactly match STAFF_HOST"
[[ "$PATIENT_APP_ORIGIN" == "https://$PATIENT_DEFAULT_HOST" ]] || die "PATIENT_APP_ORIGIN must exactly match PATIENT_DEFAULT_HOST"
expected_callbacks=$(printf '%s\n' "https://$PATIENT_DEFAULT_HOST/api/auth/oauth/callback/yandex" "https://$CLINIC_CUSTOM_HOST/api/auth/oauth/callback/yandex" | sort)
actual_callbacks=$(printf '%s' "$YANDEX_OAUTH_REDIRECT_URIS" | tr ',' '\n' | sort)
[[ "$actual_callbacks" == "$expected_callbacks" ]] || die "YANDEX_OAUTH_REDIRECT_URIS must be exactly the two approved patient callbacks"
[[ "$CERT_EXPIRY_WARN_DAYS" =~ ^[1-9][0-9]*$ ]] || die "CERT_EXPIRY_WARN_DAYS must be a positive integer"
platform_wildcard="*.$PATIENT_DEFAULT_HOST"

approval_digest() { for key in "${allowed_keys[@]}"; do printf '%s=%s\n' "$key" "${map_values[$key]}"; done | sha256sum | awk '{print $1}'; }

render() {
  local base
  base=$(mktemp)
  bash "$BASE_RENDERER" --render "$base" >/dev/null
  cat "$base"
  rm -f "$base"
  cat <<EOF

# Future Therapysto/Therapygo TEST hosts. The preceding test.bersoncare.ru block is
# rendered by the existing TEST apply seam and intentionally remains unchanged.
server { listen 80 default_server; server_name _; return 444; }
server { listen 443 ssl http2 default_server; server_name _; ssl_certificate $PLATFORM_TLS_CERTIFICATE_PATH; ssl_certificate_key $PLATFORM_TLS_CERTIFICATE_KEY_PATH; return 444; }
server { listen 80; server_name $STAFF_HOST $PLATFORM_ADMIN_HOST $PATIENT_DEFAULT_HOST $PATIENT_BRANDED_HOST $CLINIC_CUSTOM_HOST; return 301 https://\$host\$request_uri; }
server {
  listen 443 ssl http2;
  server_name $STAFF_HOST $PLATFORM_ADMIN_HOST $PATIENT_DEFAULT_HOST;
  ssl_certificate $PLATFORM_TLS_CERTIFICATE_PATH;
  ssl_certificate_key $PLATFORM_TLS_CERTIFICATE_KEY_PATH;
  location / { proxy_pass http://127.0.0.1:6300; proxy_http_version 1.1; proxy_set_header Host \$host; proxy_set_header X-Forwarded-Host \$host; proxy_set_header X-Forwarded-Proto \$scheme; proxy_set_header X-Real-IP \$remote_addr; proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for; proxy_set_header Upgrade \$http_upgrade; proxy_set_header Connection "upgrade"; proxy_read_timeout 120s; proxy_send_timeout 120s; }
}
server { listen 443 ssl http2; server_name $PATIENT_BRANDED_HOST; ssl_certificate $PLATFORM_TLS_CERTIFICATE_PATH; ssl_certificate_key $PLATFORM_TLS_CERTIFICATE_KEY_PATH; return 308 https://$CLINIC_CUSTOM_HOST\$request_uri; }
server {
  listen 443 ssl http2;
  server_name $CLINIC_CUSTOM_HOST;
  ssl_certificate $CLINIC_TLS_CERTIFICATE_PATH;
  ssl_certificate_key $CLINIC_TLS_CERTIFICATE_KEY_PATH;
  location / { proxy_pass http://127.0.0.1:6300; proxy_http_version 1.1; proxy_set_header Host \$host; proxy_set_header X-Forwarded-Host \$host; proxy_set_header X-Forwarded-Proto \$scheme; proxy_set_header X-Real-IP \$remote_addr; proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for; proxy_set_header Upgrade \$http_upgrade; proxy_set_header Connection "upgrade"; proxy_read_timeout 120s; proxy_send_timeout 120s; }
}
EOF
}

render_env_candidate() {
  local destination=$1
  [[ -r "$WEBAPP_ENV_FILE" ]] || die "cannot read TEST webapp env: $WEBAPP_ENV_FILE"
  awk '!/^(APP_BASE_URL|PATIENT_APP_ORIGIN)=/' "$WEBAPP_ENV_FILE" >"$destination"
  printf 'APP_BASE_URL=%s\nPATIENT_APP_ORIGIN=%s\n' "$APP_BASE_URL" "$PATIENT_APP_ORIGIN" >>"$destination"
}
resolve_exact_target() { if [[ "$1" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then printf '%s\n' "$1"; else getent ahostsv4 "$1" | awk 'NR == 1 { print $1 }'; fi; }
verify_dns() {
  local approved answer host
  approved=$(resolve_exact_target "$EXPECTED_DNS_TARGET")
  [[ -n "$approved" ]] || die "approved DNS target does not resolve: $EXPECTED_DNS_TARGET"
  for host in "${hosts[@]}"; do
    answer=$(getent ahostsv4 "$host" | awk '{print $1}' | sort -u) || die "DNS does not resolve: $host"
    [[ "$answer" == "$approved" ]] || die "DNS target mismatch for $host (expected $approved)"
  done
}
verify_tls() {
  [[ -r "$PLATFORM_TLS_CERTIFICATE_PATH" && -r "$PLATFORM_TLS_CERTIFICATE_KEY_PATH" ]] || die "platform certificate or key is missing"
  [[ -r "$CLINIC_TLS_CERTIFICATE_PATH" && -r "$CLINIC_TLS_CERTIFICATE_KEY_PATH" ]] || die "clinic certificate or key is missing"
  openssl x509 -in "$PLATFORM_TLS_CERTIFICATE_PATH" -noout -checkhost "$STAFF_HOST" >/dev/null || die "platform certificate does not cover staff host: $STAFF_HOST"
  openssl x509 -in "$PLATFORM_TLS_CERTIFICATE_PATH" -noout -checkhost "$PLATFORM_ADMIN_HOST" >/dev/null || die "platform certificate does not cover admin host: $PLATFORM_ADMIN_HOST"
  openssl x509 -in "$PLATFORM_TLS_CERTIFICATE_PATH" -noout -checkhost "$PATIENT_DEFAULT_HOST" >/dev/null || die "platform certificate does not cover apex: $PATIENT_DEFAULT_HOST"
  openssl x509 -in "$PLATFORM_TLS_CERTIFICATE_PATH" -noout -checkhost "$platform_wildcard" >/dev/null || die "platform certificate does not cover wildcard: $platform_wildcard"
  openssl x509 -in "$PLATFORM_TLS_CERTIFICATE_PATH" -noout -checkhost "$PATIENT_BRANDED_HOST" >/dev/null || die "platform certificate does not cover branded host: $PATIENT_BRANDED_HOST"
  openssl x509 -in "$CLINIC_TLS_CERTIFICATE_PATH" -noout -checkhost "$CLINIC_CUSTOM_HOST" >/dev/null || die "clinic certificate does not cover exact host: $CLINIC_CUSTOM_HOST"
}
compile_candidate() {
  local candidate=$1 wrapper
  wrapper=$(mktemp)
  cat >"$wrapper" <<EOF
events {}
http { log_format bersoncare_webapp_detailed '\$remote_addr \$request'; include /etc/nginx/mime.types; include $candidate; }
EOF
  sudo nginx -t -c "$wrapper"
  rm -f "$wrapper"
}
verify_db_callbacks() {
  sudo -n -u deploy /bin/bash -c '
    set -euo pipefail
    set -a
    source "$1"
    set +a
    exec pnpm --dir "$2/apps/webapp" exec tsx \
      "$2/apps/webapp/scripts/assert-yandex-oauth-redirect-uris.ts" "$3"
  ' _ "$WEBAPP_ENV_FILE" "$PROJECT_ROOT" "$YANDEX_OAUTH_REDIRECT_URIS"
}
env_app_base_url() {
  /bin/bash -c 'set -euo pipefail; set -a; source "$1"; set +a; printf "%s" "${APP_BASE_URL:-}"' _ "$1"
}
origin_host() {
  node -e 'const value = new URL(process.argv[1]); process.stdout.write(value.host)' "$1"
}
health_check() {
  local host=$1
  curl --fail --silent --show-error --max-time 10 -H "Host: $host" "$WEBAPP_HEALTH_URL" \
    | grep -q '"ok":true'
}

if [[ "$ACTION" == digest ]]; then approval_digest; exit 0; fi
if [[ "$ACTION" == render ]]; then [[ -n "$OUT" ]] || die "--render requires FILE"; render >"$OUT"; echo "rendered: $OUT"; exit 0; fi
if [[ $OFFLINE -eq 0 ]]; then verify_dns; verify_tls; fi
if [[ "$ACTION" != apply ]]; then echo "preflight OK"; exit 0; fi

[[ "${THERAPYSTO_CUTOVER_OWNER_APPROVED:-}" == yes ]] || die "refusing apply: require THERAPYSTO_CUTOVER_OWNER_APPROVED=yes"
[[ "${THERAPYSTO_CUTOVER_OWNER_APPROVED_MAP_SHA256:-}" == "$(approval_digest)" ]] || die "refusing apply: owner approval digest does not match this host map"
verify_db_callbacks || die "DB-backed yandex_oauth_redirect_uri does not exactly match the approved callbacks"
candidate=$(mktemp); candidate_env=$(mktemp)
backup="${TARGET_AVAILABLE}.pre-therapysto.$(date -u +%Y%m%dT%H%M%SZ)"; env_backup="${WEBAPP_ENV_FILE}.pre-therapysto.$(date -u +%Y%m%dT%H%M%SZ)"
nginx_mutation_started=0; env_mutation_started=0; webapp_activation_started=0
old_health_host=""
rollback() {
  local status=$?
  local rollback_failed=0
  trap - EXIT
  if (( status != 0 )); then
    set +e
    if (( env_mutation_started )); then
      sudo -n cp -p -- "$env_backup" "$WEBAPP_ENV_FILE" || rollback_failed=1
    fi
    if (( nginx_mutation_started )); then
      sudo -n cp -p -- "$backup" "$TARGET_AVAILABLE" || rollback_failed=1
      sudo -n nginx -t || rollback_failed=1
      sudo -n systemctl reload nginx || rollback_failed=1
    fi
    if (( webapp_activation_started )); then
      sudo -n systemctl restart "$WEBAPP_SERVICE" || rollback_failed=1
      sudo -n systemctl is-active --quiet "$WEBAPP_SERVICE" || rollback_failed=1
      health_check "$old_health_host" || rollback_failed=1
    fi
    if (( rollback_failed )); then
      echo "FATAL: cutover failed and rollback verification also failed" >&2
    fi
  fi
  rm -f "$candidate" "$candidate_env"
  exit "$status"
}
trap rollback EXIT
render >"$candidate"; compile_candidate "$candidate"; render_env_candidate "$candidate_env"
old_health_host=$(origin_host "$(env_app_base_url "$WEBAPP_ENV_FILE")")
[[ "$old_health_host" =~ ^[A-Za-z0-9.-]+(:[0-9]+)?$ ]] || die "existing APP_BASE_URL has an invalid Host"
sudo -n cp -p -- "$TARGET_AVAILABLE" "$backup"; sudo -n cp -p -- "$WEBAPP_ENV_FILE" "$env_backup"
env_mutation_started=1; sudo -n install -m 0640 -o root -g deploy "$candidate_env" "$WEBAPP_ENV_FILE"
nginx_mutation_started=1; sudo -n install -m 0644 -o root -g root "$candidate" "$TARGET_AVAILABLE"
sudo -n nginx -t
webapp_activation_started=1
sudo -n systemctl restart "$WEBAPP_SERVICE"
sudo -n systemctl is-active --quiet "$WEBAPP_SERVICE"
health_check "$STAFF_HOST"
sudo -n systemctl reload nginx
echo "apply OK; backups: $backup $env_backup"
