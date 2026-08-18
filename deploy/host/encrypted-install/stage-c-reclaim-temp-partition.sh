#!/bin/bash
# Stage C: give the temporary installer partition back to the encrypted container.
#
# Runs INSIDE the finished encrypted system. The temporary system built in stage A was also the way back if
# the encrypted one failed to boot, so this is deliberately the last step: it is only correct once a real
# reboot has been observed to work.
#
# Everything here happens on a live root filesystem. That is safe in this order and only in this order:
# the temporary partition is last on the disk, so deleting it leaves the container's partition last, and a
# last partition can be grown while it is in use. LUKS keeps its header at the start of the partition, so a
# start sector that never moves means the header never moves either.
set -uo pipefail

DISK="${BCB_DISK:-/dev/sda}"
TMP_PART_NUM="${BCB_TMP_PART_NUM:-4}"
LUKS_PART_NUM="${BCB_LUKS_PART_NUM:-3}"
MAPNAME="${BCB_MAPNAME:-bcbcrypt}"
VG="${BCB_VG:-bcbvg}"
LV="${BCB_LV:-root}"
BACKUP=/root/partition-table-before-stage-c.sgdisk

log() { echo "[stage-c] $*"; }
die() { echo "[stage-c] FATAL: $*" >&2; exit 1; }
[ "$(id -u)" = 0 ] || die "must run as root"

P_TMP="${DISK}${TMP_PART_NUM}"
P_LUKS="${DISK}${LUKS_PART_NUM}"

# ---------------------------------------------------------------- guards
[ "${BCB_RECLAIM_CONFIRM:-}" = "yes-delete-$(basename "$P_TMP")" ] ||
  die "refusing to delete $P_TMP: set BCB_RECLAIM_CONFIRM=yes-delete-$(basename "$P_TMP")"
# Not an early exit. A run interrupted between deleting the partition and growing the layers above it
# leaves the space claimed on the disk and unusable inside — the one state where stopping "because the
# partition is gone" is exactly wrong. Re-running must finish the job.
[ -b "$P_TMP" ] || log "$P_TMP is already gone; continuing to grow whatever is still short"
findmnt -no SOURCE / | grep -q "$VG" || die "root is not on $VG; wrong host or wrong stage"
grep -q " $(basename "$P_TMP") " /proc/mounts && die "$P_TMP is mounted; refusing"
mount | grep -q "$P_TMP" && die "$P_TMP is mounted; refusing"

# The point of no return is deleting the fallback, so the fallback must be provably unnecessary first.
UPTIME_OK=$(systemctl is-system-running 2>/dev/null)
[ "$UPTIME_OK" = running ] || [ "$UPTIME_OK" = degraded ] ||
  die "system is '$UPTIME_OK'; reclaim only from a fully booted encrypted system"
cryptsetup status "$MAPNAME" >/dev/null 2>&1 || die "$MAPNAME is not open"
# Growing a LUKS2 container needs the volume key, and cryptsetup asks for it on stdin even when the device
# is already open. Without this the resize stops at "Nothing to read on input" and the layers above stay
# small while the partition below has already grown.
[ -n "${BCB_LUKS_PASSPHRASE:-}" ] || die "BCB_LUKS_PASSPHRASE is required to resize the container"

# Tools first: discovering a missing binary halfway through is how a script ends up having removed the
# fallback without having done the work it was removing the fallback for.
for t in sgdisk parted partprobe resize2fs pvresize lvextend tune2fs; do
  command -v "$t" >/dev/null || MISSING="${MISSING:-} $t"
done
if [ -n "${MISSING:-}" ]; then
  log "installing missing tools:${MISSING}"
  DEBIAN_FRONTEND=noninteractive apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends gdisk parted e2fsprogs lvm2
fi
for t in sgdisk parted partprobe resize2fs pvresize lvextend tune2fs; do
  command -v "$t" >/dev/null || die "$t is still missing; refusing to touch the partition table"
done

log "current layout"
lsblk -o NAME,SIZE,FSTYPE,LABEL,MOUNTPOINT "$DISK"

# A backup that quietly did not happen is worse than no backup, because the next step trusts it.
sgdisk --backup="$BACKUP" "$DISK" >/dev/null 2>&1 || die "could not back up the partition table"
[ -s "$BACKUP" ] || die "partition table backup is empty"
chmod 600 "$BACKUP"
log "partition table backed up to $BACKUP"

BEFORE_FS=$(df -B1 --output=size / | tail -1)

# ---------------------------------------------------------------- grow
if [ -b "$P_TMP" ]; then
  log "deleting $P_TMP"
  sgdisk -d "$TMP_PART_NUM" "$DISK" >/dev/null || die "could not delete $P_TMP"
  partprobe "$DISK" 2>/dev/null || partx -u "$DISK" 2>/dev/null || true
fi

