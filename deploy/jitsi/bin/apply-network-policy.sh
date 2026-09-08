#!/usr/bin/env bash
# Install the additive TEST-only Jitsi/coturn nftables filter and its boot unit.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:---check}"
EXPECTED_HOST_IP="151.241.228.122"
SOURCE_CONF="$HERE/nftables-bcb-jitsi-test.conf"
SOURCE_UNIT="$HERE/../systemd/bersoncarebot-jitsi-test-network-policy.service"
TARGET_CONF="/etc/nftables-bcb-jitsi-test.conf"
TARGET_UNIT="/etc/systemd/system/bersoncarebot-jitsi-test-network-policy.service"
BACKUP_ROOT="/var/backups/bersoncare-jitsi-test-network-policy"

fail() { echo "[jitsi-test-network] FATAL: $*" >&2; exit 1; }
[[ "$MODE" == --check || "$MODE" == --apply ]] || fail "usage: $0 [--check|--apply]"
[[ "$(id -u)" == 0 ]] || fail "$MODE must run as root"
hostname -I | tr ' ' '\n' | grep -Fxq "$EXPECTED_HOST_IP" \
  || fail "this script targets only TEST host $EXPECTED_HOST_IP"
[[ -f "$SOURCE_CONF" && -f "$SOURCE_UNIT" ]] || fail "repository policy artifacts are missing"
command -v nft >/dev/null 2>&1 || fail "nft is unavailable"

check_file="$(mktemp /tmp/bcb-jitsi-test-network-check.XXXXXX)"
cleanup() { rm -f "$check_file"; }
trap cleanup EXIT
printf 'flush ruleset\n' >"$check_file"
sed -n '1,$p' "$SOURCE_CONF" >>"$check_file"
nft -c -f "$check_file"
systemd-analyze verify "$SOURCE_UNIT"
if [[ "$MODE" == --check ]]; then
  echo "[jitsi-test-network] syntax and unit checks passed; no host state changed"
  exit 0
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_dir="$BACKUP_ROOT/$timestamp"
install -d -m 0700 -o root -g root "$backup_dir"
[[ ! -e "$TARGET_CONF" ]] || cp -a -- "$TARGET_CONF" "$backup_dir/"
[[ ! -e "$TARGET_UNIT" ]] || cp -a -- "$TARGET_UNIT" "$backup_dir/"
install -m 0600 -o root -g root "$SOURCE_CONF" "$TARGET_CONF"
install -m 0644 -o root -g root "$SOURCE_UNIT" "$TARGET_UNIT"
systemctl daemon-reload
systemctl enable bersoncarebot-jitsi-test-network-policy.service >/dev/null
systemctl restart bersoncarebot-jitsi-test-network-policy.service
systemctl is-active --quiet bersoncarebot-jitsi-test-network-policy.service \
  || fail "network policy unit is not active"
nft list table inet bcb_jitsi_test >/dev/null
echo "[jitsi-test-network] applied; backup: $backup_dir"
