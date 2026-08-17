#!/bin/bash
# Host perimeter: one canonical nftables ruleset with default-deny inbound, a hardened sshd, and fail2ban.
# Idempotent — safe to re-run.
#
# Locking yourself out of a remote host is the ordinary outcome of firewall work, so the ruleset is applied
# behind a dead-man timer: unless the caller confirms the connection still works, the machine restores the
# previous state on its own. Confirm with:  BCB_CONFIRM=1 ./harden-network-and-ssh.sh --confirm
set -euo pipefail

SSH_PORT="${BCB_SSH_PORT:-22}"
ROLLBACK_MIN="${BCB_ROLLBACK_MIN:-10}"
RULES=/etc/nftables.conf
BACKUP=/var/backups/nftables.pre-bcb.conf
ROLLBACK_UNIT=bcb-nft-rollback

log() { echo "[harden] $*"; }
die() { echo "[harden] FATAL: $*" >&2; exit 1; }

[ "$(id -u)" = 0 ] || die "must run as root"

# ---------------------------------------------------------------- confirm mode
if [ "${1:-}" = "--confirm" ]; then
  systemctl stop "${ROLLBACK_UNIT}.timer" 2>/dev/null || true
  systemctl reset-failed "${ROLLBACK_UNIT}.service" 2>/dev/null || true
  rm -f /run/bcb-nft-pending
  log "rollback timer cancelled; the ruleset is now permanent"
  exit 0
fi

command -v nft >/dev/null || { apt-get update -qq; apt-get install -y -qq nftables; }
command -v fail2ban-server >/dev/null || apt-get install -y -qq fail2ban

# ---------------------------------------------------------------- dead-man timer
if [ ! -f "$BACKUP" ]; then
  nft list ruleset > "$BACKUP" 2>/dev/null || : > "$BACKUP"
  chmod 600 "$BACKUP"
fi

cat > /usr/local/sbin/bcb-nft-rollback <<EOF
#!/bin/sh
# Restores the pre-hardening state. Runs only if nobody confirmed the new rules in time.
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
systemd-run --unit="$ROLLBACK_UNIT" --on-active="${ROLLBACK_MIN}min" \
  /usr/local/sbin/bcb-nft-rollback >/dev/null
log "dead-man timer armed: the firewall reverts in ${ROLLBACK_MIN} min unless confirmed"

# ---------------------------------------------------------------- ruleset
# Inbound is denied by default. Outbound is left open: this host initiates package updates, backups and
# outgoing mail, and an egress policy without those destinations enumerated would be theatre.
cat > "$RULES" <<EOF
#!/usr/sbin/nft -f
# Managed by deploy/host/harden-network-and-ssh.sh — edit there, not here.
flush ruleset

table inet filter {
  chain input {
    type filter hook input priority filter; policy drop;

    iif lo accept
    ct state established,related accept
    ct state invalid drop

    # ICMP is kept: path MTU discovery breaks without it, and the provider already filters echo upstream.
    ip protocol icmp accept
    ip6 nexthdr icmpv6 accept

    tcp dport $SSH_PORT ct state new accept
    tcp dport { 80, 443 } ct state new accept
  }

  chain forward {
    type filter hook forward priority filter; policy drop;
  }

  chain output {
    type filter hook output priority filter; policy accept;
  }
}
EOF
chmod 644 "$RULES"

nft -c -f "$RULES" || die "ruleset does not parse; nothing applied"
nft -f "$RULES" || die "failed to apply the ruleset"
systemctl enable --now nftables >/dev/null 2>&1 || true
log "ruleset applied and enabled at boot"

# ---------------------------------------------------------------- sshd
# Root by key remains for now: there are no named administrators on this host yet, and disabling it before
# they exist would leave no way in at all. Superseded by IS-I1-04 once service and admin users are created.
install -d -m 755 /etc/ssh/sshd_config.d
cat > /etc/ssh/sshd_config.d/10-bcb-hardening.conf <<EOF
PermitRootLogin prohibit-password
PasswordAuthentication no
KbdInteractiveAuthentication no
ChallengeResponseAuthentication no
PermitEmptyPasswords no
MaxAuthTries 3
LoginGraceTime 30
X11Forwarding no
AllowAgentForwarding no
AllowTcpForwarding no
ClientAliveInterval 300
ClientAliveCountMax 2
EOF
chmod 644 /etc/ssh/sshd_config.d/10-bcb-hardening.conf
sshd -t || die "sshd config is invalid; not restarting"
systemctl reload ssh || systemctl restart ssh
log "sshd hardened"

# ---------------------------------------------------------------- fail2ban
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
log "fail2ban enabled"

# ---------------------------------------------------------------- verify
log "verifying"
# pipefail is switched off for the checks on purpose. `grep -q` exits at the first match, the writer on the
# left of the pipe then dies of SIGPIPE, and under pipefail a *successful* match returns non-zero. It only
# bites when the left side is slow or verbose enough to still be writing, so it shows up as checks that fail
# at random depending on output size — which is exactly how it presented here.
set +o pipefail
vfail=0
vcheck() { if eval "$2"; then echo "  ok   $1"; else echo "  FAIL $1"; vfail=1; fi; }
vcheck "input policy is drop"        'nft -a list chain inet filter input | grep -q "policy drop"'
vcheck "ssh port accepted"           "nft list ruleset | grep -q 'tcp dport $SSH_PORT'"
vcheck "web ports accepted"          'nft list ruleset | grep -qE "dport \{ 80, 443 \}|dport \{ 443, 80 \}"'
vcheck "forward policy is drop"      'nft -a list chain inet filter forward | grep -q "policy drop"'
vcheck "nftables enabled at boot"    'systemctl is-enabled nftables >/dev/null 2>&1'
vcheck "password auth disabled"      'sshd -T | grep -qx "passwordauthentication no"'
# sshd -T renders prohibit-password under its historical name without-password; both spellings mean the
# same setting, so the check accepts either rather than pinning today's wording.
vcheck "root password login refused" 'sshd -T | grep -qE "^permitrootlogin (prohibit-password|without-password)$"'
vcheck "fail2ban running"            'systemctl is-active fail2ban >/dev/null 2>&1'
vcheck "sshd jail active"            'fail2ban-client status sshd >/dev/null 2>&1'
vcheck "rollback armed"              '[ -f /run/bcb-nft-pending ]'
[ "$vfail" = 0 ] || die "hardening incomplete"

log "DONE. Reconnect in a NEW session to prove the rules did not lock you out, then run:"
log "  $0 --confirm"
