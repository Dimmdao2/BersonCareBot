#!/usr/bin/env bash
# Atomically switch the existing named TEST runtime to split Therapysto/TherapyGo origins.
# Default is read-only; --apply changes only api.test and webapp.test.
set -euo pipefail
umask 077

EXPECTED_HOST_IP="151.241.228.122"
API_ENV="/opt/env/bersoncarebot/api.test"
WEBAPP_ENV="/opt/env/bersoncarebot/webapp.test"
BACKUP_ROOT="/var/backups/bersoncare-test-surface-env"
STAFF_ORIGIN="https://test.therapysto.ru"
PATIENT_ORIGIN="https://test.therapygo.ru"
PATIENT_NAME="TherapyGo"
ACTION="dry-run"

fatal() { echo "FATAL: $*" >&2; exit 1; }
log() { echo "== [apply-test-surface-env] $* =="; }

case "${1:---dry-run}" in
  --dry-run) ACTION="dry-run" ;;
  --apply) ACTION="apply" ;;
  --help|-h)
    echo "Usage: bash deploy/host/apply-test-surface-env.sh [--dry-run|--apply]"
    exit 0
    ;;
  *) fatal "unknown argument: ${1:-}" ;;
esac
[ "$#" -le 1 ] || fatal "too many arguments"

hostname -I | tr ' ' '\n' | grep -Fxq "$EXPECTED_HOST_IP" \
  || fatal "this script targets only TEST host $EXPECTED_HOST_IP"
for env_file in "$API_ENV" "$WEBAPP_ENV"; do
  sudo test -f "$env_file" || fatal "missing TEST env: $env_file"
  ! sudo test -L "$env_file" || fatal "TEST env must not be a symlink: $env_file"
done

render_env() {
  local source="$1" output="$2" kind="$3"
  sudo awk -v kind="$kind" -v staff="$STAFF_ORIGIN" -v patient="$PATIENT_ORIGIN" -v patient_name="$PATIENT_NAME" '
    BEGIN { app_seen=0; patient_seen=0; name_seen=0 }
    /^APP_BASE_URL=/ {
      if (++app_seen > 1) { exit 41 }
      print "APP_BASE_URL=\047" staff "\047"
      next
    }
    /^PATIENT_APP_ORIGIN=/ {
      if (++patient_seen > 1) { exit 42 }
      if (kind == "webapp") print "PATIENT_APP_ORIGIN=\047" patient "\047"
      next
    }
    /^PATIENT_APP_NAME=/ {
      if (++name_seen > 1) { exit 43 }
      if (kind == "webapp") print "PATIENT_APP_NAME=\047" patient_name "\047"
      next
    }
    { print }
    END {
      if (app_seen == 0) print "APP_BASE_URL=\047" staff "\047"
      if (kind == "webapp" && patient_seen == 0) print "PATIENT_APP_ORIGIN=\047" patient "\047"
      if (kind == "webapp" && name_seen == 0) print "PATIENT_APP_NAME=\047" patient_name "\047"
    }
  ' "$source" >"$output" || fatal "cannot render $source"
}

validate_rendered() {
  local rendered="$1" kind="$2"
  [ "$(grep -c '^APP_BASE_URL=' "$rendered")" -eq 1 ] || fatal "$kind APP_BASE_URL is not unique"
  grep -Fxq "APP_BASE_URL='$STAFF_ORIGIN'" "$rendered" || fatal "$kind APP_BASE_URL mismatch"
  if [ "$kind" = "webapp" ]; then
    [ "$(grep -c '^PATIENT_APP_ORIGIN=' "$rendered")" -eq 1 ] || fatal "PATIENT_APP_ORIGIN is not unique"
    [ "$(grep -c '^PATIENT_APP_NAME=' "$rendered")" -eq 1 ] || fatal "PATIENT_APP_NAME is not unique"
    grep -Fxq "PATIENT_APP_ORIGIN='$PATIENT_ORIGIN'" "$rendered" || fatal "PATIENT_APP_ORIGIN mismatch"
    grep -Fxq "PATIENT_APP_NAME='$PATIENT_NAME'" "$rendered" || fatal "PATIENT_APP_NAME mismatch"
  fi
  bash -n "$rendered" || fatal "$kind env is not valid shell syntax"
}

api_rendered="$(mktemp /tmp/bcb-api-test-surface-env.XXXXXX)"
webapp_rendered="$(mktemp /tmp/bcb-webapp-test-surface-env.XXXXXX)"
cleanup() { rm -f "$api_rendered" "$webapp_rendered"; }
trap cleanup EXIT
render_env "$API_ENV" "$api_rendered" api
render_env "$WEBAPP_ENV" "$webapp_rendered" webapp
validate_rendered "$api_rendered" api
validate_rendered "$webapp_rendered" webapp

if [ "$ACTION" = "dry-run" ]; then
  log "dry-run OK"
  echo "   APP_BASE_URL=$STAFF_ORIGIN"
  echo "   PATIENT_APP_ORIGIN=$PATIENT_ORIGIN"
  echo "   PATIENT_APP_NAME=$PATIENT_NAME"
  exit 0
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_dir="$BACKUP_ROOT/$timestamp"
sudo install -d -m 0700 -o root -g root "$backup_dir"
sudo cp -a -- "$API_ENV" "$backup_dir/api.test"
sudo cp -a -- "$WEBAPP_ENV" "$backup_dir/webapp.test"

install_preserving_metadata() {
  local rendered="$1" target="$2" mode owner group tmp
  mode="$(sudo stat -c %a "$target")"
  owner="$(sudo stat -c %u "$target")"
  group="$(sudo stat -c %g "$target")"
  tmp="$(sudo mktemp "${target}.tmp.XXXXXX")"
  sudo install -m "$mode" -o "$owner" -g "$group" "$rendered" "$tmp"
  sudo mv -f -- "$tmp" "$target"
}

install_preserving_metadata "$api_rendered" "$API_ENV"
install_preserving_metadata "$webapp_rendered" "$WEBAPP_ENV"
log "apply OK; backup: $backup_dir"
