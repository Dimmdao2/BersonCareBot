#!/usr/bin/env bash
# Fail-closed state machine shared by the live cutover wrapper and its fault proof.

port_context_cutover_reclose() {
  local failure_status=$1
  if ! port_context_cutover_close_target; then
    echo 'port-context cutover sequence: failed to restore CONNECTION LIMIT 0' >&2
    return 70
  fi
  return "$failure_status"
}

run_port_context_cutover_sequence() {
  local status
  PORT_CONTEXT_CUTOVER_STARTED=1

  port_context_cutover_close_target || {
    status=$?
    port_context_cutover_reclose "$status"
    return $?
  }
  port_context_cutover_install_target || {
    status=$?
    port_context_cutover_reclose "$status"
    return $?
  }
  port_context_cutover_apply_hba || {
    status=$?
    port_context_cutover_reclose "$status"
    return $?
  }
  port_context_cutover_open_readiness_window || {
    status=$?
    port_context_cutover_reclose "$status"
    return $?
  }
  port_context_cutover_verify_readiness || {
    status=$?
    port_context_cutover_reclose "$status"
    return $?
  }
  port_context_cutover_restore_operational_limit || {
    status=$?
    port_context_cutover_reclose "$status"
    return $?
  }

  PORT_CONTEXT_CUTOVER_COMPLETE=1
}

run_port_context_cutover_sequence_self_test() {
  local original_limit=12 current_limit sequence fault fault_consumed expected_sequence

  for fault in close install hba open readiness restore; do
    current_limit=$original_limit
    sequence=
    fault_consumed=0
    PORT_CONTEXT_CUTOVER_STARTED=0
    PORT_CONTEXT_CUTOVER_COMPLETE=0

    inject_once() {
      local step=$1
      if [[ "$fault" == "$step" && "$fault_consumed" == 0 ]]; then
        fault_consumed=1
        return 1
      fi
    }

    port_context_cutover_close_target() {
      sequence+="close "
      current_limit=0
      inject_once close
    }
    port_context_cutover_install_target() {
      sequence+="install "
      inject_once install
    }
    port_context_cutover_apply_hba() {
      sequence+="hba "
      inject_once hba
    }
    port_context_cutover_open_readiness_window() {
      sequence+="open "
      current_limit=1
      inject_once open
    }
    port_context_cutover_verify_readiness() {
      sequence+="readiness "
      inject_once readiness
    }
    port_context_cutover_restore_operational_limit() {
      sequence+="restore "
      current_limit=$original_limit
      inject_once restore
    }

    if run_port_context_cutover_sequence; then
      echo "port-context cutover sequence self-test: injected $fault fault unexpectedly succeeded" >&2
      return 1
    fi
    [[ "$PORT_CONTEXT_CUTOVER_STARTED" == 1 && "$PORT_CONTEXT_CUTOVER_COMPLETE" == 0 ]] || {
      echo "port-context cutover sequence self-test: $fault fault reported invalid lifecycle state" >&2
      return 1
    }
    [[ "$current_limit" == 0 ]] || {
      echo "port-context cutover sequence self-test: $fault fault left target open at limit $current_limit" >&2
      return 1
    }
    case "$fault" in
      close) expected_sequence='close close ' ;;
      install) expected_sequence='close install close ' ;;
      hba) expected_sequence='close install hba close ' ;;
      open) expected_sequence='close install hba open close ' ;;
      readiness) expected_sequence='close install hba open readiness close ' ;;
      restore) expected_sequence='close install hba open readiness restore close ' ;;
    esac
    [[ "$sequence" == "$expected_sequence" ]] || {
      echo "port-context cutover sequence self-test: $fault fault crossed its gate: $sequence" >&2
      return 1
    }
  done

  fault=none
  fault_consumed=0
  current_limit=$original_limit
  sequence=
  PORT_CONTEXT_CUTOVER_STARTED=0
  PORT_CONTEXT_CUTOVER_COMPLETE=0
  run_port_context_cutover_sequence
  [[ "$current_limit" == "$original_limit" && "$PORT_CONTEXT_CUTOVER_COMPLETE" == 1 ]] || {
    echo 'port-context cutover sequence self-test: successful cutover did not restore the operational limit' >&2
    return 1
  }
  [[ "$sequence" == 'close install hba open readiness restore ' ]] || {
    echo "port-context cutover sequence self-test: invalid successful order: $sequence" >&2
    return 1
  }

  echo 'port-context cutover sequence self-test: PASS (all post-start faults leave CONNECTION LIMIT 0)'
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  [[ "${1:-}" == --self-test && $# -eq 1 ]] || {
    echo 'usage: port-context-cutover-sequence.sh --self-test' >&2
    exit 2
  }
  run_port_context_cutover_sequence_self_test
fi
