#!/bin/bash
# Audit trail and file integrity: auditd rules for the events that matter, AIDE watching the paths that
# should not change by themselves, and journald bounded so logs cannot fill the encrypted volume.
#
# This is the compensating-control half of the owner's decision not to run an EDR agent: without it the
# host has no record of who changed what, and "no agent" would mean "no visibility" rather than "a lighter
# set of controls". See DEFERRED_INFRA_TRIGGERS.md D-3.
set -uo pipefail

RELEASE_ROOT=/opt/bersoncarebot
JOURNAL_MAX="${BCB_JOURNAL_MAX:-2G}"

log() { echo "[audit] $*"; }
die() { echo "[audit] FATAL: $*" >&2; exit 1; }
[ "$(id -u)" = 0 ] || die "must run as root"
export DEBIAN_FRONTEND=noninteractive

command -v auditctl >/dev/null || { apt-get update -qq; apt-get install -y -qq --no-install-recommends auditd audispd-plugins; }
command -v aide >/dev/null || apt-get install -y -qq --no-install-recommends aide aide-common

# ---------------------------------------------------------------- auditd
# Rules are deliberately few. An audit log nobody can read is the same as no audit log, and every extra
# rule costs disk on a volume that also holds the database.
cat > /etc/audit/rules.d/10-bcb.rules <<EOF
# Managed by deploy/host/setup-audit-and-integrity.sh
-D
-b 8192
-f 1

# Who exists on this host and what they may do.
-w /etc/passwd -p wa -k identity
-w /etc/shadow -p wa -k identity
-w /etc/group -p wa -k identity
-w /etc/sudoers -p wa -k privilege
-w /etc/sudoers.d/ -p wa -k privilege

# Remote access configuration.
-w /etc/ssh/sshd_config -p wa -k sshd_config
-w /etc/ssh/sshd_config.d/ -p wa -k sshd_config
-w /root/.ssh/ -p wa -k ssh_keys

# What the machine runs and how it is confined.
-w /etc/systemd/system/ -p wa -k units
-w /etc/nftables.conf -p wa -k firewall

# Secrets and released code. Reading an environment file is itself worth a record: it is the one action
# that turns host access into database access.
-w $RELEASE_ROOT/env -p rwa -k secrets
-w $RELEASE_ROOT/releases -p wa -k releases

# Privilege escalation and its refusals.
-a always,exit -F arch=b64 -S execve -F euid=0 -F auid>=1000 -F auid!=unset -k root_cmd
-w /usr/bin/sudo -p x -k privilege
-w /usr/bin/su -p x -k privilege

# The clock: a shifted clock makes every other record untrustworthy.
-a always,exit -F arch=b64 -S adjtimex,settimeofday,clock_settime -k time_change
EOF

augenrules --load >/dev/null 2>&1 || auditctl -R /etc/audit/rules.d/10-bcb.rules >/dev/null 2>&1
systemctl enable --now auditd >/dev/null 2>&1 || true

# ---------------------------------------------------------------- journald bounds
install -d -m 0755 /etc/systemd/journald.conf.d
cat > /etc/systemd/journald.conf.d/10-bcb.conf <<EOF
[Journal]
Storage=persistent
# Bounded on purpose: logs share the encrypted volume with the database, and an unbounded journal turns a
# noisy service into a full disk, which is an outage with no attacker involved.
SystemMaxUse=$JOURNAL_MAX
SystemKeepFree=1G
MaxRetentionSec=90day
ForwardToSyslog=no
EOF
systemctl restart systemd-journald >/dev/null 2>&1 || true

# ---------------------------------------------------------------- AIDE
cat > /etc/aide/aide.conf.d/99-bcb <<EOF
# Managed by deploy/host/setup-audit-and-integrity.sh
!/var/log/.*
!/var/lib/postgresql/.*
!/var/lib/bersoncarebot/.*
!/proc/.*
!/sys/.*
!/run/.*
/etc                     Full
/usr/bin                 Full
/usr/sbin                Full
/usr/lib/systemd         Full
$RELEASE_ROOT/releases   Full
EOF

if [ ! -s /var/lib/aide/aide.db ]; then
  log "building the initial AIDE database (a few minutes)"
  aideinit -y -f >/dev/null 2>&1 || aide --init --config /etc/aide/aide.conf >/dev/null 2>&1 || true
  [ -s /var/lib/aide/aide.db.new ] && mv /var/lib/aide/aide.db.new /var/lib/aide/aide.db
fi
chmod 0600 /var/lib/aide/aide.db 2>/dev/null || true

# ---------------------------------------------------------------- verify
log "verifying"
set +o pipefail   # grep -q plus pipefail turns a successful match into a failure
vfail=0
vcheck() { if eval "$2"; then echo "  ok   $1"; else echo "  FAIL $1"; vfail=1; fi; }

vcheck "auditd running"               'systemctl is-active auditd'
vcheck "auditd enabled at boot"       'systemctl is-enabled auditd'
# Asked of the running kernel, not of the rules file: a rule that failed to load is exactly the case worth
# catching, and the file on disk says nothing about that.
# auditctl prints file watches as "-w /path -p wa -k name" but syscall rules as "... key=name". Matching
# only the second form reports missing rules that are in fact loaded — the tag is accepted in either shape.
akey() { auditctl -l | grep -qE -- "-k $1( |$)|key=$1( |$)"; }
vcheck "identity rules loaded"        'akey identity'
vcheck "secrets rule loaded"          'akey secrets'
vcheck "privilege rules loaded"       'akey privilege'
vcheck "time-change rule loaded"      'akey time_change'
vcheck "sshd config watched"          'akey sshd_config'
vcheck "unit directory watched"       'akey units'
vcheck "firewall config watched"      'akey firewall'
vcheck "root command execution logged" 'akey root_cmd'
vcheck "audit log is not world-readable" '[ "$(stat -c %a /var/log/audit/audit.log)" -le 640 ]'
vcheck "journal storage is persistent" 'journalctl --header 2>/dev/null | grep -q "File path: /var/log/journal"'
vcheck "journal size is bounded"      'grep -q "SystemMaxUse=" /etc/systemd/journald.conf.d/10-bcb.conf'
vcheck "aide database exists"         '[ -s /var/lib/aide/aide.db ]'
vcheck "aide database is 0600"        '[ "$(stat -c %a /var/lib/aide/aide.db)" = 600 ]'
vcheck "aide daily check scheduled"   'systemctl list-timers --all | grep -q dailyaidecheck || [ -x /etc/cron.daily/aide ]'

[ "$vfail" = 0 ] || die "audit and integrity setup incomplete"
log "DONE"
