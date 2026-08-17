#!/bin/sh
# Stage B of the encrypted host build. Runs INSIDE the temporary system produced by stage A, which exists
# only because it has a modern kernel with dm-crypt. It turns the large middle partition into LUKS2 + LVM,
# installs the real Ubuntu into it and wires up remote unlock over SSH at boot.
#
#   DESTROYS the LUKS partition. Requires BCB_LUKS_CONFIRM=yes-format-<partition basename>.
#
# /boot is a single shared partition, and installing a kernel here overwrites the temporary system's kernel
# and initrd because the filenames are identical. Before that happens the temporary pair is copied aside and
# given its own grub entry, so a failed encrypted boot can still be recovered without another rescue cycle.
set -eu

DISK="${BCB_DISK:-/dev/sda}"
P_BOOT="${BCB_BOOT_PART:-${DISK}2}"
P_LUKS="${BCB_LUKS_PART:-${DISK}3}"
P_TMP="${BCB_TMP_PART:-${DISK}4}"
SUITE="${BCB_SUITE:-noble}"
MIRROR="${BCB_MIRROR:-http://mirror.yandex.ru/ubuntu}"
MAPNAME="${BCB_MAPNAME:-bcbcrypt}"
VG="${BCB_VG:-bcbvg}"
SWAP_SIZE="${BCB_SWAP_SIZE:-8G}"
TARGET=/mnt/target

log() { echo "[stage-b] $*"; }
die() { echo "[stage-b] FATAL: $*" >&2; exit 1; }

# ---------------------------------------------------------------- guards
[ "$(id -u)" = 0 ] || die "must run as root"
[ "$(cat /etc/hostname)" = "bcb-tmpsys" ] || die "this must run from the stage A temporary system"
[ -b "$P_LUKS" ] || die "$P_LUKS missing"
[ "${BCB_LUKS_CONFIRM:-}" = "yes-format-$(basename "$P_LUKS")" ] ||
  die "refusing to format $P_LUKS: set BCB_LUKS_CONFIRM=yes-format-$(basename "$P_LUKS")"
[ -n "${BCB_LUKS_PASSPHRASE:-}" ] || die "BCB_LUKS_PASSPHRASE is required"
[ -n "${BCB_SSH_PUBKEY:-}" ] || die "BCB_SSH_PUBKEY is required"
[ -n "${BCB_NET_IP:-}" ] || die "BCB_NET_IP is required (address only, no prefix, e.g. 135.106.187.95)"
[ -n "${BCB_NET_PREFIX:-}" ] || die "BCB_NET_PREFIX is required (e.g. 24)"
[ -n "${BCB_NET_NETMASK:-}" ] || die "BCB_NET_NETMASK is required (e.g. 255.255.255.0)"
[ -n "${BCB_NET_GW:-}" ] || die "BCB_NET_GW is required"
[ -n "${BCB_NET_MAC:-}" ] || die "BCB_NET_MAC is required"
BCB_NET_DNS="${BCB_NET_DNS:-1.1.1.1}"
grep -q " $(basename "$P_LUKS") " /proc/mounts && die "$P_LUKS is mounted"

modprobe dm-crypt 2>/dev/null || true
grep -q xts /proc/crypto || die "kernel has no xts; this is not the stage A system"

# A failed run leaves the target mounted and the container open, which makes the next attempt fail on a
# busy device instead of on the real problem. Re-running must always start from the same clean state.
log "clearing leftovers from any previous attempt"
for m in run sys proc dev/pts dev boot ""; do umount "$TARGET/$m" 2>/dev/null || true; done
umount "$TARGET" 2>/dev/null || true
if [ -b "/dev/$VG/root" ] || vgs "$VG" >/dev/null 2>&1; then
  vgchange -an "$VG" >/dev/null 2>&1 || true
fi
cryptsetup close "$MAPNAME" 2>/dev/null || true

