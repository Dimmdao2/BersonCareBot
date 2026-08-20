#!/bin/sh
# Repair pass for a stage A system that was installed before the init system was added to the package list.
# Runs INSIDE the provider rescue. It does not repartition and does not re-download the rootfs: it mounts
# what stage A already produced, installs the missing packages, and then runs the same verification stage A
# now runs, so the outcome is judged by what is on disk rather than by apt exiting 0.
set -eu

DISK="${BCB_DISK:-/dev/sda}"
P_BOOT="${DISK}2"
P_TMP="${DISK}4"
TARGET=/mnt/tmpsys

log() { echo "[repair] $*"; }
die() { echo "[repair] FATAL: $*" >&2; exit 1; }

[ "$(id -u)" = 0 ] || die "must run as root"
[ -b "$P_TMP" ] || die "$P_TMP missing — stage A has not run on this disk"

mkdir -p "$TARGET"
mountpoint -q "$TARGET" 2>/dev/null || mount "$P_TMP" "$TARGET" || die "cannot mount $P_TMP"
[ -d "$TARGET/etc/apt" ] || die "$P_TMP does not hold a stage A system"

if ! mount -t devtmpfs devtmpfs "$TARGET/dev" 2>/dev/null; then
  mount -o bind /dev "$TARGET/dev" || die "cannot provide /dev"
  for n in null zero full random urandom tty; do
    [ -e "$TARGET/dev/$n" ] && chmod 0666 "$TARGET/dev/$n" 2>/dev/null || true
  done
fi
[ -w "$TARGET/dev/null" ] || die "/dev/null inside the target is not writable"
mkdir -p "$TARGET/dev/pts" 2>/dev/null || true
mount -t devpts devpts "$TARGET/dev/pts" 2>/dev/null || log "warning: no /dev/pts"
mount -t proc proc "$TARGET/proc" || die "cannot mount /proc"
mount -t sysfs sys "$TARGET/sys" || die "cannot mount /sys"
mount "$P_BOOT" "$TARGET/boot" || die "cannot mount $P_BOOT"

log "installing the missing init system"
chroot "$TARGET" /bin/sh -c '
set -eu
export DEBIAN_FRONTEND=noninteractive
APTOPT="-o APT::Sandbox::User=root"
apt-get $APTOPT update -qq
apt-get $APTOPT install -y -qq --no-install-recommends systemd systemd-sysv dbus udev
update-initramfs -u
update-grub
' || die "chroot repair failed"

log "verifying"
vfail=0
vcheck() { if eval "$2"; then echo "  ok   $1"; else echo "  FAIL $1"; vfail=1; fi; }
vcheck "/sbin/init exists"            '[ -e "$TARGET/sbin/init" ] || [ -L "$TARGET/sbin/init" ]'
vcheck "systemd binary present"       '[ -x "$TARGET/usr/lib/systemd/systemd" ]'
vcheck "kernel on /boot"              'ls "$TARGET"/boot/vmlinuz-* >/dev/null 2>&1'
vcheck "initrd on /boot"              'ls "$TARGET"/boot/initrd.img-* >/dev/null 2>&1'
vcheck "grub.cfg on /boot"            '[ -s "$TARGET/boot/grub/grub.cfg" ]'
vcheck "grub core written to disk"    'dd if="$DISK" bs=512 count=1 2>/dev/null | grep -qa GRUB'
vcheck "fstab has no stray quotes"    '! grep -q "\"" "$TARGET/etc/fstab"'
vcheck "fstab root entry"             'grep -qE "^LABEL=bcb-tmpsys[[:space:]]+/[[:space:]]" "$TARGET/etc/fstab"'
vcheck "netplan present"              '[ -s "$TARGET/etc/netplan/01-bcb-static.yaml" ]'
vcheck "ssh authorized_keys"          '[ -s "$TARGET/root/.ssh/authorized_keys" ]'
vcheck "sshd installed"               '[ -x "$TARGET/usr/sbin/sshd" ]'
vcheck "ssh enabled at boot"          '[ -L "$TARGET/etc/systemd/system/multi-user.target.wants/ssh.service" ]'
vcheck "cryptsetup for stage B"       '[ -x "$TARGET/usr/sbin/cryptsetup" ]'

sync
umount "$TARGET/boot" 2>/dev/null || true
umount "$TARGET/sys" 2>/dev/null || true
umount "$TARGET/proc" 2>/dev/null || true
umount "$TARGET/dev/pts" 2>/dev/null || true
umount "$TARGET/dev" 2>/dev/null || true
umount "$TARGET" 2>/dev/null || true

[ "$vfail" = 0 ] || die "system still would not boot cleanly"
log "DONE. Turn OFF rescue mode and reboot."
