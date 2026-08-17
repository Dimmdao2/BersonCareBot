#!/bin/sh
# Stage A of the encrypted host build. Runs INSIDE the provider rescue system (BusyBox, kernel without
# dm-crypt), so it cannot create LUKS itself. It lays down the final partition table and installs a
# throwaway Ubuntu 24.04 into a temporary partition at the END of the disk, whose only job is to give us a
# modern kernel that can do dm-crypt. Stage B runs from that system; stage C reclaims the temporary space.
#
#   DESTROYS EVERYTHING ON THE TARGET DISK. Requires BCB_WIPE_CONFIRM=yes-wipe-<disk basename>.
#
# Layout produced (disk order matters: the temporary partition must be last so stage C can grow p3 into it):
#   p1  8 MiB   bios_grub          BIOS-legacy boot, no filesystem
#   p2  2 GiB   ext4  /boot        unencrypted on purpose: grub reads the kernel from here
#   p3  rest    raw                stage B makes this LUKS2 + LVM (root + swap)
#   p4  8 GiB   ext4               temporary installer system, removed in stage C
set -eu

DISK="${BCB_DISK:-/dev/sda}"
SUITE="${BCB_SUITE:-noble}"
MIRROR="${BCB_MIRROR:-http://mirror.yandex.ru/ubuntu}"
TMP_PART_MIB="${BCB_TMP_PART_MIB:-8192}"
BOOT_END_MIB=2057
WORK=/run/inst
TARGET=/mnt/tmpsys

log() { echo "[stage-a] $*"; }
die() { echo "[stage-a] FATAL: $*" >&2; exit 1; }

# ---------------------------------------------------------------- guards
[ "$(id -u)" = 0 ] || die "must run as root"
[ -b "$DISK" ] || die "$DISK is not a block device"
[ "${BCB_WIPE_CONFIRM:-}" = "yes-wipe-$(basename "$DISK")" ] ||
  die "refusing to wipe $DISK: set BCB_WIPE_CONFIRM=yes-wipe-$(basename "$DISK")"
if grep -q " $(basename "$DISK")" /proc/mounts 2>/dev/null; then
  die "$DISK has mounted partitions; unmount before wiping"
fi
[ -n "${BCB_SSH_PUBKEY:-}" ] || die "BCB_SSH_PUBKEY is required, otherwise the temporary system is unreachable"
[ -n "${BCB_NET_IP:-}" ] || die "BCB_NET_IP is required (e.g. 135.106.187.95/24)"
[ -n "${BCB_NET_GW:-}" ] || die "BCB_NET_GW is required"
[ -n "${BCB_NET_MAC:-}" ] || die "BCB_NET_MAC is required, the interface is matched by MAC"
BCB_NET_DNS="${BCB_NET_DNS:-1.1.1.1}"

DISK_MIB=$(( $(blockdev --getsize64 "$DISK") / 1048576 ))
[ "$DISK_MIB" -gt $(( BOOT_END_MIB + TMP_PART_MIB + 10240 )) ] || die "disk too small: ${DISK_MIB} MiB"
LUKS_END_MIB=$(( DISK_MIB - TMP_PART_MIB ))
log "disk ${DISK_MIB} MiB; boot 9..${BOOT_END_MIB}; luks ${BOOT_END_MIB}..${LUKS_END_MIB}; temp ${LUKS_END_MIB}..end"

# ---------------------------------------------------------------- partition
log "wiping partition table on $DISK"
dd if=/dev/zero of="$DISK" bs=1M count=16 conv=fsync 2>/dev/null
sgdisk_missing=1
parted -s "$DISK" mklabel gpt
parted -s -a optimal "$DISK" mkpart bios_grub 1MiB 9MiB
parted -s "$DISK" set 1 bios_grub on
parted -s -a optimal "$DISK" mkpart bcb-boot ext4 9MiB "${BOOT_END_MIB}MiB"
parted -s -a optimal "$DISK" mkpart bcb-crypt "${BOOT_END_MIB}MiB" "${LUKS_END_MIB}MiB"
parted -s -a optimal "$DISK" mkpart bcb-tmpsys ext4 "${LUKS_END_MIB}MiB" 100%
[ "$sgdisk_missing" = 1 ] || true
sync
sleep 2
parted -s "$DISK" print

P_BOOT="${DISK}2"
P_TMP="${DISK}4"
[ -b "$P_BOOT" ] || die "$P_BOOT did not appear"
[ -b "$P_TMP" ] || die "$P_TMP did not appear"

log "formatting $P_BOOT (boot) and $P_TMP (temporary system)"
mkfs.ext4 -F -q -L bcb-boot "$P_BOOT"
mkfs.ext4 -F -q -L bcb-tmpsys "$P_TMP"