log "growing $P_LUKS to the end of the disk"
# parted resizes the partition entry only; nothing inside it is touched, and the start sector is unchanged.
parted -s "$DISK" resizepart "$LUKS_PART_NUM" 100% || die "resizepart failed"
partprobe "$DISK" 2>/dev/null || partx -u "$DISK" 2>/dev/null || true
sleep 2

log "growing the LUKS container, the volume group and the filesystem"
printf '%s' "$BCB_LUKS_PASSPHRASE" | cryptsetup resize "$MAPNAME" - || die "cryptsetup resize failed"
pvresize "/dev/mapper/$MAPNAME" >/dev/null || die "pvresize failed"
lvextend -l +100%FREE "/dev/$VG/$LV" >/dev/null || log "lvextend: nothing to extend"
resize2fs "/dev/$VG/$LV" >/dev/null 2>&1 || die "resize2fs failed"

# ---------------------------------------------------------------- drop the fallback, last
# Only now, once the space is actually reclaimed. Removing the way back before doing the risky work leaves
# the host with neither — which is exactly what happened the first time this ran.
# A menu entry pointing at a root filesystem that no longer exists is a trap for whoever reboots next.
if [ -f /etc/grub.d/40_custom ] && grep -q "Stage A temporary system" /etc/grub.d/40_custom; then
  log "removing the stage A recovery menu entry"
  cat > /etc/grub.d/40_custom <<'EOF'
#!/bin/sh
exec tail -n +3 $0
# The stage A recovery entry was removed by stage-c-reclaim-temp-partition.sh: its root filesystem is gone.
EOF
  chmod +x /etc/grub.d/40_custom
fi
rm -f /boot/tmpsys-vmlinuz /boot/tmpsys-initrd.img
update-grub >/dev/null 2>&1 || die "update-grub failed"

# ---------------------------------------------------------------- verify
log "verifying"
set +o pipefail   # grep -q plus pipefail turns a successful match into a failure
vfail=0
vcheck() { if eval "$2"; then echo "  ok   $1"; else echo "  FAIL $1"; vfail=1; fi; }
AFTER_FS=$(df -B1 --output=size / | tail -1)

vcheck "temporary partition is gone"   '[ ! -b "$P_TMP" ]'
vcheck "container partition is last"   '[ "$(lsblk -nro NAME "$DISK" | tail -1)" = "$(basename "$P_LUKS")" ] || lsblk -nro NAME,TYPE "$DISK" | awk "\$2==\"part\"{p=\$1} END{print p}" | grep -q "$(basename "$P_LUKS")"'
# End state, not the delta of this particular run. A resumed run grows nothing because the previous one
# already did, and a check written as a delta then reports failure on a perfectly correct machine.
[ "$AFTER_FS" -gt "$BEFORE_FS" ] && log "this run added $(( (AFTER_FS - BEFORE_FS) / 1073741824 )) GiB"
vcheck "no unallocated space on disk"  '[ "$(sgdisk -p "$DISK" | awk "/free space/ {found=1} END {print found+0}")" = 0 ] || [ "$(parted -s "$DISK" unit MiB print free | awk "/Free Space/ {gsub(/MiB/,\"\",\$3); if (\$3+0 > 16) n++} END{print n+0}")" = 0 ]'
vcheck "container fills its partition" '[ $(( $(blockdev --getsize64 "/dev/mapper/$MAPNAME") / 1073741824 )) -ge $(( $(blockdev --getsize64 "$P_LUKS") / 1073741824 - 1 )) ]'
vcheck "filesystem fills its volume"   '[ $(( AFTER_FS / 1073741824 )) -ge $(( $(blockdev --getsize64 "/dev/$VG/$LV") / 1073741824 - 3 )) ]'
vcheck "root is at least 68 GiB"       '[ $(( AFTER_FS / 1073741824 )) -ge 68 ]'
vcheck "root still on the container"   'lsblk -nsr -o TYPE "$(findmnt -no SOURCE /)" | grep -q crypt'
vcheck "no free space left in the vg"  '[ "$(vgs --noheadings -o vg_free --units b "$VG" | tr -dc "0-9")" -lt 1073741824 ]'
vcheck "filesystem has no errors"      'tune2fs -l "/dev/$VG/$LV" | grep -q "Filesystem state: *clean"'
vcheck "recovery entry removed"        '! grep -q "Stage A temporary system" /boot/grub/grub.cfg'
vcheck "recovery kernel removed"       '[ ! -e /boot/tmpsys-vmlinuz ]'
vcheck "grub still lists a kernel"     'grep -q "vmlinuz-" /boot/grub/grub.cfg'
vcheck "crypttab unchanged"            'grep -q "$MAPNAME" /etc/crypttab'

log "new layout"
lsblk -o NAME,SIZE,FSTYPE,LABEL,MOUNTPOINT "$DISK"
df -h / | tail -1

[ "$vfail" = 0 ] || die "reclaim did not complete cleanly; partition table backup is at $BACKUP"
log "DONE. Reboot once to prove the machine still comes up before considering this closed."
