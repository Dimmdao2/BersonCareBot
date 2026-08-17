#!/bin/bash
# nginx with the TLS policy from IS-I1-08, ready before the application exists.
#
# Until a release is deployed the site answers 503 rather than 502: a maintenance page is a deliberate
# state, a bad gateway is a broken one, and the difference matters when someone is looking at the host from
# outside and deciding whether it is safe to point DNS at it.
#
# The certificate installed here is self-signed. A real certificate needs the domain to resolve to this
# host, which is an owner decision; everything else — protocol versions, ciphers, headers — is testable now
# and does not change when the certificate is replaced.
set -uo pipefail

APP_PORT="${BCB_APP_PORT:-6200}"
CERT_DIR=/etc/ssl/bcb
SERVER_NAME="${BCB_SERVER_NAME:-_}"

log() { echo "[nginx] $*"; }
die() { echo "[nginx] FATAL: $*" >&2; exit 1; }
[ "$(id -u)" = 0 ] || die "must run as root"
export DEBIAN_FRONTEND=noninteractive

command -v nginx >/dev/null || { apt-get update -qq; apt-get install -y -qq --no-install-recommends nginx openssl; }

install -d -m 0755 "$CERT_DIR"
if [ ! -s "$CERT_DIR/self-signed.crt" ]; then
  log "generating a placeholder self-signed certificate"
  openssl req -x509 -newkey rsa:4096 -sha256 -days 365 -nodes \
    -keyout "$CERT_DIR/self-signed.key" -out "$CERT_DIR/self-signed.crt" \
    -subj "/CN=bcb-prod-placeholder" >/dev/null 2>&1
fi
chmod 0600 "$CERT_DIR/self-signed.key"
chmod 0644 "$CERT_DIR/self-signed.crt"

# Diffie-Hellman parameters are generated once and reused; without them nginx falls back to a 1024-bit group
# for the DHE suites, which is below what the TLS policy claims to enforce.
if [ ! -s "$CERT_DIR/dhparam.pem" ]; then
  log "generating DH parameters (this takes a minute)"
  openssl dhparam -out "$CERT_DIR/dhparam.pem" 2048 >/dev/null 2>&1
  chmod 0644 "$CERT_DIR/dhparam.pem"
fi

# Ubuntu's nginx.conf already sets ssl_protocols and ssl_prefer_server_ciphers in the http block, and a
# second ssl_prefer_server_ciphers is a hard error rather than an override. The distro lines are commented
# out — visibly, so the next reader sees that the policy moved rather than wondering where it went.
# The delimiter is @, not |: the pattern itself contains an alternation, and sed would read that | as the
# end of the expression.
sed -i -E 's@^(\s*)(ssl_protocols|ssl_prefer_server_ciphers)([^;]*);@\1# superseded by conf.d/10-bcb-tls.conf: \2\3;@' /etc/nginx/nginx.conf

cat > /etc/nginx/conf.d/10-bcb-tls.conf <<EOF
# Managed by deploy/host/setup-nginx-tls.sh
ssl_protocols TLSv1.2 TLSv1.3;
ssl_prefer_server_ciphers off;
ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305;
ssl_dhparam $CERT_DIR/dhparam.pem;
ssl_session_timeout 1d;
ssl_session_cache shared:BcbSSL:10m;
ssl_session_tickets off;

# The version banner tells an attacker which known bugs to try first and helps nobody else.
server_tokens off;
EOF

cat > /etc/nginx/sites-available/bcb <<EOF
# Managed by deploy/host/setup-nginx-tls.sh
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name $SERVER_NAME;

    # ACME needs plain HTTP to survive; everything else is redirected.
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://\$host\$request_uri; }
}