# Verification must be repeatable without reinstalling: a wrong check should cost one minute, not one
# rebuild. With BCB_VERIFY_ONLY=1 the script only opens what already exists and re-runs the checks.
if [ "${BCB_VERIFY_ONLY:-0}" = 1 ]; then
  mountpoint -q /boot || mount "$P_BOOT" /boot || die "cannot mount $P_BOOT"
  [ -b "/dev/mapper/$MAPNAME" ] || printf '%s' "$BCB_LUKS_PASSPHRASE" | cryptsetup open "$P_LUKS" "$MAPNAME" - ||
    die "cannot open the container"
  vgchange -ay "$VG" >/dev/null 2>&1 || true
  mkdir -p "$TARGET"
  mountpoint -q "$TARGET" || mount "/dev/$VG/root" "$TARGET" || die "cannot mount the encrypted root"
  mountpoint -q "$TARGET/boot" || mount "$P_BOOT" "$TARGET/boot" || die "cannot mount boot into target"
  LUKS_UUID=$(blkid -s UUID -o value "$P_LUKS")
fi

# ---------------------------------------------------------------- rescue copy of the temporary kernel
if [ "${BCB_VERIFY_ONLY:-0}" != 1 ]; then
mountpoint -q /boot || mount "$P_BOOT" /boot || die "cannot mount $P_BOOT on /boot"
TMPKVER=$(ls /boot/vmlinuz-* 2>/dev/null | sed 's|.*/vmlinuz-||' | head -1)
[ -n "$TMPKVER" ] || die "no kernel on /boot"
if [ ! -f /boot/tmpsys-vmlinuz ]; then
  log "preserving the temporary system's kernel as tmpsys-* before it is overwritten"
  cp "/boot/vmlinuz-$TMPKVER" /boot/tmpsys-vmlinuz
  cp "/boot/initrd.img-$TMPKVER" /boot/tmpsys-initrd.img
fi

# ---------------------------------------------------------------- LUKS + LVM
log "creating LUKS2 on $P_LUKS"
printf '%s' "$BCB_LUKS_PASSPHRASE" | cryptsetup luksFormat --type luks2 \
  --cipher aes-xts-plain64 --key-size 512 --hash sha256 --pbkdf argon2id \
  --label bcb-crypt --batch-mode "$P_LUKS" - || die "luksFormat failed"

printf '%s' "$BCB_LUKS_PASSPHRASE" | cryptsetup open "$P_LUKS" "$MAPNAME" - || die "luksOpen failed"
[ -b "/dev/mapper/$MAPNAME" ] || die "/dev/mapper/$MAPNAME did not appear"

log "creating LVM inside the container"
pvcreate -ff -y "/dev/mapper/$MAPNAME" >/dev/null
vgcreate "$VG" "/dev/mapper/$MAPNAME" >/dev/null
lvcreate -L "$SWAP_SIZE" -n swap "$VG" >/dev/null
lvcreate -l 100%FREE -n root "$VG" >/dev/null
mkfs.ext4 -q -L bcb-root "/dev/$VG/root"
mkswap -L bcb-swap "/dev/$VG/swap" >/dev/null

# ---------------------------------------------------------------- install
mkdir -p "$TARGET"
mount "/dev/$VG/root" "$TARGET"
log "debootstrap $SUITE into the encrypted volume"
debootstrap --arch=amd64 "$SUITE" "$TARGET" "$MIRROR" >/dev/null 2>&1 || die "debootstrap failed"

mkdir -p "$TARGET/boot"
mount "$P_BOOT" "$TARGET/boot" || die "cannot mount boot into target"
for fs in dev dev/pts proc sys run; do mkdir -p "$TARGET/$fs"; done
mount --bind /dev "$TARGET/dev"
mount --bind /dev/pts "$TARGET/dev/pts"
mount -t proc proc "$TARGET/proc"
mount -t sysfs sys "$TARGET/sys"
mount -t tmpfs tmpfs "$TARGET/run"

LUKS_UUID=$(blkid -s UUID -o value "$P_LUKS")
[ -n "$LUKS_UUID" ] || die "cannot read the LUKS UUID"

cat > "$TARGET/etc/fstab" <<EOF
LABEL=bcb-root  /      ext4  errors=remount-ro  0 1
LABEL=bcb-boot  /boot  ext4  defaults           0 2
LABEL=bcb-swap  none   swap  sw                 0 0
EOF

# discard is deliberately absent: TRIM through dm-crypt leaks which blocks are in use to anyone who can
# read the raw device, and this host has no performance problem that would justify that trade.
cat > "$TARGET/etc/crypttab" <<EOF
$MAPNAME UUID=$LUKS_UUID none luks,initramfs
EOF

