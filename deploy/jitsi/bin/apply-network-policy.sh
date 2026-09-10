#!/usr/bin/env bash
# Install this profile's Jitsi/coturn network policy and its boot unit.
#
# The two profiles need *different* policy shapes because the two hosts have opposite base policies:
#   test — base policy ACCEPT, so nftables-bcb-jitsi-test.conf is a reject-table that runs AFTER the main
#          filter chain (priority filter + 10) and narrows the raw media ports to the trusted sources.
#   prod — the host's own /etc/nftables.conf declares `table inet filter` with `input`/`forward` chains at
#          `policy drop`, so there is nothing to narrow and everything to open. This profile therefore owns
#          NO table of its own: nftables-therapysto-jitsi-prod.conf adds two regular chains to the host's
#          existing `inet filter` table and jumps into them from its two base chains. A separate table at
#          an earlier priority — the shape this file used to install here — cannot open a port on a
#          drop-policy host at all, because an `accept` ends evaluation of its own chain only and the
#          packet still meets the drop-policy chain on the same hook.
# Which conf, unit, table/chains and backup root are used comes from bin/lib/profile.sh; there is no default
# profile and the legacy production host is refused under both.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/profile.sh
source "$HERE/bin/lib/profile.sh"

MODE="${1:---check}"
SOURCE_CONF="$HERE/$JITSI_NFT_SOURCE_CONF_NAME"
SOURCE_UNIT="$HERE/../systemd/$JITSI_NFT_UNIT_NAME"
TARGET_CONF="$JITSI_NFT_TARGET_CONF"
TARGET_UNIT="/etc/systemd/system/$JITSI_NFT_UNIT_NAME"
BACKUP_ROOT="$JITSI_NFT_BACKUP_ROOT"

fail() { echo "[jitsi-${JITSI_DEPLOYMENT}-network] FATAL: $*" >&2; exit 1; }
[[ "$MODE" == --check || "$MODE" == --apply ]] || fail "usage: $0 [--check|--apply]"
[[ "$(id -u)" == 0 ]] || fail "$MODE must run as root"
jitsi_require_host
[[ -f "$SOURCE_CONF" && -f "$SOURCE_UNIT" ]] || fail "repository policy artifacts are missing ($SOURCE_CONF, $SOURCE_UNIT)"
command -v nft >/dev/null 2>&1 || fail "nft is unavailable"

if [[ "$JITSI_DEPLOYMENT" == prod ]]; then
  # Validate the file exactly as it will be applied — against the LIVE ruleset. Prepending `flush ruleset`
  # (the test path below) would check it against an empty one, in which the `inet filter` table and the
  # `input`/`forward` base chains it adds to do not exist; a conf that only parses under a flushed ruleset
  # would prove nothing about this host. `nft -c` here therefore also fails closed when those base chains
  # are missing, which is the prerequisite this profile actually depends on.
  nft -c -f "$SOURCE_CONF" || fail "$SOURCE_CONF is not valid against this host's live ruleset"
else
  # The TEST conf declares a private table, so it is checked in isolation from a flushed ruleset.
  check_file="$(mktemp "/tmp/${JITSI_COMPOSE_PROJECT}-network-check.XXXXXX")"
  cleanup() { rm -f "$check_file"; }
  trap cleanup EXIT
  printf 'flush ruleset\n' >"$check_file"
  sed -n '1,$p' "$SOURCE_CONF" >>"$check_file"
  nft -c -f "$check_file"
fi
systemd-analyze verify "$SOURCE_UNIT"

