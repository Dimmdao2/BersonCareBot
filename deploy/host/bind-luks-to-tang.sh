#!/bin/bash
# Binds the production LUKS volume to the tang server on the secondary host, so the machine unlocks itself
# after a reboot instead of waiting for a human to type a passphrase.
#
# What this actually buys: availability without weakening the disk. The unlock needs a live exchange with a
# server at a different provider, so a stolen disk image — a snapshot, a decommissioned volume, a copy taken
# by the hosting company — still decrypts to nothing. What it does not survive is an attacker who holds both
# the image and network access to tang, which is precisely why tang lives somewhere else.
#
# The passphrase slot is deliberately kept. If the secondary host is gone, unreachable, or its keys are
# rotated, the machine must still be openable by hand — an automatic unlock that is the ONLY unlock is a
# single point of failure wearing the costume of convenience.
set -uo pipefail

LUKS_DEV="${BCB_LUKS_DEV:-/dev/sda3}"
TANG_URL="${BCB_TANG_URL:?BCB_TANG_URL is required, e.g. http://81.26.183.196:7500}"

log() { echo "[clevis] $*"; }
die() { echo "[clevis] FATAL: $*" >&2; exit 1; }
[ "$(id -u)" = 0 ] || die "must run as root"
[ -n "${BCB_LUKS_PASSPHRASE:-}" ] || die "BCB_LUKS_PASSPHRASE is required to add a keyslot"
export DEBIAN_FRONTEND=noninteractive

cryptsetup isLuks --type luks2 "$LUKS_DEV" || die "$LUKS_DEV is not a LUKS2 device"

apt-get update -qq
apt-get install -y -qq --no-install-recommends clevis clevis-luks clevis-initramfs curl

# Reachability is checked before touching keyslots. Binding against an unreachable tang would succeed
# locally and fail only at the next boot, which is the worst possible moment to discover it.
log "checking that tang answers from this host"
curl -sf --max-time 10 "$TANG_URL/adv" -o /tmp/tang-adv.json || die "tang at $TANG_URL does not answer from here"
grep -q payload /tmp/tang-adv.json || die "tang answered but did not advertise keys"

SLOTS_BEFORE=$(cryptsetup luksDump "$LUKS_DEV" | grep -c "^  [0-9]*: luks2")

if clevis luks list -d "$LUKS_DEV" 2>/dev/null | grep -q tang; then
  log "a tang binding already exists; leaving it alone"
else
  log "binding $LUKS_DEV to $TANG_URL"
  # -y accepts the advertised key. The exchange is pinned to whatever tang serves right now; rotating tang's
  # keys later requires re-running this, which is why the passphrase slot stays.
  printf '%s' "$BCB_LUKS_PASSPHRASE" |
    clevis luks bind -y -k - -d "$LUKS_DEV" tang "{\"url\":\"$TANG_URL\"}" ||
    die "clevis bind failed"
fi

log "rebuilding the initramfs so the unlock happens at boot"
update-initramfs -u -k all || die "update-initramfs failed"

# ---------------------------------------------------------------- verify
log "verifying"
set +o pipefail   # grep -q plus pipefail turns a successful match into a failure
vfail=0
vcheck() { if eval "$2"; then echo "  ok   $1"; else echo "  FAIL $1"; vfail=1; fi; }
SLOTS_AFTER=$(cryptsetup luksDump "$LUKS_DEV" | grep -c "^  [0-9]*: luks2")

vcheck "tang binding registered"      'clevis luks list -d "$LUKS_DEV" | grep -q tang'
vcheck "binding points at our tang"   'clevis luks list -d "$LUKS_DEV" | grep -q "$(printf %s "$TANG_URL" | sed "s|http://||")"'
vcheck "a keyslot was added"          '[ "$SLOTS_AFTER" -gt "$SLOTS_BEFORE" ]'
# The passphrase must still work. A bind that quietly replaced the only human way in would look identical
# to a successful one until the day the secondary host is down.
vcheck "passphrase slot still opens"  'printf "%s" "$BCB_LUKS_PASSPHRASE" | cryptsetup open --test-passphrase "$LUKS_DEV" -'
vcheck "clevis is in the initramfs"   'lsinitramfs /boot/initrd.img-* 2>/dev/null | grep -q clevis'
vcheck "dropbear still in initramfs"  'lsinitramfs /boot/initrd.img-* 2>/dev/null | grep -q dropbear'
vcheck "network still configured"     'grep -q "ip=" /boot/grub/grub.cfg'

rm -f /tmp/tang-adv.json
[ "$vfail" = 0 ] || die "binding is not safe to reboot into"

log "DONE. Reboot to prove it unlocks unattended; the passphrase and dropbear remain as the way back."