echo "${BCB_HOSTNAME:-bcb-prod}" > "$TARGET/etc/hostname"
printf '127.0.0.1 localhost\n127.0.1.1 %s\n' "${BCB_HOSTNAME:-bcb-prod}" > "$TARGET/etc/hosts"

cat > "$TARGET/etc/apt/sources.list" <<EOF
deb $MIRROR $SUITE main restricted universe multiverse
deb $MIRROR $SUITE-updates main restricted universe multiverse
deb $MIRROR $SUITE-security main restricted universe multiverse
EOF

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
      addresses: [$BCB_NET_IP/$BCB_NET_PREFIX]
      nameservers:
        addresses: [$BCB_NET_DNS]
      routes:
        - to: 0.0.0.0/0
          via: $BCB_NET_GW
EOF
chmod 600 "$TARGET/etc/netplan/01-bcb-static.yaml"
# A freshly bootstrapped Ubuntu ships /etc/resolv.conf as a symlink into /run/systemd/resolve, which does
# not exist until systemd is actually running. Writing through that dangling link fails with "Directory
# nonexistent", so the link is replaced by a real file for the duration of the install.
rm -f "$TARGET/etc/resolv.conf"
printf 'nameserver %s\n' "$BCB_NET_DNS" > "$TARGET/etc/resolv.conf"

mkdir -p "$TARGET/root/.ssh"
chmod 700 "$TARGET/root/.ssh"
printf '%s\n' "$BCB_SSH_PUBKEY" > "$TARGET/root/.ssh/authorized_keys"
chmod 600 "$TARGET/root/.ssh/authorized_keys"

# The initramfs has no netplan and no DHCP here, so the unlock shell is only reachable if the kernel itself
# brings the interface up. Hence the ip= parameter rather than anything configured later in userspace.
IPPARAM="ip=$BCB_NET_IP::$BCB_NET_GW:$BCB_NET_NETMASK:${BCB_HOSTNAME:-bcb-prod}:eth0:off"

mkdir -p "$TARGET/etc/dropbear/initramfs"
printf 'no-port-forwarding,no-agent-forwarding,no-x11-forwarding %s\n' "$BCB_SSH_PUBKEY" \
  > "$TARGET/etc/dropbear/initramfs/authorized_keys"
chmod 600 "$TARGET/etc/dropbear/initramfs/authorized_keys"

cat > "$TARGET/tmp/inside.sh" <<INSIDE
set -eu
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq --no-install-recommends \
  systemd systemd-sysv dbus udev netplan.io systemd-resolved \
  linux-image-generic grub-pc openssh-server ca-certificates \
  cryptsetup cryptsetup-initramfs lvm2 dropbear-initramfs busybox-static \
  nftables chrony
systemctl enable ssh
sed -i 's/^#\\?PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config

# Unlock over SSH before the root filesystem exists: dropbear runs from the initramfs on the address the
# kernel configured, and cryptroot-unlock hands the passphrase to the waiting cryptsetup.
sed -i 's|^#\\?DROPBEAR_OPTIONS=.*|DROPBEAR_OPTIONS="-I 300 -j -k -p 22 -s"|' /etc/dropbear/initramfs/dropbear.conf 2>/dev/null || true

sed -i "s|^GRUB_CMDLINE_LINUX=.*|GRUB_CMDLINE_LINUX=\"$IPPARAM\"|" /etc/default/grub
sed -i 's/^GRUB_TIMEOUT=.*/GRUB_TIMEOUT=5/' /etc/default/grub
sed -i 's/^GRUB_TIMEOUT_STYLE=.*/GRUB_TIMEOUT_STYLE=menu/' /etc/default/grub || true

cat > /etc/grub.d/40_custom <<'CUSTOM'
#!/bin/sh
exec tail -n +3 \$0
menuentry 'Stage A temporary system (recovery)' {
	insmod part_gpt
	insmod ext2
	search --no-floppy --label bcb-boot --set=root
	linux /tmpsys-vmlinuz root=LABEL=bcb-tmpsys ro
	initrd /tmpsys-initrd.img
}
CUSTOM
chmod +x /etc/grub.d/40_custom

