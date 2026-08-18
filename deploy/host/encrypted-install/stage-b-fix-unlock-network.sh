#!/bin/sh
# Targeted repair for an encrypted system whose initramfs cannot bring up the network, so the unlock prompt
# is unreachable. Runs INSIDE the stage A temporary system (grub entry "Stage A temporary system").
#
# Cause it fixes: the ip= kernel parameter named eth0, which is the name netplan assigns *after* the root
# filesystem is mounted. In the initramfs the interface still carries the kernel's own name, so ipconfig
# reported "eth0: SIOCGIFINDEX: No such device" and configured nothing. Leaving the device field empty makes
# ipconfig use whichever interface exists.
#
# It does not reinstall anything: it opens the existing container, rewrites the parameter, rebuilds the
# initramfs and the boot menu, and reports the interface names actually present for the record.
set -eu

DISK="${BCB_DISK:-/dev/sda}"
P_BOOT="${BCB_BOOT_PART:-${DISK}2}"
P_LUKS="${BCB_LUKS_PART:-${DISK}3}"
MAPNAME="${BCB_MAPNAME:-bcbcrypt}"
VG="${BCB_VG:-bcbvg}"
TARGET=/mnt/target

log() { echo "[fix-net] $*"; }
die() { echo "[fix-net] FATAL: $*" >&2; exit 1; }

[ "$(id -u)" = 0 ] || die "must run as root"
[ "$(cat /etc/hostname)" = "bcb-tmpsys" ] || die "run this from the stage A temporary system"
[ -n "${BCB_LUKS_PASSPHRASE:-}" ] || die "BCB_LUKS_PASSPHRASE is required"
[ -n "${BCB_NET_IP:-}" ] || die "BCB_NET_IP is required"
[ -n "${BCB_NET_GW:-}" ] || die "BCB_NET_GW is required"
[ -n "${BCB_NET_NETMASK:-}" ] || die "BCB_NET_NETMASK is required"

log "interfaces this kernel sees (the initramfs sees the same names):"
for n in /sys/class/net/*; do
  [ "$(basename "$n")" = lo ] && continue
  printf '  %s  driver=%s  mac=%s\n' "$(basename "$n")" \
    "$(basename "$(readlink -f "$n/device/driver" 2>/dev/null)" 2>/dev/null || echo '?')" \
    "$(cat "$n/address" 2>/dev/null)"
done

modprobe dm-crypt 2>/dev/null || true
[ -b "/dev/mapper/$MAPNAME" ] || printf '%s' "$BCB_LUKS_PASSPHRASE" | cryptsetup open "$P_LUKS" "$MAPNAME" - ||
  die "cannot open the container"
vgchange -ay "$VG" >/dev/null 2>&1 || true
mkdir -p "$TARGET"
mountpoint -q "$TARGET" || mount "/dev/$VG/root" "$TARGET" || die "cannot mount the encrypted root"
mountpoint -q "$TARGET/boot" || mount "$P_BOOT" "$TARGET/boot" || die "cannot mount boot"
for fs in dev dev/pts proc sys run; do mkdir -p "$TARGET/$fs"; done
mount --bind /dev "$TARGET/dev" 2>/dev/null || true
mount --bind /dev/pts "$TARGET/dev/pts" 2>/dev/null || true
mount -t proc proc "$TARGET/proc" 2>/dev/null || true
mount -t sysfs sys "$TARGET/sys" 2>/dev/null || true
mount -t tmpfs tmpfs "$TARGET/run" 2>/dev/null || true

IPPARAM="ip=$BCB_NET_IP::$BCB_NET_GW:$BCB_NET_NETMASK:${BCB_HOSTNAME:-bcb-prod}::off"
log "setting GRUB_CMDLINE_LINUX to $IPPARAM"
sed -i "s|^GRUB_CMDLINE_LINUX=.*|GRUB_CMDLINE_LINUX=\"$IPPARAM\"|" "$TARGET/etc/default/grub"

chroot "$TARGET" /bin/sh -c 'set -eu; update-initramfs -u -k all; update-grub' || die "rebuild failed"

log "verifying"
vfail=0
vcheck() { if eval "$2"; then echo "  ok   $1"; else echo "  FAIL $1"; vfail=1; fi; }
vcheck "ip= present in grub.cfg"       'grep -q "ip=$BCB_NET_IP" "$TARGET/boot/grub/grub.cfg"'
vcheck "ip= names no interface"        '! grep -qE "ip=$BCB_NET_IP[^ ]*:(eth|ens|enp)[a-z0-9]*:" "$TARGET/boot/grub/grub.cfg"'
vcheck "initramfs carries dropbear"    'lsinitramfs "$TARGET"/boot/initrd.img-* 2>/dev/null | grep -q dropbear'
vcheck "initramfs carries cryptsetup"  'lsinitramfs "$TARGET"/boot/initrd.img-* 2>/dev/null | grep -q "cryptsetup\|cryptroot"'
vcheck "initramfs carries a net driver" 'lsinitramfs "$TARGET"/boot/initrd.img-* 2>/dev/null | grep -qE "virtio_net|e1000|vmxnet3"'
vcheck "recovery entry still present"  'grep -q "Stage A temporary system" "$TARGET/boot/grub/grub.cfg"'

sync
for m in run sys proc dev/pts dev boot ""; do umount "$TARGET/$m" 2>/dev/null || true; done
umount "$TARGET" 2>/dev/null || true

[ "$vfail" = 0 ] || die "not fixed"
log "DONE. Reboot into the default entry; the unlock prompt should now be reachable over SSH."
