#!/usr/bin/env bash
# Disposable real-SQL proof that the declared privilege surface of app_seam_patient_self_actions_owner
# is sufficient to execute the two patient program-item roots end to end under a patient principal.
#
# Named failure this catches: a patient opens or marks done an item of their own rehabilitation
# programme, the definer root reads a whole row (`s.*` / `si.*` / `RETURNING *` into a %ROWTYPE) from a
# relation on which the seam owner deliberately holds only column-level SELECT, PostgreSQL answers
# 42501 "permission denied for table treatment_program_instance_stage(_item)s", and the action fails.
# Expensive and silent from the outside: the programme simply stops responding to the patient.
#
# The grants below are rendered FROM deploy/postgres/privileges/declaration.ts, not copied, so the
# proof always exercises the declared surface rather than a hand-tuned superset. Two self-tests
# required by AGENTS.md §10a close the loop: (a) the historical whole-row bodies are reinstalled and
# must bring the loud 42501 back, per defect site; (b) the privacy assertion is shown to be live by
# widening the grant to table level and demanding that the very same check flips.
set -euo pipefail

pg_bin=${PGBIN:-/usr/lib/postgresql/16/bin}
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
work_dir=$(mktemp -d "${TMPDIR:-/tmp}/bcb-patient-program-item.XXXXXX")
data_dir="$work_dir/data"
db_name=bcb_patient_program_item_proof
port=$((59000 + RANDOM % 1000))
login=bcb_patient_program_item_patient
capability=66666666-6666-4666-8666-666666666666
relation_hash=0355fd5ea0ae72a2f99fa916e9a78d189b3a69ab6f41dc412201df48313f6f5a
org=c0000000-0000-4000-8000-000000000001
patient=c0000000-0000-4000-8000-000000000002
opaque=c0000000-0000-4000-9000-000000000002
instance=c0000000-0000-4000-8000-000000000003
stage=c0000000-0000-4000-8000-000000000004
item=c0000000-0000-4000-8000-000000000005

# The columns the declaration deliberately withholds from the seam owner. Named here so a green run
# also states, in the clear, which patient-facing content the seam still cannot read.
withheld_stage_columns=(source_stage_id title description local_comment skip_reason goals objectives
  expected_duration_days expected_duration_text)
withheld_item_columns=(sort_order comment local_comment settings group_id created_at)

cleanup() {
  [[ -f "$data_dir/postmaster.pid" ]] && "$pg_bin/pg_ctl" -D "$data_dir" -m immediate stop >/dev/null 2>&1 || true
  [[ ${PATIENT_PROGRAM_ITEM_KEEP_DISPOSABLE:-0} == 1 ]] || rm -rf "$work_dir"
}
trap cleanup EXIT
fail() { echo "patient program item narrow reads: FAIL: $*" >&2; exit 1; }
assert_eq() { [[ "$1" == "$2" ]] || fail "expected [$2], got [$1]"; }
psql_admin() { "$pg_bin/psql" -X -v ON_ERROR_STOP=1 -h "$data_dir" -p "$port" -U dev -d "$db_name" "$@"; }

# ── the bodies and grants under test, all taken from the repository's own sources ────────────────
node --experimental-strip-types "$repo_root/deploy/postgres/privileges/fixtures/render-patient-program-item-proof.mjs" \
  --out "$work_dir"
seam_owner=$(cat "$work_dir/seam-owner.txt")

"$pg_bin/initdb" -D "$data_dir" --auth=trust --username=dev >/dev/null
printf '%s\n' "port = $port" "unix_socket_directories = '$data_dir'" >> "$data_dir/postgresql.conf"
"$pg_bin/pg_ctl" -D "$data_dir" -l "$work_dir/postgres.log" start >/dev/null
"$pg_bin/createdb" -h "$data_dir" -p "$port" -U dev "$db_name"
psql_admin -c 'CREATE ROLE postgres SUPERUSER NOLOGIN' >/dev/null
node "$repo_root/deploy/postgres/privileges/generate-cli.mjs" --shared-role-baseline | psql_admin -1 >/dev/null
psql_admin -c "CREATE ROLE $login LOGIN" >/dev/null
psql_admin -v app_staff_login="$login" -v app_patient_login="$login" \
  -v app_global_admin_login="$login" -v integrator_login="$login" \
  -f "$repo_root/deploy/postgres/port-context/contract.sql" >/dev/null