server {
    # `http2 on;` is nginx 1.25+ syntax; 24.04 ships 1.24, where http2 is a listen parameter.
    listen 443 ssl http2 default_server;
    listen [::]:443 ssl http2 default_server;
    server_name $SERVER_NAME;

    ssl_certificate     $CERT_DIR/self-signed.crt;
    ssl_certificate_key $CERT_DIR/self-signed.key;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options DENY always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;

    # Patient files are large; the default 1m body limit would reject them with an unhelpful error.
    client_max_body_size 2048m;
    proxy_read_timeout 300s;

    location / {
        # No release is deployed yet. 503 says "not serving on purpose"; a 502 would say "broken".
        # default_type, NOT add_header: a single add_header in a location cancels every header inherited
        # from the server block, so setting the content type here silently dropped HSTS and the rest.
        default_type text/plain;
        return 503 "BersonCare: host is provisioned, application is not deployed yet\n";
    }
}
EOF

ln -sf /etc/nginx/sites-available/bcb /etc/nginx/sites-enabled/bcb
rm -f /etc/nginx/sites-enabled/default

nginx -t 2>/dev/null || die "nginx configuration is invalid; not reloading"
systemctl enable --now nginx >/dev/null 2>&1
systemctl reload nginx || systemctl restart nginx

log "verifying"
set +o pipefail   # grep -q plus pipefail turns a successful match into a failure
vfail=0
vcheck() { if eval "$2"; then echo "  ok   $1"; else echo "  FAIL $1"; vfail=1; fi; }

vcheck "nginx running"                'systemctl is-active nginx'
vcheck "nginx enabled at boot"        'systemctl is-enabled nginx'
vcheck "listening on 80"              'ss -tlnH | grep -q ":80 "'
vcheck "listening on 443"             'ss -tlnH | grep -q ":443 "'
vcheck "default site removed"         '! [ -e /etc/nginx/sites-enabled/default ]'
vcheck "private key is 0600"          '[ "$(stat -c %a '"$CERT_DIR"'/self-signed.key)" = 600 ]'
# Asked of the running server over a real handshake, not of the config file that was meant to configure it.
vcheck "TLS 1.3 accepted"             'echo | openssl s_client -connect 127.0.0.1:443 -tls1_3 2>/dev/null | grep -q "Cipher is"'
vcheck "TLS 1.2 accepted"             'echo | openssl s_client -connect 127.0.0.1:443 -tls1_2 2>/dev/null | grep -q "Cipher is"'
# Two traps in one line. Ubuntu's OpenSSL refuses to *offer* TLS 1.0/1.1 at its default security level, so
# without SECLEVEL=0 the handshake never reaches the server and the check proves nothing about it. And a
# refused handshake still prints "Cipher is (NONE)", so grepping for "Cipher is" matches the failure too;
# a real negotiation is the one where the cipher name does not start with a bracket.
vcheck "TLS 1.1 refused by the server" '! echo | openssl s_client -connect 127.0.0.1:443 -tls1_1 -cipher "DEFAULT@SECLEVEL=0" 2>/dev/null | grep -qE "Cipher is [^(]"'
vcheck "TLS 1.0 refused by the server" '! echo | openssl s_client -connect 127.0.0.1:443 -tls1 -cipher "DEFAULT@SECLEVEL=0" 2>/dev/null | grep -qE "Cipher is [^(]"'
vcheck "TLS 1.2 really negotiates"     'echo | openssl s_client -connect 127.0.0.1:443 -tls1_2 2>/dev/null | grep -qE "Cipher is [^(]"'
vcheck "HSTS header present"          'curl -ksI https://127.0.0.1/ | grep -qi "strict-transport-security"'
vcheck "nosniff header present"        'curl -ksI https://127.0.0.1/ | grep -qi "x-content-type-options"'
vcheck "frame-deny header present"     'curl -ksI https://127.0.0.1/ | grep -qi "x-frame-options"'
vcheck "no version banner"            '! curl -ksI https://127.0.0.1/ | grep -qiE "^server:.*nginx/[0-9]"'
vcheck "http redirects to https"      'curl -sI http://127.0.0.1/ | grep -q "301"'
vcheck "maintenance answer is 503"    'curl -kso /dev/null -w "%{http_code}" https://127.0.0.1/ | grep -q 503'

[ "$vfail" = 0 ] || die "nginx TLS setup incomplete"
log "DONE. Certificate is a placeholder — a real one needs the domain pointed at this host."