# ---------------------------------------------------------------- root filesystem
# debootstrap is NOT usable here: it needs perl or a compiled pkgdetails, and the rescue image has neither
# and no compiler. A prebuilt ubuntu-base rootfs gives the same result without either. HTTP on purpose —
# the rescue wget has no usable CA bundle, and the tarball is verified by checksum below instead.
mkdir -p "$WORK"
mountpoint -q "$WORK" 2>/dev/null || mount -t tmpfs -o size=2G tmpfs "$WORK"

BASE_DIR="${BCB_BASE_DIR:-http://mirror.yandex.ru/ubuntu-cdimage/ubuntu-base/releases/24.04/release}"
if [ ! -f "$WORK/base.tar.gz" ]; then
  BASE_TGZ=$(wget -qO- "$BASE_DIR/" | grep -oE 'ubuntu-base-24\.04[^"<>]*amd64\.tar\.gz' | sort -u | tail -1)
  [ -n "$BASE_TGZ" ] || die "no ubuntu-base tarball found at $BASE_DIR"
  log "fetching $BASE_TGZ"
  wget -q -O "$WORK/base.tar.gz" "$BASE_DIR/$BASE_TGZ" || die "download failed"
  if wget -qO "$WORK/SHA256SUMS" "$BASE_DIR/SHA256SUMS" 2>/dev/null; then
    WANT=$(grep " \*\?$BASE_TGZ\$" "$WORK/SHA256SUMS" | awk '{print $1}' | head -1)
    GOT=$(sha256sum "$WORK/base.tar.gz" | awk '{print $1}')
    [ -n "$WANT" ] && [ "$WANT" = "$GOT" ] || die "checksum mismatch for $BASE_TGZ"
    log "checksum verified"
  else
    die "SHA256SUMS unavailable; refusing to install an unverified rootfs"
  fi
fi

mkdir -p "$TARGET"
mount "$P_TMP" "$TARGET"
log "unpacking the base rootfs into the temporary partition"
tar -xzf "$WORK/base.tar.gz" -C "$TARGET" || die "unpack failed"
[ -x "$TARGET/usr/bin/apt-get" ] || die "unpacked rootfs has no apt"

# ---------------------------------------------------------------- configure
log "configuring the temporary system"
# Filesystem labels, not UUIDs: the rescue ships a BusyBox blkid that ignores -s/-o and prints its whole
# description line, which silently produced an fstab of garbage and would have dropped the first boot into
# an emergency shell. Labels are set by mkfs above and need no parsing at all.
cat > "$TARGET/etc/fstab" <<EOF
LABEL=bcb-tmpsys  /      ext4  errors=remount-ro  0 1
LABEL=bcb-boot    /boot  ext4  defaults           0 2
EOF

echo bcb-tmpsys > "$TARGET/etc/hostname"
printf '127.0.0.1 localhost\n127.0.1.1 bcb-tmpsys\n' > "$TARGET/etc/hosts"