update-initramfs -u -k all
grub-install --target=i386-pc "$DISK"
update-grub
INSIDE

log "installing the encrypted system"
chroot "$TARGET" /bin/sh /tmp/inside.sh || die "chroot stage failed"
rm -f "$TARGET/tmp/inside.sh"

fi  # end of the install phase, skipped under BCB_VERIFY_ONLY

# ---------------------------------------------------------------- verify
log "verifying"
vfail=0
vcheck() { if eval "$2"; then echo "  ok   $1"; else echo "  FAIL $1"; vfail=1; fi; }

# dropbear-initramfs puts root's home under a randomised name inside the initramfs, so the key cannot be
# checked by path. The content is what matters anyway: unpack and compare against the key we installed.
initramfs_has_our_key() {
  ird=$(mktemp -d) || return 1
  unmkinitramfs "$(ls "$TARGET"/boot/initrd.img-* | head -1)" "$ird" >/dev/null 2>&1 || { rm -rf "$ird"; return 1; }
  kf=$(find "$ird" -path "*/.ssh/authorized_keys" 2>/dev/null | head -1)
  rc=1
  if [ -n "$kf" ] && grep -qF "$(printf '%s' "$BCB_SSH_PUBKEY" | awk '{print $2}')" "$kf"; then rc=0; fi
  rm -rf "$ird"
  return $rc
}
vcheck "LUKS2 header on $P_LUKS"      'cryptsetup isLuks --type luks2 "$P_LUKS"'
vcheck "root lv is ext4"              'blkid -s TYPE -o value "/dev/$VG/root" | grep -q ext4'
vcheck "/sbin/init exists"            '[ -e "$TARGET/sbin/init" ] || [ -L "$TARGET/sbin/init" ]'
vcheck "kernel on /boot"              'ls "$TARGET"/boot/vmlinuz-* >/dev/null 2>&1'
vcheck "initrd on /boot"              'ls "$TARGET"/boot/initrd.img-* >/dev/null 2>&1'
vcheck "recovery kernel preserved"    '[ -s "$TARGET/boot/tmpsys-vmlinuz" ] && [ -s "$TARGET/boot/tmpsys-initrd.img" ]'
vcheck "grub.cfg lists encrypted root" 'grep -q "root=LABEL=bcb-root\|/dev/mapper/$VG-root\|$VG-root" "$TARGET/boot/grub/grub.cfg"'
vcheck "grub.cfg lists recovery entry" 'grep -q "Stage A temporary system" "$TARGET/boot/grub/grub.cfg"'
vcheck "crypttab points at the UUID"  'grep -q "UUID=$LUKS_UUID" "$TARGET/etc/crypttab"'
vcheck "initramfs carries cryptsetup" 'lsinitramfs "$TARGET"/boot/initrd.img-* 2>/dev/null | grep -q "cryptsetup\|cryptroot"'
vcheck "initramfs carries dropbear"   'lsinitramfs "$TARGET"/boot/initrd.img-* 2>/dev/null | grep -q dropbear'
vcheck "initramfs has the unlock key" 'initramfs_has_our_key'
vcheck "kernel gets a static ip"      'grep -q "ip=$BCB_NET_IP" "$TARGET/boot/grub/grub.cfg"'
vcheck "netplan present"              '[ -s "$TARGET/etc/netplan/01-bcb-static.yaml" ]'
vcheck "ssh key installed"            '[ -s "$TARGET/root/.ssh/authorized_keys" ]'
vcheck "ssh enabled at boot"          '[ -L "$TARGET/etc/systemd/system/multi-user.target.wants/ssh.service" ]'

sync
for m in run sys proc dev/pts dev boot ""; do umount "$TARGET/$m" 2>/dev/null || true; done
umount "$TARGET" 2>/dev/null || true

[ "$vfail" = 0 ] || die "the encrypted system is not ready; not rebooting into it"

log "DONE. Reboot; the machine will stop in the initramfs waiting for the passphrase."
log "Unlock with:  ssh -p 22 root@$BCB_NET_IP  then run  cryptroot-unlock"
log "If it does not come up, pick 'Stage A temporary system (recovery)' in the grub menu."