# --- PROD: idempotent teardown and post-apply verification -----------------------------------------
# The chains this profile installs live inside the HOST's own `inet filter` table, so `nft delete table`
# — the one-liner the TEST unit uses on its own private table — is not available here: it would delete the
# host's entire firewall. Removal is two ordered steps instead, and the order is not optional: nftables
# refuses to delete a chain that is still the target of a jump.
prod_remove_policy() {
  local base chain handle err
  for base in input forward; do
    # Delete every jump into either of our chains. There can be more than one — an apply interrupted
    # between adding the jump and finishing, or a plain `systemctl restart` of the unit, which re-runs
    # `nft -f` and appends a second copy. Handles shift after each delete, so re-read the chain each time.
    while :; do
      handle="$(nft -a list chain inet filter "$base" 2>/dev/null \
        | awk -v a="$JITSI_NFT_CHAIN_IN" -v b="$JITSI_NFT_CHAIN_FWD" '
            $1 == "jump" && ($2 == a || $2 == b) {
              for (i = 1; i <= NF; i++) if ($i == "handle") { print $(i + 1); exit }
            }')"
      [[ -n "$handle" ]] || break
      nft delete rule inet filter "$base" handle "$handle" \
        || fail "could not delete the existing 'jump' rule (handle $handle) from chain inet filter $base"
    done
  done
  for chain in "$JITSI_NFT_CHAIN_IN" "$JITSI_NFT_CHAIN_FWD"; do
    if ! err="$(nft delete chain inet filter "$chain" 2>&1)"; then
      # "No such file or directory" is the expected first-apply case. Anything else — in particular a chain
      # still referenced by a jump the loop above failed to find — must stop the run instead of letting
      # `nft -f` append a second set of rules to a chain that survived.
      [[ "$err" == *"No such file or directory"* ]] \
        || fail "could not remove the existing chain inet filter $chain: $err"
    fi
  done
}

# Post-apply proof. Both chains must exist AND both jumps must be present: either half alone is a policy
# that changes nothing. This proves the rules are INSTALLED, not that they are REACHED — if the host's own
# input/forward chains ever gain a terminal drop/reject rule ahead of the appended jump, this check still
# passes while nothing gets through. Only a live packet proves reachability, and this script does not
# pretend otherwise (RUNBOOK.md is where that proof belongs).
prod_verify_policy() {
  local chain
  for chain in "$JITSI_NFT_CHAIN_IN" "$JITSI_NFT_CHAIN_FWD"; do
    nft list chain inet filter "$chain" >/dev/null 2>&1 \
      || fail "chain inet filter $chain is absent after applying $TARGET_CONF — the policy did not land"
  done
  nft list chain inet filter input | grep -Fq "jump $JITSI_NFT_CHAIN_IN" \
    || fail "chain inet filter input carries no 'jump $JITSI_NFT_CHAIN_IN' — coturn's ports (udp 3478, tcp 3478, tcp 5349, udp 49152-49252) are still subject to this host's drop policy"
  nft list chain inet filter forward | grep -Fq "jump $JITSI_NFT_CHAIN_FWD" \
    || fail "chain inet filter forward carries no 'jump $JITSI_NFT_CHAIN_FWD' — JVB media (udp 10000, tcp 4443) is DNAT'd into 172.30.110.0/24 and traverses forward, not input, so it would still be dropped"
}

if [[ "$MODE" == --check ]]; then
  if [[ "$JITSI_DEPLOYMENT" == prod ]]; then
    echo "[jitsi-${JITSI_DEPLOYMENT}-network] policy file parses against this host's live ruleset and the boot unit verifies; no host state changed"
  else
    echo "[jitsi-${JITSI_DEPLOYMENT}-network] syntax and unit checks passed; no host state changed"
  fi
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
systemctl enable "$JITSI_NFT_UNIT_NAME" >/dev/null
# On prod the unit deliberately carries no teardown of its own (it must never `delete table inet filter`),
# so the removal happens here, immediately before the unit re-applies the file.
[[ "$JITSI_DEPLOYMENT" != prod ]] || prod_remove_policy
systemctl restart "$JITSI_NFT_UNIT_NAME"
systemctl is-active --quiet "$JITSI_NFT_UNIT_NAME" \
  || fail "network policy unit is not active"
if [[ "$JITSI_DEPLOYMENT" == prod ]]; then
  prod_verify_policy
else
  nft list table inet "$JITSI_NFT_TABLE" >/dev/null
fi
echo "[jitsi-${JITSI_DEPLOYMENT}-network] applied; backup: $backup_dir"
