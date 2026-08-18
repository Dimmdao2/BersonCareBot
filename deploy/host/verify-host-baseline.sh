#!/bin/bash
# Read-only acceptance check of the whole host. Changes nothing, exits non-zero if any expectation is unmet.
#
# This is the instrument the plan's acceptance is read from, so it deliberately asks the running system
# rather than the files that were supposed to configure it: "is the root filesystem actually on a LUKS
# device" instead of "does crypttab mention one". A check that only re-reads our own intent proves nothing.
#
#   --json   emit one JSON object per check instead of the human table
# Not -e: the point is to run every check and report all of them. Not pipefail either: every predicate here
# ends in `grep -q`, which exits at the first match and leaves the writer to die of SIGPIPE — under pipefail
# a successful match is reported as a failure, and only for the checks whose output is long enough to still
# be flowing. That produces confident red results on a correct machine.
set -u

JSON=0
[ "${1:-}" = "--json" ] && JSON=1
PG_VERSION="${BCB_PG_VERSION:-16}"
SERVICES="webapp api worker scheduler media-worker"

pass=0; fail=0; failed_names=()

check() { # name, predicate
  local name="$1" pred="$2"
  if eval "$pred" >/dev/null 2>&1; then
    pass=$((pass+1))
    [ "$JSON" = 1 ] && printf '{"check":%s,"result":"pass"}\n' "$(printf '%s' "$name" | jq -R .)" \
                    || printf '  ok    %s\n' "$name"
  else
    fail=$((fail+1)); failed_names+=("$name")
    [ "$JSON" = 1 ] && printf '{"check":%s,"result":"fail"}\n' "$(printf '%s' "$name" | jq -R .)" \
                    || printf '  FAIL  %s\n' "$name"
  fi
}

section() { [ "$JSON" = 1 ] || printf '\n[%s]\n' "$1"; }

section "storage and encryption"
# The question is about the device the root filesystem is really mounted from, not about configuration.
# `lsblk -ns` walks *down* the ancestry, so tailing it lands on the physical disk, not on the crypt layer.
# The device chain is asked for the entry whose type is literally "crypt".
# -r (raw) matters: without it lsblk draws the tree and the name comes back as "└─bcbcrypt", which is not
# a device anything can be asked about.
crypt_dev() { lsblk -nsr -o NAME,TYPE "$(findmnt -no SOURCE /)" | awk '$2=="crypt"{print $1; exit}'; }
check "root filesystem sits on a dm-crypt device" '[ -n "$(crypt_dev)" ]'
check "container is LUKS2" 'cryptsetup status "$(crypt_dev)" | grep -q "type: *LUKS2"'
check "swap is inside the encrypted container" \
  '[ -n "$(swapon --noheadings --show=NAME)" ] && lsblk -no TYPE "$(swapon --noheadings --show=NAME | head -1)" | grep -q lvm'
check "no plaintext swap file or partition" \
  '! swapon --noheadings --show=NAME | grep -qvE "^/dev/(mapper|dm-)"'
check "/boot is a separate filesystem" 'findmnt -no TARGET /boot | grep -q /boot'
check "LUKS2 header uses aes-xts-plain64" 'cryptsetup status "$(crypt_dev)" | grep -q aes-xts-plain64'

section "network perimeter"
check "nftables input policy is drop" 'nft list chain inet filter input | grep -q "policy drop"'
check "nftables forward policy is drop" 'nft list chain inet filter forward | grep -q "policy drop"'
check "nftables enabled at boot" 'systemctl is-enabled nftables'
check "nothing but ssh/http/https listens publicly" \
  '! ss -tlnH | awk "{print \$4}" | grep -vE "^(127\.|\[::1\]|\*:22$|\[::\]:22$|0\.0\.0\.0:22$|\[::\]:(80|443)$|0\.0\.0\.0:(80|443)$)" | grep -q .'
check "postgres does not listen on tcp" '! ss -tlnH | grep -q ":5432"'

section "ssh"
check "password authentication disabled" 'sshd -T | grep -qx "passwordauthentication no"'
check "keyboard-interactive disabled" 'sshd -T | grep -qx "kbdinteractiveauthentication no"'
check "root cannot log in with a password" \
  'sshd -T | grep -qE "^permitrootlogin (prohibit-password|without-password|no)$"'
check "empty passwords refused" 'sshd -T | grep -qx "permitemptypasswords no"'
check "fail2ban is running" 'systemctl is-active fail2ban'
check "sshd jail is active" 'fail2ban-client status sshd'

section "postgresql"
check "cluster is accepting connections" 'pg_isready -q'
check "data checksums are on" 'su - postgres -c "psql -tAc \"show data_checksums\"" | grep -q on'
check "listen_addresses is empty" \
  '[ -z "$(su - postgres -c "psql -tAc \"show listen_addresses\"" | tr -d "[:space:]")" ]'
check "password encryption is scram-sha-256" \
  'su - postgres -c "psql -tAc \"show password_encryption\"" | grep -q scram-sha-256'
check "statement text is not logged" 'su - postgres -c "psql -tAc \"show log_statement\"" | grep -q none'
check "host auth does not trust anyone" \
  '! grep -vE "^\s*#" "/etc/postgresql/$PG_VERSION/main/pg_hba.conf" | grep -qw trust'

section "service accounts and paths"
for svc in $SERVICES; do
  check "user bcb-$svc exists without a shell" 'getent passwd bcb-'"$svc"' | grep -q nologin'
  check "bcb-$svc cannot write the release tree" \
    '! sudo -u bcb-'"$svc"' test -w /opt/bersoncarebot/releases'
done
check "environment directory is root-only" '[ "$(stat -c "%U %a" /opt/bersoncarebot/env)" = "root 750" ]'
check "backup directory is root-only 0700" '[ "$(stat -c "%U %a" /opt/backups)" = "root 700" ]'
check "no world-writable files under /opt" '! find /opt -xdev -type f -perm -0002 -print -quit | grep -q .'
check "no unexpected sudo rights" \
  '! grep -rhvE "^\s*(#|$)" /etc/sudoers /etc/sudoers.d/ 2>/dev/null | grep -qE "NOPASSWD:\s*ALL"'

section "updates and time"
check "unattended-upgrades enabled" 'systemctl is-enabled unattended-upgrades'
# Given a moment to settle. Run seconds after boot, the time service has not answered yet and a healthy
# machine reports its clock as unsynchronised — a red result that says nothing about the host.
# The retry runs in a SUBSHELL. Predicates are evaluated with eval in the current shell, so a bare `exit`
# inside one ends the whole verifier — the first version of this line stopped the run at this check and
# reported success for a pass that never examined the remaining half of the host.
check "clock is synchronised" '( for i in 1 2 3 4 5 6; do timedatectl show -p NTPSynchronized --value | grep -q yes && exit 0; sleep 5; done; exit 1 )'

section "no leftovers from the build"
check "temporary passphrase file absent" '! ls /root/*passphrase* /root/*.pass 2>/dev/null | grep -q .'
check "build scripts removed from /root" '! ls /root/stage-*.sh /root/run-stage-*.sh 2>/dev/null | grep -q .'

if [ "$JSON" = 1 ]; then
  printf '{"summary":{"pass":%d,"fail":%d}}\n' "$pass" "$fail"
else
  printf '\n%d passed, %d failed\n' "$pass" "$fail"
  [ "$fail" -gt 0 ] && printf 'failed: %s\n' "${failed_names[*]}"
fi
[ "$fail" -eq 0 ]