psql_admin -c 'ALTER EVENT TRIGGER bcb_relation_birth_wall DISABLE' >/dev/null

# The five relations carry their full production column set, so the withheld columns really exist and
# a whole-row read really is a privilege violation rather than a no-op.
psql_admin <<SQL >/dev/null
GRANT app_patient TO $login;
CREATE TABLE public.treatment_program_instances (
  id uuid PRIMARY KEY, template_id uuid, patient_user_id uuid NOT NULL, assigned_by uuid,
  title text NOT NULL, status text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(), patient_plan_last_opened_at timestamptz,
  assignment_source text NOT NULL, organization_id uuid NOT NULL
);
CREATE TABLE public.treatment_program_instance_stages (
  id uuid PRIMARY KEY, instance_id uuid NOT NULL, source_stage_id uuid, title text NOT NULL,
  description text, sort_order integer NOT NULL DEFAULT 0, local_comment text, status text NOT NULL,
  skip_reason text, goals text, objectives text, expected_duration_days integer,
  expected_duration_text text, started_at timestamptz, organization_id uuid NOT NULL
);
CREATE TABLE public.treatment_program_instance_stage_items (
  id uuid PRIMARY KEY, stage_id uuid NOT NULL, item_type text NOT NULL, item_ref_id uuid NOT NULL,
  sort_order integer NOT NULL DEFAULT 0, comment text, local_comment text, settings jsonb,
  snapshot jsonb NOT NULL, completed_at timestamptz, is_actionable boolean,
  status text NOT NULL DEFAULT 'active', group_id uuid, created_at timestamptz NOT NULL DEFAULT now(),
  last_viewed_at timestamptz, organization_id uuid NOT NULL
);
CREATE TABLE public.treatment_program_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), instance_id uuid NOT NULL, actor_id uuid,
  event_type text NOT NULL, target_type text NOT NULL, target_id uuid NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb, reason text,
  created_at timestamptz NOT NULL DEFAULT now(), organization_id uuid NOT NULL
);
CREATE TABLE public.program_action_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), instance_id uuid NOT NULL,
  instance_stage_item_id uuid NOT NULL, patient_user_id uuid NOT NULL, session_id uuid,
  action_type text NOT NULL, payload jsonb, note text,
  created_at timestamptz NOT NULL DEFAULT now(), organization_id uuid NOT NULL
);
INSERT INTO app_ext.variant_a_identity_refs(physical_user_id, opaque_ref) VALUES ('$patient', '$opaque');
INSERT INTO public.treatment_program_instances
  (id, patient_user_id, title, status, assignment_source, organization_id)
VALUES ('$instance', '$patient', 'Программа', 'active', 'doctor', '$org');
INSERT INTO public.treatment_program_instance_stages
  (id, instance_id, title, description, sort_order, local_comment, status, skip_reason, goals,
   objectives, expected_duration_days, expected_duration_text, organization_id)
VALUES ('$stage', '$instance', 'Этап 1', 'клиническое описание', 0, 'заметка врача', 'available',
        NULL, 'цели', 'задачи', 14, 'две недели', '$org');
INSERT INTO public.treatment_program_instance_stage_items
  (id, stage_id, item_type, item_ref_id, sort_order, comment, local_comment, settings, snapshot,
   is_actionable, status, created_at, organization_id)
VALUES ('$item', '$stage', 'exercise', '$stage', 1, 'комментарий', 'локальный комментарий',
        '{"sets":3}'::jsonb, '{"title":"Приседания"}'::jsonb, true, 'active', now(), '$org');
INSERT INTO app_ext.port_context_capabilities
  (capability_id, port, session_login, target_role, context_class, purpose, function_identity)
VALUES ('$capability', 'webapp', '$login', 'app_patient', 'patient', 'relation', NULL);
SQL

