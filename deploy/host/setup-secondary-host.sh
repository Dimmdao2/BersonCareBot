#!/bin/bash
# The secondary host: the small machine at a different provider that exists so that losing the production
# host does not lose everything with it. Three jobs, all deliberately small:
#
#   * tang — the half of the disk-unlock exchange that must NOT live at the production provider. A stolen
#     Selectel snapshot is useless without it, which is the whole point of putting it elsewhere;
#   * a receiver for security logs, so evidence survives the compromise of the machine that produced it;
#   * an availability monitor, which has to live outside the thing it watches or it goes quiet exactly when
#     it is needed.
#
# Backups are NOT here. They go straight from production into object storage, so this machine stays tiny
# and its loss costs nothing but a rebuild.
#
# Its own disk is not encrypted (owner decision 17.08): everything that lands here is already ciphertext,
# and there would be no way to unlock it automatically without a circular dependency on the host it exists
# to unlock.
set -uo pipefail

PROD_IP="${BCB_PROD_IP:?BCB_PROD_IP is required — tang answers only to the production host}"
TANG_PORT="${BCB_TANG_PORT:-7500}"
SSH_PORT="${BCB_SSH_PORT:-22}"
ROLLBACK_MIN="${BCB_ROLLBACK_MIN:-10}"
ROLLBACK_UNIT=bcb-nft-rollback
BACKUP=/var/backups/nftables.pre-bcb.conf

log() { echo "[secondary] $*"; }
die() { echo "[secondary] FATAL: $*" >&2; exit 1; }
[ "$(id -u)" = 0 ] || die "must run as root"
export DEBIAN_FRONTEND=noninteractive

if [ "${1:-}" = "--confirm" ]; then
  systemctl stop "${ROLLBACK_UNIT}.timer" 2>/dev/null || true
  systemctl reset-failed "${ROLLBACK_UNIT}.service" 2>/dev/null || true
  rm -f /run/bcb-nft-pending
  log "rollback timer cancelled; the ruleset is now permanent"
  exit 0
fi

apt-get update -qq
apt-get install -y -qq --no-install-recommends nftables fail2ban tang jose

# ---------------------------------------------------------------- dead-man timer
[ -f "$BACKUP" ] || { nft list ruleset > "$BACKUP" 2>/dev/null || : > "$BACKUP"; chmod 600 "$BACKUP"; }
cat > /usr/local/sbin/bcb-nft-rollback <<EOF
#!/bin/sh
[ -f /run/bcb-nft-pending ] || exit 0
nft flush ruleset
[ -s "$BACKUP" ] && nft -f "$BACKUP"
systemctl disable --now nftables 2>/dev/null || true
logger -t bcb-nft-rollback "firewall rolled back: nobody confirmed connectivity"
rm -f /run/bcb-nft-pending
EOF
chmod 700 /usr/local/sbin/bcb-nft-rollback
touch /run/bcb-nft-pending
systemctl stop "${ROLLBACK_UNIT}.timer" 2>/dev/null || true
systemd-run --unit="$ROLLBACK_UNIT" --on-active="${ROLLBACK_MIN}min" /usr/local/sbin/bcb-nft-rollback >/dev/null
log "dead-man timer armed: the firewall reverts in ${ROLLBACK_MIN} min unless confirmed"

# ---------------------------------------------------------------- firewall
# tang is open to exactly one address. It hands out no secret by itself, but an exchange partner reachable
# by the whole internet is one accident away from being the accident.
cat > /etc/nftables.conf <<EOF
#!/usr/sbin/nft -f
# Managed by deploy/host/setup-secondary-host.sh — edit there, not here.
flush ruleset

