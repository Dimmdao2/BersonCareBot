#!/bin/bash
# Installs systemd sandboxing drop-ins for the BersonCare services and proves they take effect.
#
# Drop-ins rather than edited units: the unit says what to run, these files say what the process is allowed
# to do, and neither rewrites the other. See deploy/systemd/hardening/README.md for the exception list.
#
# Proof is not "the file was written". A synthetic unit carrying the same drop-in is scored with
# `systemd-analyze security`, and the sandbox is only accepted if the score is in the safe band.
set -uo pipefail

RELEASE_ROOT=/opt/bersoncarebot
DROPIN=10-bcb-sandbox.conf

log() { echo "[sandbox] $*"; }
die() { echo "[sandbox] FATAL: $*" >&2; exit 1; }
[ "$(id -u)" = 0 ] || die "must run as root"

# unit-suffix : service user : extra directives
UNITS="
webapp:bcb-webapp:
api:bcb-api:
worker:bcb-worker:
scheduler:bcb-scheduler:
media-worker:bcb-media-worker:media
"

common_block() { # $1 = service user, $2 = state dir name
  cat <<EOF
[Service]
User=$1
Group=$1

NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
PrivateDevices=yes
ProtectProc=invisible
ProcSubset=pid
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectKernelLogs=yes
ProtectControlGroups=yes
ProtectClock=yes
ProtectHostname=yes
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
RestrictNamespaces=yes
RestrictRealtime=yes
RestrictSUIDSGID=yes
LockPersonality=yes
SystemCallArchitectures=native
CapabilityBoundingSet=
AmbientCapabilities=
UMask=0077

# Node compiles JavaScript to machine code at run time and needs pages that are writable and executable at
# once; with MemoryDenyWriteExecute the process does not start at all. Listed here rather than silently
# omitted, because an exception nobody can find is an exception nobody reviews.
MemoryDenyWriteExecute=no

ReadWritePaths=/var/lib/bersoncarebot/$2 /var/log/bersoncarebot/$2
ReadOnlyPaths=$RELEASE_ROOT/releases
EOF
}

install -d -m 0755 /etc/systemd/system

for row in $UNITS; do
  [ -z "$row" ] && continue
  svc="${row%%:*}"; rest="${row#*:}"
  user="${rest%%:*}"; extra="${rest#*:}"
  unit="bersoncarebot-${svc}-prod.service"
  dir="/etc/systemd/system/${unit}.d"
  install -d -m 0755 "$dir"
  {
    common_block "$user" "$svc"
    if [ "$extra" = media ]; then
      cat <<EOF

# ffmpeg is started without a thread limit and one transcode saturates every core, which shows up as the
# whole interface stalling the moment a doctor uploads a video. The quota is the boundary, not politeness.
CPUQuota=50%
# Temporary files must land on disk with a known size: /tmp is a memory filesystem on many systems, and a
# two-gigabyte clip would then be written into RAM.
Environment=TMPDIR=/var/lib/bersoncarebot/media-worker/tmp
# ffmpeg adjusts thread priorities and resource limits; without @resources it dies on SIGSYS mid-transcode.
SystemCallFilter=@system-service @resources
EOF
    else
      printf '\nSystemCallFilter=@system-service\n'
    fi
  } > "$dir/$DROPIN"
  chmod 0644 "$dir/$DROPIN"
  log "wrote $dir/$DROPIN"
done

install -d -m 0750 -o bcb-media-worker -g bcb-media-worker /var/lib/bersoncarebot/media-worker/tmp

systemctl daemon-reload

# ---------------------------------------------------------------- proof
# The real units target the old host and are not installed here, so the drop-in is scored on a synthetic
# unit that carries exactly the same block. This measures the sandbox itself rather than our intention.
PROBE=/etc/systemd/system/bcb-sandbox-probe.service
{
  echo "[Unit]"
  echo "Description=BersonCare sandbox probe (never started)"
  common_block bcb-webapp webapp
  echo "Type=oneshot"
  echo "ExecStart=/bin/true"
  echo "SystemCallFilter=@system-service"
} > "$PROBE"
systemctl daemon-reload

# The summary line reads "Overall exposure level for X: 2.4 OK :-)" — the field positions shift with the
# verdict word and the emoticon, so the number is extracted as a number rather than by column.
SCORE=$(systemd-analyze security bcb-sandbox-probe.service 2>/dev/null |
        sed -n 's/.*Overall exposure level[^:]*: *\([0-9]\+\.[0-9]\+\).*/\1/p' | head -1)
log "systemd-analyze exposure for the sandbox block: ${SCORE:-unknown} (lower is safer, 10 is unconfined)"

log "verifying"
vfail=0
vcheck() { if eval "$2"; then echo "  ok   $1"; else echo "  FAIL $1"; vfail=1; fi; }
for row in $UNITS; do
  [ -z "$row" ] && continue
  svc="${row%%:*}"
  vcheck "drop-in present for $svc" "[ -s /etc/systemd/system/bersoncarebot-${svc}-prod.service.d/$DROPIN ]"
done
# systemd-analyze verify prints nothing at all when the unit is fine, so grepping its output for the
# absence of an error word fails on a correct unit. The exit status is the answer.
vcheck "probe parses without error"   'systemd-analyze verify bcb-sandbox-probe.service'
# The numeric guard is not decoration: when SCORE parsed as the word "OK", awk read it as an unset
# variable worth 0, and "0 < 5" reported a passing sandbox that had never been measured.
vcheck "exposure score is numeric"    'printf "%s" "$SCORE" | grep -qE "^[0-9]+\.[0-9]+$"'
vcheck "exposure is below 5"          'printf "%s" "$SCORE" | grep -qE "^[0-9]+\.[0-9]+$" && awk "BEGIN{exit !($SCORE < 5)}"'
vcheck "capabilities are dropped"     'systemctl show bcb-sandbox-probe.service -p CapabilityBoundingSet --value | grep -qx ""'
vcheck "new privileges refused"       'systemctl show bcb-sandbox-probe.service -p NoNewPrivileges --value | grep -qx yes'
vcheck "filesystem is read-only"      'systemctl show bcb-sandbox-probe.service -p ProtectSystem --value | grep -qx strict'
vcheck "media tmp dir exists on disk"  '[ -d /var/lib/bersoncarebot/media-worker/tmp ]'
vcheck "media quota is set"           'grep -q "CPUQuota=50%" /etc/systemd/system/bersoncarebot-media-worker-prod.service.d/'"$DROPIN"

rm -f "$PROBE"
systemctl daemon-reload

[ "$vfail" = 0 ] || die "sandboxing not proven"
log "DONE"
