#!/usr/bin/env bash
# apply-test-vpn-dns.sh — split DNS for TEST access through the owner awg1 tunnel.
#
# Scope is deliberately narrow:
#   - current DEV/RELAY/TEST host 151.241.228.122 only
#   - awg1 / 10.9.1.1 only
#   - test.bersoncare.ru only
#   - default action is dry-run; --apply is required to touch /etc or systemd
set -euo pipefail

EXPECTED_HOST_IP="151.241.228.122"
VPN_INTERFACE="awg1"
VPN_ADDRESS="10.9.1.1"
SERVER_NAME="test.bersoncare.ru"
DNSMASQ_CONF="/etc/dnsmasq.d/awg-test.conf"
OBSOLETE_SYSTEMD_DROPIN="/etc/systemd/system/dnsmasq.service.d/bersoncare-test-awg1.conf"
DNS_REDIRECT_UNIT="/etc/systemd/system/bersoncare-test-vpn-dns-redirect.service"
BACKUP_DIR="/var/backups/bersoncare-test-vpn-dns"
ACTION="dry-run"

usage() {
  cat <<'EOF'
Usage:
  bash deploy/host/apply-test-vpn-dns.sh [--dry-run]
  bash deploy/host/apply-test-vpn-dns.sh --apply

Default is --dry-run. --apply installs the TEST-only dnsmasq split-DNS
configuration and redirects awg1 DNS traffic to the split resolver. New awg1
clients should use DNS 10.9.1.1 directly.
EOF
}

log() {
  echo "== [apply-test-vpn-dns] $* =="
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
  [ "$EXPECTED_HOST_IP" = "151.241.228.122" ] || fatal "unexpected TEST host guard"
  [ "$VPN_INTERFACE" = "awg1" ] || fatal "VPN_INTERFACE must be awg1"
  [ "$VPN_ADDRESS" = "10.9.1.1" ] || fatal "VPN_ADDRESS must be the awg1 gateway"
  [ "$SERVER_NAME" = "test.bersoncare.ru" ] || fatal "SERVER_NAME must be test.bersoncare.ru"

  ip -4 -o address show scope global | awk '{print $4}' | cut -d/ -f1 \
    | grep -Fxq "$EXPECTED_HOST_IP" \
    || fatal "this command is allowed only on TEST host $EXPECTED_HOST_IP"
  ip -4 -o address show dev "$VPN_INTERFACE" \
    | awk '{print $4}' | grep -Fxq "${VPN_ADDRESS}/24" \
    || fatal "$VPN_INTERFACE does not own ${VPN_ADDRESS}/24"
}

render_dnsmasq_config() {
  local output="$1"
  cat >"$output" <<'EOF'
no-hosts
# TEST shares the VPN endpoint's public IP. Resolve it to the in-tunnel awg1
# gateway so iOS does not follow the endpoint-exclusion route around the VPN.
bind-dynamic
listen-address=10.9.1.1
address=/test.bersoncare.ru/10.9.1.1
no-resolv
server=1.1.1.1
server=8.8.8.8
EOF
}

render_dns_redirect_unit() {
  local output="$1"
  cat >"$output" <<'EOF'
[Unit]
Description=Force owner awg1 DNS through the BersonCare TEST split resolver
Requires=awg-quick@awg1.service dnsmasq.service
After=awg-quick@awg1.service dnsmasq.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/sbin/iptables -t nat -A PREROUTING -i awg1 -p udp --dport 53 -j DNAT --to-destination 10.9.1.1:53
ExecStart=/usr/sbin/iptables -t nat -A PREROUTING -i awg1 -p tcp --dport 53 -j DNAT --to-destination 10.9.1.1:53
ExecStop=-/usr/sbin/iptables -t nat -D PREROUTING -i awg1 -p udp --dport 53 -j DNAT --to-destination 10.9.1.1:53
ExecStop=-/usr/sbin/iptables -t nat -D PREROUTING -i awg1 -p tcp --dport 53 -j DNAT --to-destination 10.9.1.1:53

[Install]
WantedBy=multi-user.target
EOF
}

