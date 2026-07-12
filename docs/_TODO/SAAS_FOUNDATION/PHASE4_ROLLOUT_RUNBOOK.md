# Phase 4 rollout runbook — prod-copy rehearsal and cutover

Status: draft package for task #703. Owner-executed. This document does not authorize prod/test/dev DB
validation by agents.

## Purpose

Phase 4 proves the compatibility deploy, fresh disposable prod-copy rehearsal, real-role process-family
smoke, and final cutover path without breaking clinic #1.

This is not a replacement for live rehearsal evidence. The preflight harness is DB-free by default and must
not claim doctor/patient/integrator/scheduler/media/signup flows passed unless an owner-provided evidence
file records those gates.

## Absolute guards

- Never connect this rehearsal to `bcb_webapp_prod`, `bcb_webapp_test`, `bcb_webapp_dev`, or any
  prod/test/dev-shaped DB name.
- Disposable DB names only: `bcb_saas_*_scratch_*` or `bcb_saas_*_rehearsal_*`.
- Do not source `/opt/env/bersoncarebot/*` for rehearsal commands.
- Do not connect to the production host/IP from rehearsal tooling.
- Do not print PII, full DB URLs, tokens, dump paths containing secrets, patient names, phone numbers, or
  message bodies in evidence.
- `specialist_signup_enabled=false` until all rehearsal gates pass and owner explicitly opens signup.
- Environment-boundary decision is settled for this rollout: prod uses a separate cluster; dev+test share
  the non-prod cluster; fixed role names stay `app_staff` and `app_patient`.

## Compatibility deploy

Goal: deploy schema, locked-principal runtime wiring, #664 value guards, and specialist provisioning while
signup is disabled and runtime remains compatible.

Required evidence:
- `specialist_signup_enabled=false`.
- Missing-principal shadow count is `0`.
- No new permission errors across current clinic doctor/patient flows.
- Compatibility migrations `0160`-`0176` are NO FORCE: they may enable RLS and install policies, but they
  must not contain `FORCE ROW LEVEL SECURITY`.
- Migration `0177_phase4_no_force_rls_compat` must run before final cutover; it normalizes already-migrated
  environments that may have applied the earlier FORCE-containing dormant SQL.
- Final FORCE / rollback NO FORCE is isolated in `deploy/postgres/phase4-force-rls-cutover.sql` and guarded
  by `docs/_TODO/SAAS_FOUNDATION/scripts/check-phase4-force-cutover-sql.mjs`.

## Fresh prod-copy rehearsal

1. Restore the newest prod dump into a disposable non-prod DB named like
   `bcb_saas_phase4_rehearsal_<date>_<suffix>`.
2. Use non-prod runtime env assembled for rehearsal; do not source prod env files.
3. Run static preflight:
   ```bash
   PHASE4_REHEARSAL_DATABASE_URL='postgres://.../bcb_saas_phase4_rehearsal_<suffix>' \
     node docs/_TODO/SAAS_FOUNDATION/scripts/run-phase4-prod-copy-rehearsal.mjs --require-rehearsal-url
   ```
4. Run live rehearsal manually against the disposable app stack and record only gate statuses.

The harness validates safety and static gates only. It does not connect to the rehearsal DB and does not run
browser/API flows.

## Live rehearsal gates

Current clinic flows:
- Doctor: login, patient list/card, schedule, messages, treatment program/LFK, media read.
- Patient: login, own history, own messages, own program/LFK, own media playback.
- Integrator: inbound sync reads/writes with organization context.
- Scheduler: due jobs and advisory-lock cleanup with principal cleanup.
- Queue/worker: queued notifications/jobs do not lose principal context.
- Media: transcode/read/write paths keep organization/patient ownership.
- Pre-auth/bootstrap: signup/OTP/public flows work without scoped data leakage.

Synthetic isolation:
- Create synthetic org B and patient B2 through app/API paths.
- Prove clinic A cannot read or write B rows.
- Prove patient A cannot read another patient in the same org or another org.
- Prove unset scoped context fails closed under enforce mode.
- Prove specialist signup creates a new organization without SQL/manual inserts.

Process-family real-role smoke after B4-fanout:
- Webapp staff paths run under `app_staff`.
- Patient paths run under `app_patient`.
- Integrator/scheduler/media/queue paths use the intended staff/bootstrap principal path.
- Role names remain `app_staff`/`app_patient` in the selected cluster boundary.

## Evidence file

Optional harness input:

```json
{
  "gates": {
    "compat.signup_disabled": "pass",
    "compat.shadow_missing_principal_zero": "pass",
    "prod_copy.fresh_disposable_copy": "pass",
    "prod_copy.no_prod_test_dev_db": "pass",
    "env_boundary.prod_separate_cluster": "pass",
    "env_boundary.dev_test_shared_nonprod": "pass",
    "roles.app_staff_app_patient_names": "pass",
    "current_clinic.doctor_flow": "pass",
    "current_clinic.patient_flow": "pass",
    "current_clinic.integrator_flow": "pass",
    "current_clinic.scheduler_flow": "pass",
    "current_clinic.queue_flow": "pass",
    "current_clinic.media_flow": "pass",
    "current_clinic.pre_auth_flow": "pass",
    "synthetic.org_b_patient_b2_created": "pass",
    "synthetic.staff_a_cannot_read_or_write_b": "pass",
    "synthetic.patient_a_cannot_read_other_patient": "pass",
    "synthetic.unset_context_fail_closed": "pass",
    "signup.creates_org_without_sql": "pass",
    "guards.value_664_green": "pass",
    "process_family.real_app_staff_role": "pass",
    "process_family.real_app_patient_role": "pass",
    "cutover.force_only_in_final_migration": "pass"
  }
}
```

Run:

```bash
node docs/_TODO/SAAS_FOUNDATION/scripts/run-phase4-prod-copy-rehearsal.mjs --evidence=phase4-evidence.json
```

Keep evidence concise: gate IDs, pass/fail, non-PII notes, command names, timestamps, commit SHA.

## Prod cutover

Proceed only after all rehearsal gates pass and owner approves the maintenance window.

1. Take backup.
2. Keep signup disabled.
3. Enter maintenance.
4. Apply strict policies and final FORCE cutover step from the approved cutover DB session:
   `deploy/postgres/phase4-force-rls-cutover.sql`.
5. Switch runtime to role/marker-aware credentials.
6. Smoke doctor and patient flows.
7. Restore traffic.
8. Enable signup only after green post-traffic smoke.

Absolute cutover gates:
- `0` missing-principal entries.
- `0` permission errors in smoke logs.
- Green 2-org and 2-patient isolation checks.
- Green #664 value-guard checks.
- Green process-family real-role smoke.

## Rollback

1. Disable signup.
2. Return to NO FORCE / legacy-compatible policy state from the approved cutover DB session:
   `deploy/postgres/phase4-force-rls-cutover.sql` with `phase4_force_rls_down=1`.
3. Restore previous runtime role wiring.
4. Restart affected processes.
5. Re-run doctor + patient smoke on clinic #1.

Rollback must not require SQL hand-edits to create/delete tenant data.
