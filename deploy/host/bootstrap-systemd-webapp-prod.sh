#!/bin/bash
set -euo pipefail

PROJECT_ROOT=/opt/projects/bersoncarebot
SYSTEMD_DIR=/etc/systemd/system
WEBAPP_SERVICE=bersoncarebot-webapp-prod.service
WEBAPP_UNIT_SOURCE="${PROJECT_ROOT}/deploy/systemd/${WEBAPP_SERVICE}"

fail() {
  echo "bootstrap-systemd-webapp-prod: $*" >&2
  exit 1
}

assert_canonical_prod_host() {
  local current_hostname address found_ip=0
  current_hostname="$(hostname -s 2>/dev/null || true)"
  [ "$current_hostname" = "adelaide" ] ||
    fail "refusing PROD systemd bootstrap on host '${current_hostname:-unknown}'; expected adelaide"
  for address in $(hostname -I 2>/dev/null || true); do
    if [ "$address" = "135.106.162.170" ]; then
      found_ip=1
      break
    fi
  done
  [ "$found_ip" -eq 1 ] ||
    fail "refusing PROD systemd bootstrap without local IPv4 135.106.162.170"
}

assert_canonical_prod_host
[ "$(id -u)" -eq 0 ] ||
  fail "systemd unit provisioning is root-only; ordinary deploy must not replace installed units"

[ -f "${WEBAPP_UNIT_SOURCE}" ] && [ ! -L "${WEBAPP_UNIT_SOURCE}" ] ||
  fail "Webapp unit template must be a regular non-symlink file: ${WEBAPP_UNIT_SOURCE}"
installed="${SYSTEMD_DIR}/${WEBAPP_SERVICE}"
[ ! -L "$installed" ] ||
  fail "refusing to replace masked/symlinked webapp unit; root must resolve the mask explicitly"
if [ -e "$installed" ] && [ ! -f "$installed" ]; then
  fail "refusing to replace non-regular webapp unit target: ${installed}"
fi

/usr/bin/systemd-analyze verify "${WEBAPP_UNIT_SOURCE}" ||
  fail "Webapp systemd unit template verification failed"
install -o root -g root -m 0644 "${WEBAPP_UNIT_SOURCE}" "$installed"
/bin/systemctl daemon-reload

[ -f "$installed" ] && [ ! -L "$installed" ] ||
  fail "installed webapp unit must be a regular non-symlink file"
[ "$(stat -c '%U:%G:%a' "$installed")" = "root:root:644" ] ||
  fail "unsafe ownership/mode for ${installed}; expected root:root:644"
cmp -s "${WEBAPP_UNIT_SOURCE}" "$installed" ||
  fail "installed webapp unit differs from reviewed template"
fragment_path="$(/bin/systemctl show --property=FragmentPath --value "${WEBAPP_SERVICE}")" ||
  fail "cannot inspect loaded webapp unit fragment"
[ "$fragment_path" = "$installed" ] ||
  fail "systemd loaded webapp unit from unexpected fragment: ${fragment_path:-<none>}"
drop_in_paths="$(/bin/systemctl show --property=DropInPaths --value "${WEBAPP_SERVICE}")" ||
  fail "cannot inspect webapp unit drop-ins"
[ -z "$drop_in_paths" ] ||
  fail "unexpected drop-ins can override webapp host gate: ${drop_in_paths}"
[ "$(/bin/systemctl show --property=NeedDaemonReload --value "${WEBAPP_SERVICE}")" = "no" ] ||
  fail "systemd has not loaded the reviewed webapp template"

/bin/systemctl enable "${WEBAPP_SERVICE}"
if [ -f /opt/env/bersoncarebot/webapp.prod ] && [ -d "${PROJECT_ROOT}/apps/webapp/.next" ]; then
  /bin/systemctl start "${WEBAPP_SERVICE}"
else
  echo "Webapp unit installed and enabled, but not started because /opt/env/bersoncarebot/webapp.prod or build artifacts are missing."
fi