rm -f "$TARGET"/etc/apt/sources.list.d/*.sources "$TARGET"/etc/apt/sources.list.d/*.list 2>/dev/null || true
cat > "$TARGET/etc/apt/sources.list" <<EOF
deb $MIRROR $SUITE main restricted universe multiverse
deb $MIRROR $SUITE-updates main restricted universe multiverse
deb $MIRROR $SUITE-security main restricted universe multiverse
EOF

# cloud-init is deliberately NOT installed: it would rewrite the network from the config drive and fight
# our own file. The interface is matched by MAC, so the kernel's naming scheme cannot break it.
mkdir -p "$TARGET/etc/netplan"
cat > "$TARGET/etc/netplan/01-bcb-static.yaml" <<EOF
network:
  version: 2
  ethernets:
    bcbnet:
      match:
        macaddress: $BCB_NET_MAC
      set-name: eth0
      mtu: 1500
      addresses: [$BCB_NET_IP]
      nameservers:
        addresses: [$BCB_NET_DNS]
      routes:
        - to: 0.0.0.0/0
          via: $BCB_NET_GW
EOF
chmod 600 "$TARGET/etc/netplan/01-bcb-static.yaml"
printf 'nameserver %s\n' "$BCB_NET_DNS" > "$TARGET/etc/resolv.conf"

mkdir -p "$TARGET/root/.ssh"
chmod 700 "$TARGET/root/.ssh"
printf '%s\n' "$BCB_SSH_PUBKEY" > "$TARGET/root/.ssh/authorized_keys"
chmod 600 "$TARGET/root/.ssh/authorized_keys"

for d in dev dev/pts proc sys; do
  mkdir -p "$TARGET/$d"
done
# BusyBox mount understands "-o bind", not the GNU "--bind" spelling; a silent failure here shows up much
# later as "cannot create /dev/null" inside the chroot, so both are attempted and the result is verified.
bind_mount() {
  mount -o bind "$1" "$2" 2>/dev/null || mount --bind "$1" "$2" 2>/dev/null || die "cannot bind $1 -> $2"
}
# devtmpfs is preferred: it materialises the standard nodes with the standard modes. The rescue's own /dev
# is an mdev tmpfs where /dev/null is mode 0660, and apt runs its fetchers as the unprivileged `_apt` user,
# which then fails with "cannot create /dev/null" — hence the explicit mode repair on the bind fallback.
if ! mount -t devtmpfs devtmpfs "$TARGET/dev" 2>/dev/null; then
  bind_mount /dev "$TARGET/dev"
  for n in null zero full random urandom tty; do
    [ -e "$TARGET/dev/$n" ] && chmod 0666 "$TARGET/dev/$n" 2>/dev/null || true
  done
fi
[ -c "$TARGET/dev/null" ] || die "/dev is not visible inside the target"
[ -w "$TARGET/dev/null" ] || die "/dev/null inside the target is not writable"
# /dev/pts is a nice-to-have, so it must never be able to abort the run. It is mounted with plain commands
# rather than through bind_mount(): that helper dies on failure, and a `2>/dev/null` on the call site would
# swallow the very message explaining why — which is exactly how an earlier run exited without a word.
mkdir -p "$TARGET/dev/pts" 2>/dev/null || true
mount -t devpts devpts "$TARGET/dev/pts" 2>/dev/null ||
  mount -o bind /dev/pts "$TARGET/dev/pts" 2>/dev/null ||
  log "warning: /dev/pts unavailable, continuing without it"
mount -t proc proc "$TARGET/proc" || die "cannot mount /proc"
mount -t sysfs sys "$TARGET/sys" || die "cannot mount /sys"
mount "$P_BOOT" "$TARGET/boot" || die "cannot mount $P_BOOT"

cat > "$TARGET/tmp/inside.sh" <<'INSIDE'
set -eu
export DEBIAN_FRONTEND=noninteractive
# The base rootfs ships without gpgv, so the very first apt run cannot verify anything. It is used solely
# to install gpgv and the keyring; every package after that is signature-checked normally. The rootfs
# itself was checksum-verified before it was unpacked, so this window does not widen trust.
APTOPT="-o APT::Sandbox::User=root"
apt-get $APTOPT -o Acquire::AllowInsecureRepositories=true update -qq || true
apt-get $APTOPT -o Acquire::AllowInsecureRepositories=true -o APT::Get::AllowUnauthenticated=true \
  install -y -qq --no-install-recommends gpgv ubuntu-keyring
apt-get $APTOPT update -qq
# systemd-sysv is what actually provides /sbin/init. The base rootfs ships with no init system at all, and
# --no-install-recommends will not pull one in, so leaving it out yields a system that boots the kernel,
# mounts the root filesystem and then panics with "Target filesystem doesn't have requested /sbin/init".
apt-get $APTOPT install -y -qq --no-install-recommends \
  systemd systemd-sysv dbus udev \
  linux-image-generic grub-pc netplan.io systemd-resolved openssh-server \
  cryptsetup cryptsetup-initramfs lvm2 gdisk parted debootstrap ca-certificates
systemctl enable ssh
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
grub-install --target=i386-pc "$DISK_INSIDE"
sed -i 's/^GRUB_TIMEOUT=.*/GRUB_TIMEOUT=3/' /etc/default/grub || true
update-grub
INSIDE
chmod +x "$TARGET/tmp/inside.sh"
log "installing kernel, grub and tooling inside the temporary system"
DISK_INSIDE="$DISK" chroot "$TARGET" /bin/sh -c "DISK_INSIDE=$DISK sh /tmp/inside.sh" || die "chroot stage failed"
rm -f "$TARGET/tmp/inside.sh"

# ---------------------------------------------------------------- verify
# The script exiting 0 has already twice meant "produced a system that cannot boot". Nothing is reported as
# finished until the artefacts a boot actually needs are present on disk.
log "verifying the installed system"
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
[ "$vfail" = 0 ] || die "the installed system would not boot or would be unreachable; not reporting success"

# ---------------------------------------------------------------- finish
sync
umount "$TARGET/boot" || true
umount "$TARGET/sys" || true
umount "$TARGET/proc" || true
umount "$TARGET/dev/pts" 2>/dev/null || true
umount "$TARGET/dev" || true
umount "$TARGET" || true

log "DONE. Turn OFF rescue mode in the provider panel and reboot the server."
log "It will come up as bcb-tmpsys on $BCB_NET_IP with the same SSH key; then run stage B."