# Exactly the declared surface — rendered from the declaration, never hand-written here.
psql_admin -f "$work_dir/declared-grants.sql" >/dev/null
psql_admin -c "GRANT USAGE ON SCHEMA app, public TO $seam_owner" >/dev/null
psql_admin -c "GRANT EXECUTE ON FUNCTION app.current_org_id(), app.current_patient_user_id(), app.require_attested_context_for_roles(name,name[]) TO $seam_owner" >/dev/null

install_body() {
  local file=$1 signature=$2
  psql_admin -f "$file" >/dev/null
  psql_admin -c "ALTER FUNCTION $signature OWNER TO $seam_owner" >/dev/null
  psql_admin -c "REVOKE ALL ON FUNCTION $signature FROM PUBLIC; GRANT EXECUTE ON FUNCTION $signature TO app_patient" >/dev/null
}
touch_signature='app.touch_current_patient_program_item(uuid,uuid)'
complete_signature='app.complete_current_patient_program_item(uuid,uuid,integer,text)'
claims="ROW(1,'patient'::app.port_context_class,'app_patient'::name,'relation',NULL::regprocedure,decode('$relation_hash','hex'),'$opaque'::uuid,'$opaque'::uuid,'$org'::uuid,NULL::bigint,NULL::uuid)::app.port_context_claims"

call_root() {
  psql_admin -At <<SQL
SET SESSION AUTHORIZATION $login; BEGIN;
SELECT app.install_port_context('$capability', $claims); SET LOCAL ROLE app_patient;
SELECT $1::text; COMMIT;
SQL
}
payload_of() { printf '%s\n' "$1" | grep -o '{.*}' | tail -1; }
reset_fixture() {
  psql_admin -c "UPDATE public.treatment_program_instance_stages SET status='available', started_at=NULL WHERE id='$stage';
                 UPDATE public.treatment_program_instance_stage_items SET completed_at=NULL WHERE id='$item';
                 DELETE FROM public.treatment_program_events; DELETE FROM public.program_action_log;" >/dev/null
}

install_body "$work_dir/current-touch.sql" "$touch_signature"
install_body "$work_dir/current-complete.sql" "$complete_signature"

# ── 1. the shipped touch root must run to completion on the declared surface ─────────────────────
out=$(call_root "app.touch_current_patient_program_item('$instance'::uuid, '$item'::uuid)" 2>"$work_dir/touch.err") || {
  cat "$work_dir/touch.err" >&2
  fail 'the declared surface does not execute the shipped touch root'
}
stage_payload=$(payload_of "$out")
[[ -n $stage_payload ]] || fail "touch root returned no payload: $out"
assert_eq "$(psql_admin -Atc "SELECT '$stage_payload'::jsonb ->> 'id'")" "$stage"
assert_eq "$(psql_admin -Atc "SELECT '$stage_payload'::jsonb ->> 'status'")" in_progress
assert_eq "$(psql_admin -Atc "SELECT status FROM public.treatment_program_instance_stages WHERE id='$stage'")" in_progress
assert_eq "$(psql_admin -Atc "SELECT count(*) FROM public.treatment_program_events WHERE target_id='$stage' AND event_type='status_changed'")" 1
# The stage narrative the clinician wrote must not leak into the patient-facing payload.
for column in "${withheld_stage_columns[@]}"; do
  assert_eq "$(psql_admin -Atc "SELECT '$stage_payload'::jsonb ? '$column'")" f
done

