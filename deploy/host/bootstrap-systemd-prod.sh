#!/bin/bash
set -euo pipefail

PROJECT_ROOT=/opt/projects/bersoncarebot
SYSTEMD_DIR=/etc/systemd/system
API_SERVICE=bersoncarebot-api-prod.service
WORKER_SERVICE=bersoncarebot-worker-prod.service
SCHEDULER_SERVICE=bersoncarebot-scheduler-prod.service
WEBAPP_SERVICE=bersoncarebot-webapp-prod.service
MEDIA_WORKER_SERVICE=bersoncarebot-media-worker-prod.service
API_UNIT_SOURCE="${PROJECT_ROOT}/deploy/systemd/${API_SERVICE}"
WORKER_UNIT_SOURCE="${PROJECT_ROOT}/deploy/systemd/${WORKER_SERVICE}"
SCHEDULER_UNIT_SOURCE="${PROJECT_ROOT}/deploy/systemd/${SCHEDULER_SERVICE}"
WEBAPP_UNIT_SOURCE="${PROJECT_ROOT}/deploy/systemd/${WEBAPP_SERVICE}"
MEDIA_WORKER_UNIT_SOURCE="${PROJECT_ROOT}/deploy/systemd/${MEDIA_WORKER_SERVICE}"
C4_OPERATIONAL_READINESS="${PROJECT_ROOT}/deploy/host/assert-c4-operational-runtime-ready.sh"
MEDIA_CONTROL_CUTOVER="${PROJECT_ROOT}/deploy/host/media-control-cutover-sequence.sh"
MEDIA_LOGIN_RETIREMENT="${PROJECT_ROOT}/deploy/host/retire-media-db-login.sh"
BOOTSTRAP_NEW_WEBAPP_RESTARTED=0

