#!/usr/bin/env bash
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
cd "$REPO_ROOT"

faults=(
  privilege
  two-clinic-blindness
  staff-insert
  foreign-org-conflict
  fio-decision-not-persisted
  support-always-escalates
  decision-stays-pending
  comment-not-saved
  approval-comment-not-saved
  refusal-read-any-org
  refusal-write-any-org
  refusal-read-any-status
  refusal-read-any-reason
  approval-comment-foreign-row
  approval-comment-optional
  refusal-comment-optional
  refusal-write-any-row
  refusal-write-any-status
  refusal-write-any-reason
  approval-any-status
  approval-any-reason
  approval-write-any-row
  approval-write-any-pair
  refusal-read-any-row
  neighbour-approval-any-org
  neighbour-approval-any-status
  neighbour-approval-any-reason
  neighbour-approval-not-required
  neighbour-approval-any-pair
)

total=0
caught=0
missed=0
marker_missing=0
unexpected_rc=0
rollback_bad=0

for fault in "${faults[@]}"; do
  total=$((total + 1))
  set +e
  output="$(
    env \
      RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB=1 \
      DOCTOR_MEDICAL_MERGE_DOOR_ECHO=1 \
      DOCTOR_MEDICAL_MERGE_DOOR_FAULT="$fault" \
      node --test deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs 2>&1
  )"
  rc=$?
  set -e

  # Считаем исходные TAP-comment строки. Текст упавшего assertion повторяет весь proof-output с
  # отступом; общий grep ошибочно принял бы эти диагностические копии за дополнительные прогоны.
  marker_count=$(grep -Ec "^# FAULT INJECTED: ${fault}$" <<<"$output" || true)
  rollback_total=$(grep -Ec '^# ROLLBACK_FACTS:' <<<"$output" || true)
  rollback_zero=$(grep -Ec '^# ROLLBACK_FACTS: \{"fixtureRows":0\}$' <<<"$output" || true)
  failures=$(grep -E '^not ok [0-9]+' <<<"$output" | paste -sd, -)

  if [[ "$marker_count" -eq 0 ]]; then
    marker_missing=$((marker_missing + 1))
  elif [[ "$rc" -eq 1 ]]; then
    caught=$((caught + 1))
  fi
  if [[ "$rc" -eq 0 ]]; then
    missed=$((missed + 1))
  elif [[ "$rc" -ne 1 ]]; then
    unexpected_rc=$((unexpected_rc + 1))
  fi
  if [[ "$rollback_total" -ne 7 || "$rollback_zero" -ne 7 ]]; then
    rollback_bad=$((rollback_bad + 1))
  fi

  printf 'FAULT_RESULT name=%s rc=%s marker=%s rollback=%s/7 failures=%s\n' \
    "$fault" "$rc" "$marker_count" "$rollback_zero" "${failures:-none}"
done

printf 'SUMMARY faults=%s caught=%s missed=%s marker_missing=%s unexpected_rc=%s rollback_bad=%s\n' \
  "$total" "$caught" "$missed" "$marker_missing" "$unexpected_rc" "$rollback_bad"

test "$caught" -eq "$total"
test "$missed" -eq 0
test "$marker_missing" -eq 0
test "$unexpected_rc" -eq 0
test "$rollback_bad" -eq 0