# ── 2. the shipped complete root must run to completion on the declared surface ──────────────────
reset_fixture
out=$(call_root "app.complete_current_patient_program_item('$instance'::uuid, '$item'::uuid, 30, '{\"perceivedDifficulty\":\"easy\",\"reps\":10}')" 2>"$work_dir/complete.err") || {
  cat "$work_dir/complete.err" >&2
  fail 'the declared surface does not execute the shipped complete root'
}
completion=$(payload_of "$out")
[[ -n $completion ]] || fail "complete root returned no payload: $out"
assert_eq "$(psql_admin -Atc "SELECT ('$completion'::jsonb ->> 'id') IS NOT NULL")" t
assert_eq "$(psql_admin -Atc "SELECT '$completion'::jsonb -> 'payload' ->> 'itemType'")" exercise
assert_eq "$(psql_admin -Atc "SELECT '$completion'::jsonb ->> 'hadCompleted'")" false
assert_eq "$(psql_admin -Atc "SELECT count(*) FROM public.program_action_log WHERE instance_stage_item_id='$item' AND action_type='done'")" 1
assert_eq "$(psql_admin -Atc "SELECT completed_at IS NOT NULL FROM public.treatment_program_instance_stage_items WHERE id='$item'")" t
assert_eq "$(psql_admin -Atc "SELECT status FROM public.treatment_program_instance_stages WHERE id='$stage'")" in_progress

# ── 3. the privacy line: the seam owner holds no table-level SELECT and no withheld column ───────
assert_privacy_line() {
  assert_eq "$(psql_admin -Atc "SELECT has_table_privilege('$seam_owner','public.treatment_program_instance_stages','SELECT')")" f
  assert_eq "$(psql_admin -Atc "SELECT has_table_privilege('$seam_owner','public.treatment_program_instance_stage_items','SELECT')")" f
  for column in "${withheld_stage_columns[@]}"; do
    assert_eq "$(psql_admin -Atc "SELECT has_column_privilege('$seam_owner','public.treatment_program_instance_stages','$column','SELECT')")" f
  done
  for column in "${withheld_item_columns[@]}"; do
    assert_eq "$(psql_admin -Atc "SELECT has_column_privilege('$seam_owner','public.treatment_program_instance_stage_items','$column','SELECT')")" f
  done
}
assert_privacy_line

# Self-test of the privacy line itself: widen the grant to table level and demand that the very same
# checks flip. A green suite that got there by widening the surface must not be able to stay green.
psql_admin -c "GRANT SELECT ON TABLE public.treatment_program_instance_stages TO $seam_owner" >/dev/null
if (assert_privacy_line) 2>/dev/null; then
  fail 'the privacy assertion stayed green after the seam owner was granted table-level SELECT'
fi
psql_admin -c "REVOKE SELECT ON TABLE public.treatment_program_instance_stages FROM $seam_owner" >/dev/null
psql_admin -f "$work_dir/declared-grants.sql" >/dev/null
assert_privacy_line

# ── 4. self-test: each whole-row read must fail loudly, never silently return empty ──────────────
expect_denial() {
  local label=$1 body=$2 signature=$3 call=$4 relation=$5
  reset_fixture
  install_body "$body" "$signature"
  if call_root "$call" >"$work_dir/$label.out" 2>&1; then
    fail "$label: the whole-row body returned a result instead of the 42501 the engine owes us"
  fi
  grep -q "permission denied for table $relation" "$work_dir/$label.out" \
    || fail "$label: no column-privilege denial: $(cat "$work_dir/$label.out")"
}
expect_denial touch-whole-row "$work_dir/historical-touch.sql" "$touch_signature" \
  "app.touch_current_patient_program_item('$instance'::uuid, '$item'::uuid)" \
  treatment_program_instance_stages
install_body "$work_dir/current-touch.sql" "$touch_signature"

complete_call="app.complete_current_patient_program_item('$instance'::uuid, '$item'::uuid, 30, '{}')"
expect_denial complete-item-whole-row "$work_dir/historical-complete.sql" "$complete_signature" \
  "$complete_call" treatment_program_instance_stage_items
expect_denial complete-stage-whole-row "$work_dir/widened-complete-stage.sql" "$complete_signature" \
  "$complete_call" treatment_program_instance_stages

# ── 5. and back to green, so a passing run cannot mean "the assertion stopped looking" ───────────
reset_fixture
install_body "$work_dir/current-complete.sql" "$complete_signature"
out=$(call_root "$complete_call" 2>"$work_dir/restored.err") || {
  cat "$work_dir/restored.err" >&2
  fail 'the restored complete root no longer executes on the declared surface'
}
[[ -n $(payload_of "$out") ]] || fail "restored complete root returned no payload: $out"

echo 'patient program item narrow reads: PASS'