fail() {
  echo "bootstrap-systemd-prod: $*" >&2
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

require_file() {
  local path="$1"
  local description="$2"
  [ -f "$path" ] && [ ! -L "$path" ] ||
    fail "${description} must be a regular non-symlink file: ${path}"
}

verify_installed_unit() {
  local unit="$1"
  local source="$2"
  local installed="${SYSTEMD_DIR}/${unit}"
  local fragment_path drop_in_paths need_reload
  [ -f "$installed" ] && [ ! -L "$installed" ] ||
    fail "installed unit must be a regular non-symlink file: ${installed}"
  [ "$(stat -c '%U:%G:%a' "$installed")" = "root:root:644" ] ||
    fail "unsafe ownership/mode for ${installed}; expected root:root:644"
  cmp -s "$source" "$installed" ||
    fail "installed ${unit} differs from reviewed template"
  fragment_path="$(/bin/systemctl show --property=FragmentPath --value "$unit")" ||
    fail "cannot inspect loaded fragment for ${unit}"
  [ "$fragment_path" = "$installed" ] ||
    fail "systemd loaded ${unit} from unexpected fragment: ${fragment_path:-<none>}"
  drop_in_paths="$(/bin/systemctl show --property=DropInPaths --value "$unit")" ||
    fail "cannot inspect drop-ins for ${unit}"
  [ -z "$drop_in_paths" ] ||
    fail "unexpected drop-ins can override host gate for ${unit}: ${drop_in_paths}"
  need_reload="$(/bin/systemctl show --property=NeedDaemonReload --value "$unit")" ||
    fail "cannot inspect daemon-reload state for ${unit}"
  [ "$need_reload" = "no" ] ||
    fail "systemd has not loaded the reviewed ${unit} template"
}

require_safe_install_target() {
  local unit="$1"
  local installed="${SYSTEMD_DIR}/${unit}"
  [ ! -L "$installed" ] ||
    fail "refusing to replace masked/symlinked unit: ${installed}; root must resolve the mask explicitly"
  if [ -e "$installed" ] && [ ! -f "$installed" ]; then
    fail "refusing to replace non-regular unit target: ${installed}"
  fi
}

bootstrap_path_is_file() {
  [ -f "$1" ]
}

bootstrap_path_is_dir() {
  [ -d "$1" ]
}

bootstrap_systemctl() {
  /bin/systemctl "$@"
}

media_cutover_require_new_webapp_running() {
  [ "${BOOTSTRAP_NEW_WEBAPP_RESTARTED}" = 1 ] ||
    fail "new webapp was not restarted by this bootstrap; media-worker remains stopped"
  bootstrap_systemctl is-active --quiet "${WEBAPP_SERVICE}" ||
    fail "new webapp is not active; media-worker remains stopped"
}

media_cutover_require_authenticated_control() {
  bash "${C4_OPERATIONAL_READINESS}"
}

media_cutover_require_legacy_login_retired() {
  bash "${MEDIA_LOGIN_RETIREMENT}" \
    --database bersoncarebot \
    --role bcb_prod_operational_media_login
}

media_cutover_restart_worker() {
  bootstrap_systemctl restart "${MEDIA_WORKER_SERVICE}"
}

start_available_prod_services() {
  BOOTSTRAP_NEW_WEBAPP_RESTARTED=0
  # A previously running legacy worker must not survive any later bootstrap failure.
  bootstrap_systemctl stop "${MEDIA_WORKER_SERVICE}" || return

  if bootstrap_path_is_file /opt/env/bersoncarebot/api.prod \
    && bootstrap_path_is_file "${PROJECT_ROOT}/apps/integrator/dist/main.js" \
    && bootstrap_path_is_file "${PROJECT_ROOT}/apps/integrator/dist/infra/runtime/worker/main.js" \
    && bootstrap_path_is_file "${PROJECT_ROOT}/apps/integrator/dist/infra/runtime/scheduler/main.js"; then
    bootstrap_systemctl start "${API_SERVICE}" "${WORKER_SERVICE}" "${SCHEDULER_SERVICE}" || return
  else
    echo "API/worker/scheduler installed and enabled, but not started because api.prod or build artifacts are missing."
  fi

  if bootstrap_path_is_file /opt/env/bersoncarebot/webapp.prod \
    && bootstrap_path_is_dir "${PROJECT_ROOT}/apps/webapp/.next"; then
    # `start` would leave an already-running old build in place. Restart is the proof that the new route is live.
    bootstrap_systemctl restart "${WEBAPP_SERVICE}" || return
    BOOTSTRAP_NEW_WEBAPP_RESTARTED=1
  else
    echo "Webapp installed and enabled, but not started because webapp.prod or build artifacts are missing."
  fi

  if bootstrap_path_is_file /opt/env/bersoncarebot/media-worker.prod \
    && bootstrap_path_is_file "${PROJECT_ROOT}/apps/media-worker/dist/main.js"; then
    run_media_control_cutover_sequence
  else
    echo "Media-worker installed and enabled, but not started because media-worker.prod or build artifacts are missing."
  fi
}

run_self_test() {
  local events="" webapp_active=0 control_ready=0 retirement_ready=0
  local expected_prefix="systemctl:stop ${MEDIA_WORKER_SERVICE};systemctl:start ${API_SERVICE} ${WORKER_SERVICE} ${SCHEDULER_SERVICE};systemctl:restart ${WEBAPP_SERVICE};systemctl:is-active --quiet ${WEBAPP_SERVICE};"

  bootstrap_path_is_file() { return 0; }
  bootstrap_path_is_dir() { return 0; }
  bootstrap_systemctl() {
    events+="systemctl:$*;"
    if [ "$1" = is-active ]; then
      [ "$webapp_active" = 1 ]
    fi
  }
  media_cutover_require_new_webapp_running() {
    [ "${BOOTSTRAP_NEW_WEBAPP_RESTARTED}" = 1 ] || return 1
    bootstrap_systemctl is-active --quiet "${WEBAPP_SERVICE}"
  }
  media_cutover_require_authenticated_control() {
    events+="control;"
    [ "$control_ready" = 1 ]
  }
  media_cutover_require_legacy_login_retired() {
    events+="retirement;"
    [ "$retirement_ready" = 1 ]
  }

  if start_available_prod_services; then
    fail "self-test accepted an inactive new webapp"
  fi
  [ "$events" = "$expected_prefix" ] || fail "self-test allowed work after the inactive-webapp gate"

  events=""
  webapp_active=1
  if start_available_prod_services; then
    fail "self-test accepted unavailable authenticated media control"
  fi
  [ "$events" = "${expected_prefix}control;" ] || fail "self-test reached retirement/restart after control failure"

  events=""
  control_ready=1
  if start_available_prod_services; then
    fail "self-test accepted failed legacy-role retirement"
  fi
  [ "$events" = "${expected_prefix}control;retirement;" ] || fail "self-test restarted media after retirement failure"

  events=""
  retirement_ready=1
  start_available_prod_services
  [ "$events" = "${expected_prefix}control;retirement;systemctl:restart ${MEDIA_WORKER_SERVICE};" ] ||
    fail "self-test detected a bootstrap media cutover order change"
  echo "bootstrap-systemd-prod media cutover self-test: OK"
}

case "${1:-}" in
  --self-test)
    [ "$#" -eq 1 ] || fail "usage: $0 [--self-test]"
    self_test_cutover="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/media-control-cutover-sequence.sh"
    require_file "$self_test_cutover" "media-control cutover helper"
    # shellcheck source=deploy/host/media-control-cutover-sequence.sh
    source "$self_test_cutover"
    run_self_test
    exit 0
    ;;
  '') ;;
  *) fail "usage: $0 [--self-test]" ;;