install_root_file() {
  local source="$1"
  local target="$2"
  local tmp
  tmp="$(sudo mktemp "${target}.tmp.XXXXXX")"
  sudo install -m 0644 -o root -g root "$source" "$tmp"
  sudo mv -f -- "$tmp" "$target"
}

assert_test_only

rendered_dnsmasq="$(mktemp /tmp/bcb-test-vpn-dnsmasq.XXXXXX)"
rendered_redirect="$(mktemp /tmp/bcb-test-vpn-redirect.XXXXXX.service)"
cleanup() {
  rm -f "$rendered_dnsmasq" "$rendered_redirect"
}
trap cleanup EXIT

render_dnsmasq_config "$rendered_dnsmasq"
render_dns_redirect_unit "$rendered_redirect"
dnsmasq --test --conf-file="$rendered_dnsmasq"
systemd-analyze verify "$rendered_redirect"

if [ "$ACTION" = "dry-run" ]; then
  log "dry-run OK"
  echo "   dnsmasq: $DNSMASQ_CONF"
  echo "   redirect: $DNS_REDIRECT_UNIT"
  echo "   answer:  $SERVER_NAME -> $VPN_ADDRESS"
  echo "   apply:   bash deploy/host/apply-test-vpn-dns.sh --apply"
  exit 0
fi

log "install TEST split-DNS configuration"
sudo install -d -m 0700 -o root -g root "$BACKUP_DIR"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
if sudo test -e "$DNSMASQ_CONF"; then
  dnsmasq_backup="${BACKUP_DIR}/awg-test.conf.${timestamp}"
  sudo cp -p -- "$DNSMASQ_CONF" "$dnsmasq_backup"
  echo "   backup: $dnsmasq_backup"
fi
if sudo test -e "$OBSOLETE_SYSTEMD_DROPIN"; then
  dropin_backup="${BACKUP_DIR}/bersoncare-test-awg1.conf.${timestamp}"
  sudo cp -p -- "$OBSOLETE_SYSTEMD_DROPIN" "$dropin_backup"
  echo "   backup: $dropin_backup"
fi
if sudo test -e "$DNS_REDIRECT_UNIT"; then
  redirect_backup="${BACKUP_DIR}/bersoncare-test-vpn-dns-redirect.service.${timestamp}"
  sudo cp -p -- "$DNS_REDIRECT_UNIT" "$redirect_backup"
  echo "   backup: $redirect_backup"
fi
install_root_file "$rendered_dnsmasq" "$DNSMASQ_CONF"
install_root_file "$rendered_redirect" "$DNS_REDIRECT_UNIT"
sudo rm -f -- "$OBSOLETE_SYSTEMD_DROPIN"

log "restart split DNS and awg1-only redirect"
sudo systemctl daemon-reload
sudo systemctl restart dnsmasq
systemctl is-active --quiet dnsmasq || fatal "dnsmasq is not active"
sudo systemctl enable bersoncare-test-vpn-dns-redirect.service
sudo systemctl restart bersoncare-test-vpn-dns-redirect.service
systemctl is-active --quiet bersoncare-test-vpn-dns-redirect.service \
  || fatal "TEST VPN DNS redirect is not active"

answer="$(dig +short +time=2 +tries=1 @"$VPN_ADDRESS" "$SERVER_NAME" A | tail -n 1)"
[ "$answer" = "$VPN_ADDRESS" ] \
  || fatal "unexpected split-DNS answer: ${answer:-<empty>}"
sudo iptables -t nat -C PREROUTING -i "$VPN_INTERFACE" -p udp --dport 53 \
  -j DNAT --to-destination "${VPN_ADDRESS}:53"
sudo iptables -t nat -C PREROUTING -i "$VPN_INTERFACE" -p tcp --dport 53 \
  -j DNAT --to-destination "${VPN_ADDRESS}:53"

log "apply OK"
echo "   $SERVER_NAME -> $answer via DNS $VPN_ADDRESS"