table inet filter {
  chain input {
    type filter hook input priority filter; policy drop;

    iif lo accept
    ct state established,related accept
    ct state invalid drop
    ip protocol icmp accept
    ip6 nexthdr icmpv6 accept

    tcp dport $SSH_PORT ct state new accept
    ip saddr $PROD_IP tcp dport $TANG_PORT ct state new accept
  }
  chain forward { type filter hook forward priority filter; policy drop; }
  chain output  { type filter hook output  priority filter; policy accept; }
}
EOF
chmod 644 /etc/nftables.conf
nft -c -f /etc/nftables.conf || die "ruleset does not parse; nothing applied"
nft -f /etc/nftables.conf || die "failed to apply the ruleset"
systemctl enable --now nftables >/dev/null 2>&1 || true

# ---------------------------------------------------------------- sshd
install -d -m 755 /etc/ssh/sshd_config.d
cat > /etc/ssh/sshd_config.d/10-bcb-hardening.conf <<EOF
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitEmptyPasswords no
MaxAuthTries 3
LoginGraceTime 30
X11Forwarding no
AllowAgentForwarding no
AllowTcpForwarding no
ClientAliveInterval 300
ClientAliveCountMax 2
EOF
sshd -t || die "sshd config is invalid; not restarting"
systemctl reload ssh || systemctl restart ssh

cat > /etc/fail2ban/jail.d/10-bcb-sshd.local <<EOF
[sshd]
enabled  = true
port     = $SSH_PORT
backend  = systemd
maxretry = 5
findtime = 10m
bantime  = 1h
EOF
systemctl enable --now fail2ban >/dev/null 2>&1 || true

# ---------------------------------------------------------------- tang
# Ubuntu ships tang as a socket-activated service; the port lives in a drop-in rather than the shipped unit
# so a package update cannot quietly move it back.
install -d -m 755 /etc/systemd/system/tangd.socket.d
cat > /etc/systemd/system/tangd.socket.d/10-bcb-port.conf <<EOF
[Socket]
ListenStream=
ListenStream=$TANG_PORT
EOF
systemctl daemon-reload
systemctl enable --now tangd.socket >/dev/null 2>&1 || true

# Key material is generated on first start. It is not a copy of anything on the production host: losing it
# means production can no longer unlock itself automatically, which is why the passphrase slot stays.
install -d -m 700 -o root -g root /var/db/tang 2>/dev/null || true

# ---------------------------------------------------------------- verify
log "verifying"
set +o pipefail   # grep -q plus pipefail turns a successful match into a failure
vfail=0
vcheck() { if eval "$2"; then echo "  ok   $1"; else echo "  FAIL $1"; vfail=1; fi; }

vcheck "input policy is drop"          'nft list chain inet filter input | grep -q "policy drop"'
vcheck "ssh accepted"                  "nft list ruleset | grep -q 'tcp dport $SSH_PORT'"
vcheck "tang restricted to production" "nft list ruleset | grep -q '$PROD_IP'"
vcheck "tang not open to the world"    "! nft list ruleset | grep -E 'tcp dport $TANG_PORT' | grep -qv '$PROD_IP'"
vcheck "nftables enabled at boot"      'systemctl is-enabled nftables >/dev/null 2>&1'
vcheck "root ssh login refused"        'sshd -T | grep -qx "permitrootlogin no"'
vcheck "password auth disabled"        'sshd -T | grep -qx "passwordauthentication no"'
vcheck "fail2ban running"              'systemctl is-active fail2ban >/dev/null 2>&1'
vcheck "tang socket active"            'systemctl is-active tangd.socket >/dev/null 2>&1'
vcheck "tang listens on its port"      "ss -tlnH | grep -q ':$TANG_PORT'"
vcheck "tang advertises keys"          "curl -sf --max-time 5 http://127.0.0.1:$TANG_PORT/adv | grep -q payload"
vcheck "tang key dir is root-only"     '[ "$(stat -c %a /var/db/tang)" = 700 ]'
vcheck "rollback armed"                '[ -f /run/bcb-nft-pending ]'

[ "$vfail" = 0 ] || die "secondary host setup incomplete"

log "DONE. Reconnect in a NEW session to prove the rules did not lock you out, then run:"
log "  $0 --confirm"