esac

assert_canonical_prod_host
[ "$(id -u)" -eq 0 ] ||
  fail "systemd unit provisioning is root-only; ordinary deploy must not replace installed units"

require_file "${API_UNIT_SOURCE}" "API unit template"
require_file "${WORKER_UNIT_SOURCE}" "Worker unit template"
require_file "${SCHEDULER_UNIT_SOURCE}" "Scheduler unit template"
require_file "${WEBAPP_UNIT_SOURCE}" "Webapp unit template"
require_file "${MEDIA_WORKER_UNIT_SOURCE}" "Media-worker unit template"
require_file "${C4_OPERATIONAL_READINESS}" "C4 operational readiness probe"
require_file "${MEDIA_CONTROL_CUTOVER}" "media-control cutover helper"
require_file "${MEDIA_LOGIN_RETIREMENT}" "exact media-login retirement primitive"
# shellcheck source=deploy/host/media-control-cutover-sequence.sh
source "${MEDIA_CONTROL_CUTOVER}"
require_safe_install_target "${API_SERVICE}"
require_safe_install_target "${WORKER_SERVICE}"
require_safe_install_target "${SCHEDULER_SERVICE}"
require_safe_install_target "${WEBAPP_SERVICE}"
require_safe_install_target "${MEDIA_WORKER_SERVICE}"

/usr/bin/systemd-analyze verify \
  "${API_UNIT_SOURCE}" \
  "${WORKER_UNIT_SOURCE}" \
  "${SCHEDULER_UNIT_SOURCE}" \
  "${WEBAPP_UNIT_SOURCE}" \
  "${MEDIA_WORKER_UNIT_SOURCE}" ||
  fail "systemd unit template verification failed"
install -o root -g root -m 0644 "${API_UNIT_SOURCE}" "${SYSTEMD_DIR}/${API_SERVICE}"
install -o root -g root -m 0644 "${WORKER_UNIT_SOURCE}" "${SYSTEMD_DIR}/${WORKER_SERVICE}"
install -o root -g root -m 0644 "${SCHEDULER_UNIT_SOURCE}" "${SYSTEMD_DIR}/${SCHEDULER_SERVICE}"
install -o root -g root -m 0644 "${WEBAPP_UNIT_SOURCE}" "${SYSTEMD_DIR}/${WEBAPP_SERVICE}"
install -o root -g root -m 0644 "${MEDIA_WORKER_UNIT_SOURCE}" "${SYSTEMD_DIR}/${MEDIA_WORKER_SERVICE}"
/bin/systemctl daemon-reload

verify_installed_unit "${API_SERVICE}" "${API_UNIT_SOURCE}"
verify_installed_unit "${WORKER_SERVICE}" "${WORKER_UNIT_SOURCE}"
verify_installed_unit "${SCHEDULER_SERVICE}" "${SCHEDULER_UNIT_SOURCE}"
verify_installed_unit "${WEBAPP_SERVICE}" "${WEBAPP_UNIT_SOURCE}"
verify_installed_unit "${MEDIA_WORKER_SERVICE}" "${MEDIA_WORKER_UNIT_SOURCE}"

/bin/systemctl enable \
  "${API_SERVICE}" \
  "${WORKER_SERVICE}" \
  "${SCHEDULER_SERVICE}" \
  "${WEBAPP_SERVICE}" \
  "${MEDIA_WORKER_SERVICE}"

start_available_prod_services
