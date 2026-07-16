#!/usr/bin/env bash
set -euo pipefail

EXPECTED_FRAGMENT_PATH=/etc/systemd/system/bersoncarebot-media-worker-test.service
EXPECTED_ENV_FILE=/opt/env/bersoncarebot/media-worker.test
EXPECTED_WORKING_DIRECTORY=/opt/projects/bersoncarebot-test/apps/media-worker

assert_properties(){
  local fragment_path="$1" environment_files="$2" working_directory="$3" user="$4" group="$5"
  [ "$fragment_path" = "$EXPECTED_FRAGMENT_PATH" ] || {
    echo "FATAL: media-worker TEST unit has unexpected FragmentPath" >&2
    return 1
  }
  [[ "$environment_files" =~ ^/opt/env/bersoncarebot/media-worker\.test[[:space:]]+\(ignore_errors=(yes|no)\)$ ]] || {
    echo "FATAL: media-worker TEST unit must use exactly one canonical EnvironmentFile" >&2
    return 1
  }
  [ "$working_directory" = "$EXPECTED_WORKING_DIRECTORY" ] || {
    echo "FATAL: media-worker TEST unit has unexpected WorkingDirectory" >&2
    return 1
  }
  [ "$user:$group" = "deploy:deploy" ] || {
    echo "FATAL: media-worker TEST unit must run as deploy:deploy" >&2
    return 1
  }
}

self_test(){
  assert_properties \
    "$EXPECTED_FRAGMENT_PATH" \
    "$EXPECTED_ENV_FILE (ignore_errors=no)" \
    "$EXPECTED_WORKING_DIRECTORY" deploy deploy
  assert_properties \
    "$EXPECTED_FRAGMENT_PATH" \
    "$EXPECTED_ENV_FILE (ignore_errors=yes)" \
    "$EXPECTED_WORKING_DIRECTORY" deploy deploy

  local -a rejected_specs=(
    "|$EXPECTED_ENV_FILE (ignore_errors=no)|$EXPECTED_WORKING_DIRECTORY|deploy|deploy"
    "/tmp/bersoncarebot-media-worker-test.service|$EXPECTED_ENV_FILE (ignore_errors=no)|$EXPECTED_WORKING_DIRECTORY|deploy|deploy"
    "$EXPECTED_FRAGMENT_PATH|$EXPECTED_ENV_FILE.bak (ignore_errors=no)|$EXPECTED_WORKING_DIRECTORY|deploy|deploy"
    "$EXPECTED_FRAGMENT_PATH|$EXPECTED_ENV_FILE (ignore_errors=no) /opt/env/bersoncarebot/extra.test (ignore_errors=no)|$EXPECTED_WORKING_DIRECTORY|deploy|deploy"
    "$EXPECTED_FRAGMENT_PATH|/opt/env/bersoncarebot/webapp.test (ignore_errors=no)|$EXPECTED_WORKING_DIRECTORY|deploy|deploy"
    "$EXPECTED_FRAGMENT_PATH|$EXPECTED_ENV_FILE (ignore_errors=no)|/home/deploy/projects/bersoncarebot-test/apps/media-worker|deploy|deploy"
    "$EXPECTED_FRAGMENT_PATH|$EXPECTED_ENV_FILE (ignore_errors=no)|$EXPECTED_WORKING_DIRECTORY|root|root"
  )
  local spec fragment environment working user group
  for spec in "${rejected_specs[@]}"; do
    IFS='|' read -r fragment environment working user group <<< "$spec"
    if assert_properties "$fragment" "$environment" "$working" "$user" "$group" >/dev/null 2>&1; then
      echo "FATAL: media-worker unit property self-test accepted an unsafe fixture" >&2
      return 1
    fi
  done
  echo "assert-media-worker-test-unit-properties self-test: OK"
}

case "${1:-}" in
  --self-test)
    [ "$#" -eq 1 ] || { echo "usage: $0 --self-test | --validate <fragment> <environment-files> <working-directory> <user> <group>" >&2; exit 2; }
    self_test
    ;;
  --validate)
    [ "$#" -eq 6 ] || { echo "usage: $0 --self-test | --validate <fragment> <environment-files> <working-directory> <user> <group>" >&2; exit 2; }
    assert_properties "$2" "$3" "$4" "$5" "$6"
    ;;
  *)
    echo "usage: $0 --self-test | --validate <fragment> <environment-files> <working-directory> <user> <group>" >&2
    exit 2
    ;;
esac
