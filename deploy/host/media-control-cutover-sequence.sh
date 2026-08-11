#!/usr/bin/env bash
# Shared post-webapp cutover order. Callers provide the four named functions below.

run_media_control_cutover_sequence(){
  media_cutover_require_new_webapp_running || return
  media_cutover_require_authenticated_control || return
  media_cutover_require_legacy_login_retired || return
  media_cutover_restart_worker || return
}

run_media_control_cutover_sequence_self_test(){
  local events="" webapp_ready=0 control_ready=0 legacy_retired=0

  media_cutover_require_new_webapp_running(){
    events+="webapp "
    [ "$webapp_ready" = "1" ]
  }
  media_cutover_require_authenticated_control(){
    events+="control "
    [ "$control_ready" = "1" ]
  }
  media_cutover_require_legacy_login_retired(){
    events+="retired "
    [ "$legacy_retired" = "1" ]
  }
  media_cutover_restart_worker(){
    events+="restart "
  }

  if run_media_control_cutover_sequence; then
    echo 'media-control cutover self-test: pre-webapp fault mutation unexpectedly succeeded' >&2
    return 1
  fi
  [ "$events" = "webapp " ] || {
    echo 'media-control cutover self-test: pre-webapp failure crossed the webapp gate' >&2
    return 1
  }

  events=""
  webapp_ready=1
  if run_media_control_cutover_sequence; then
    echo 'media-control cutover self-test: missing control route unexpectedly succeeded' >&2
    return 1
  fi
  [ "$events" = "webapp control " ] || {
    echo 'media-control cutover self-test: control failure reached retirement or restart' >&2
    return 1
  }

  events=""
  control_ready=1
  if run_media_control_cutover_sequence; then
    echo 'media-control cutover self-test: surviving legacy login unexpectedly succeeded' >&2
    return 1
  fi
  [ "$events" = "webapp control retired " ] || {
    echo 'media-control cutover self-test: retirement failure reached worker restart' >&2
    return 1
  }

  events=""
  legacy_retired=1
  run_media_control_cutover_sequence
  [ "$events" = "webapp control retired restart " ] || {
    echo 'media-control cutover self-test: valid event order was not completed' >&2
    return 1
  }
  echo 'media-control cutover sequence self-test: OK'
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  [ "${1:-}" = "--self-test" ] && [ "$#" -eq 1 ] || {
    echo 'usage: media-control-cutover-sequence.sh --self-test' >&2
    exit 2
  }
  run_media_control_cutover_sequence_self_test
fi
