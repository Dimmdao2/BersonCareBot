> **Retired-path notice.** Any command or path below that targets a pre-B0 retired database executor is preserved only as historical evidence; it is not runnable or current guidance. Other content in this document is unchanged. See [the current B0 retirement rule](/docs/archive/2026-08-no-disposable-db-retirement/RETIREMENT.md).

# Phase 2 orchestration — enforce-ready RLS + #664

Status: closed for static/scratch Phase 2 proof package on 2026-07-12. Phase 4 disposable prod-copy/live
rehearsal remains the next external gate.

Rules:

- No prod/test/dev database validation.
- Scratch DB and disposable prod-dump copy only.
- No push.
- No self-acceptance: code slices require independent audit before Phase 2 can be called complete.
- Orchestrator mode is mandatory for the rest of Phase 2 and follow-on flip work:
  - Lead owns scope, taskdb/docs, branch hygiene, validation selection, integration, commit messages, and final verdicts.
  - Worker/Sol agents own implementation or audit for each code slice.
  - Lead may make only narrow integration/doc/taskdb edits directly; code behavior changes must either be worker-authored or independently audited before commit.
  - Each slice flow is: brief -> worker result -> lead review/integration -> targeted validation on allowed DB only -> independent audit -> commit -> taskdb/doc update.
  - If a slice starts drifting into a broad refactor or full-CI loop, split it at the batch boundary and delegate the mechanical run/fix cycle.

## Workstreams

### P2-A — Helper-based RLS renderer

Goal:

- Future generated RLS predicates read trusted identity from protected helper functions:
  `app.current_org_id()`, `app.current_patient_user_id()`, `app.current_integrator_user_id()`.
- `app.is_staff()` stays role-derived.
- Dormant generation is compatibility-safe: no `FORCE ROW LEVEL SECURITY`, patient helper unset permits.
- Enforce generation is fail-closed and includes `FORCE ROW LEVEL SECURITY`.

Owner: orchestrator integration + worker Franklin for checks/guards.

Current evidence:

- Jason audit confirmed raw `current_setting('app.*')` was still the renderer source.
- `rls-sql-renderer.mjs` now renders helper calls and split `patientMode`.
- 2026-07-12 04:44 MSK validation passed:
  - `node --check docs/_TODO/SAAS_FOUNDATION/scripts/rls-sql-renderer.mjs`
  - `node docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-8-sql-renderer.mjs`
  - `node docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-8-3-policy-generator.mjs`
  - `node docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-8-4-policy-generator.mjs`
  - `node docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-8-5-policy-generator.mjs`
  - `node docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-8-6-policy-generator.mjs`
  - `node docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-9-enforce-descriptors.mjs`
  - `pnpm run check:saas-db-regression`
- Gibbs independent audit found a P0.9 enforce blocker: conditional patient-owned descriptors
  (`public.media_files`, `public.media_transcode_jobs`) were rendered org-only because P0.9 checked
  only `patientColumn`/`patientChain`. Fixed by using `hasAnyPatientOwnership()` and adding explicit
  P0.9 conditional/conditional-chain assertions.
- 2026-07-12 04:48 MSK post-audit-fix validation passed:
  - focused P0.8/P0.9 generator suite
  - focused eslint for changed scripts
  - `git diff --check`
  - `pnpm run check:saas-db-regression`

### P2-B — Protected context reusable SQL

Goal:

- Move Phase 1 proof DDL for protected context helpers from scratch-only smoke into reusable migration/ops
  artifact.
- Keep signing secret out of repo docs and migrations; artifact must define storage shape and functions,
  not real secret values.
- Smoke must keep proving raw GUC spoofing does not affect helpers.

Owner: pending worker assignment after P2-A checks stabilize.

Current artifact slice:

- `deploy/postgres/p2-b-protected-principal-context.sql`: reusable ops SQL with protected context
  tables, signed setter, helper functions, role-derived `app.is_staff()`, revokes/grants, and down
  mode. Real signing secret is supplied by psql variable, not committed.
- `docs/_TODO/SAAS_FOUNDATION/scripts/check-p2-b-protected-context-sql.mjs`: DB-free static guard.
- `docs/_TODO/SAAS_FOUNDATION/scripts/smoke-p2-b-protected-context.mjs`: scratch-only live proof
  applying the reusable artifact.
- `scripts/check-saas-db-regression.mjs`: static guard wired into the standard SaaS regression gate.

Validation:

- `node --check docs/_TODO/SAAS_FOUNDATION/scripts/check-p2-b-protected-context-sql.mjs`
- `node docs/_TODO/SAAS_FOUNDATION/scripts/check-p2-b-protected-context-sql.mjs`
- `node --check docs/_TODO/SAAS_FOUNDATION/scripts/smoke-p2-b-protected-context.mjs`
- `node docs/_TODO/SAAS_FOUNDATION/scripts/smoke-p2-b-protected-context.mjs`
- `pnpm --dir packages/db-principal run typecheck`
- `pnpm exec eslint docs/_TODO/SAAS_FOUNDATION/scripts/check-p2-b-protected-context-sql.mjs docs/_TODO/SAAS_FOUNDATION/scripts/smoke-p2-b-protected-context.mjs scripts/check-saas-db-regression.mjs`
- `git diff --check`
- `pnpm run check:saas-db-regression`

Audit:

- Sol/Codex read-only audit found a blocking `NULL` signature bypass in the setter and a pgcrypto
  schema assumption. Fixed by explicit signature format/null validation, `IS DISTINCT FROM`, smoke
  coverage for NULL signatures, and an early `pgcrypto_must_be_installed_in_app_ext` guard.
- Sol/Codex read-only re-audit found no remaining P0/P1 blocker in P2-B.

### B4-fanout L1 — locked principal runtime wiring

Goal:

- Add opt-in runtime wiring so webapp, integrator, scheduler, and media-worker DB chokepoints can apply
  the P2-B protected principal context when operators set `DB_PRINCIPAL_CONTEXT_MODE=locked` and provide
  `DB_PRINCIPAL_SIGNING_SECRET`.
- Keep default runtime as `legacy-guc`; this slice must not flip current process behavior before P2-B SQL
  is deployed and ops explicitly sets the env.

Status:

- Taskdb `#688` worker slice implemented bounded L1 wiring: shared `DbPrincipalApplyOptions` builder,
  checkout and promise-form `pool.query` wrappers pass options into
  `applyCurrentDbPrincipalToConnection`, `applyCurrentDbPrincipalToTransaction`, and
  `clearDbPrincipalFromConnection`.
- Scheduler advisory lock cleanup now releases the prepared integrator client through
  `releasePreparedIntegratorClient`, so locked cleanup is not bypassed after checkout.
- Static guard `docs/_TODO/SAAS_FOUNDATION/scripts/check-b4-locked-runtime-wiring.mjs` is wired into
  `scripts/check-saas-db-regression.mjs`.

Residual:

- This does NOT switch DB roles and does NOT prove real process-family runtime under `app_staff` /
  `app_patient`.
- Process-family smoke under real app roles, cluster-global role naming, and env-boundary decisions remain
  B4-fanout / pre-flip blockers.

### B4-fanout L2 — locked runtime live scratch proof

Goal:

- Prove the L1 Node runtime locked principal path against the reusable P2-B SQL artifact on disposable
  scratch DB/roles, without touching prod/test/dev/app databases.

Status:

- Worker added `docs/_TODO/SAAS_FOUNDATION/scripts/smoke-b4-locked-runtime-principal.mjs`.
- The smoke creates a disposable `bcb_saas_*_scratch_*` database and owner/staff/patient roles, applies
  `deploy/postgres/p2-b-protected-principal-context.sql` with a random signing secret, then imports the
  built `packages/db-principal/dist/index.js` runtime and exercises:
  `buildDbPrincipalApplyOptions`, `runWithDbStaffPrincipal`, `runWithDbPatientPrincipal`,
  `runWithDbIntegratorPrincipal`, `applyCurrentDbPrincipalToConnection`, and
  `clearDbPrincipalFromConnection`.

Validation command:

- `node docs/_TODO/SAAS_FOUNDATION/scripts/smoke-b4-locked-runtime-principal.mjs`
  (the script builds `packages/db-principal` before importing its generated runtime).

Residual:

- This proves direct Node `pg` connections under disposable staff/patient app roles on local scratch DB.
  It still does not prove full webapp/integrator/scheduler/media-worker process-family behavior or the
  eventual production role naming/deployment flip.

### P2-C — #664 value-level residuals

Goal:

- Close or explicitly defer with blocking status every pre-flip value-level residual from `P0_5B_GRANTS.md`.
- Preferred fixes: repo split or DB trigger/WITH CHECK where column grants cannot express value constraints.

Owner: explorer Locke for map; implementation workers after map review.

Targets:

- booking lifecycle `be_appointment_*`
- `program_item_discussion_messages`
- `support_conversation_messages`
- `be_appointments`
- `lfk_sessions.organization_id`
- `reminder_rules.notification_topic_code`
- `user_channel_preferences.is_preferred_for_auth`
- `treatment_program_events.actor_id`
- `online_intake_status_history`

### P2-D — Validation and audit

Required before completion:

- Repeatable proof package runner:
  - Default static-only package, DB-free:
    `node docs/_TODO/SAAS_FOUNDATION/scripts/run-p2-d-proof-package.mjs`
  - Explicit scratch-smoke package:
    `node docs/_TODO/SAAS_FOUNDATION/scripts/run-p2-d-proof-package.mjs --with-scratch-smokes`
- Static-only package proves:
  - `node --check` passes for the P2-D runner, `scripts/check-saas-db-regression.mjs`, and the P2-B/C1/C2/C3
    static/smoke scripts.
  - P2-B/C1/C2/C3 static SQL guards pass.
  - `node scripts/check-saas-db-regression.mjs` passes, including the wider SaaS DB guard matrix and the
    wired P2-B/C1/C2/C3 guards.
- Scratch-smoke package additionally proves existing P2-B/C1/C2/C3 scratch smokes still pass on disposable
  `bcb_saas_*_scratch_*` databases. This mode is intentionally not default because it creates and drops local
  scratch databases/roles via the existing smoke scripts.
- DB safety boundary:
  - The runner never uses `DATABASE_URL` and sanitizes `DATABASE_URL`/`PG*` variables for child commands.
  - Scratch mode refuses parent `DATABASE_URL`/`PGDATABASE` values that parse to prod/test/dev-shaped DB names
    or names that are not explicitly scratch/rehearsal/copy-shaped.
  - Never point P2-D validation at `bcb_webapp_prod`, `bcb_webapp_test`, `bcb_webapp_dev`, or any obvious
    prod/test/dev database name.
- Separate gates not replaced by the runner:
  - Real disposable prod-dump copy rehearsal from Phase 4 remains mandatory when available. The runner only
    packages existing static and scratch-smoke evidence; it does not validate the full production dump,
    production-sized data, real runtime roles, or process-family behavior.
  - Final independent Sol/Opus-class audit remains mandatory on the final diff with task/design docs and
    validation output. Runner success is evidence for the audit, not a substitute for it.

Status:

- P2-D proof package runner added by worker Newton for taskdb `#685`.
- Lead validation passed on 2026-07-12:
  - PASS `node --check docs/_TODO/SAAS_FOUNDATION/scripts/run-p2-d-proof-package.mjs`
  - PASS expected-fail safety check:
    `env DATABASE_URL='postgres://user:secret@127.0.0.1:5432/bcb_webapp_dev' node docs/_TODO/SAAS_FOUNDATION/scripts/run-p2-d-proof-package.mjs --with-scratch-smokes`
    failed before package steps and printed only the database name, not the URL secret.
  - PASS `node docs/_TODO/SAAS_FOUNDATION/scripts/run-p2-d-proof-package.mjs`
  - PASS `node docs/_TODO/SAAS_FOUNDATION/scripts/run-p2-d-proof-package.mjs --with-scratch-smokes`
    on disposable `bcb_saas_*_scratch_*` databases only; no prod/test/dev database touched.
  - PASS `git diff --check`
- Independent Claude Opus audit
  `claude-auditor-p2-d-proof-package-opus-audit-2026-07-12T04-06-02-518Z` verdict:
  PASS WITH RISKS, no P0/P1 blockers, safe to commit.

Residuals:

- The static P2-B/C1/C2/C3 guards run directly and again through `check-saas-db-regression`; this is
  intentionally redundant proof, not a behavior blocker.
- Mixed CLI flags are last-write-wins (`--with-scratch-smokes --mode=static` resolves to static). This errs
  toward less DB activity and is non-blocking; a future cleanup can reject conflicting flags.
- Parent `PGHOST`/`PGUSER` are stripped from child commands but not inspected by the preflight assertion. The
  scratch smokes use local `sudo -n -u postgres psql`, so this is defense-in-depth only.

### P2 closeout composed proof — protected context + RLS + grants + value guards

Status:

- Closeout smoke added: `docs/_TODO/SAAS_FOUNDATION/scripts/smoke-p2-composed-rls-grants-value-guards.mjs`.
- The P2-D scratch package now includes this smoke and `node --check` covers it.
- Claude Opus verifier via `agent-port` (`20260712-080701-verifier`) verdict: PASS WITH RISKS; no
  blocking findings, only low/informational residuals.

Coverage:

- One disposable `bcb_saas_p2_composed_scratch_*` DB and disposable `bcb_saas_*_scratch_*` roles apply
  P2-B, P2-C1/C2/C3, representative P0.5b grants from generator metadata, and generated P0.9 enforce RLS
  policies for representative Phase 2 SCOPED surfaces.
- It proves patient allow/deny behavior across program discussion, support messages, treatment-program
  events, intake history, auth channel preferences, reminders, booking lifecycle, and LFK sessions.
- It also proves critical grant/value intersections: `treatment_program_events.actor_id` remains excluded
  while P2-C1 fills it; `user_channel_preferences.is_preferred_for_auth` is granted only behind P2-C2;
  cancellation/reschedule `notifications_sent` updates work while non-notification columns are denied; and
  payment/soft-delete booking columns remain forbidden to patient role.
- Staff access is proven through role-derived `app.is_staff()` using the disposable staff role, not a GUC.

Residual:

- This is still a representative synthetic-schema composition proof, not a full production schema replay,
  production-sized data rehearsal, or process-family runtime smoke under the eventual cluster-global
  `app_staff` / `app_patient` role names.

## Agent ledger

- Jason: RLS/migration read-only audit. Completed; confirmed helper-based renderer, dormant symmetry,
  FORCE split, guard updates.
- Locke: #664 residual map. Completed; classified all eight targets as P0 pre-flip blockers and mapped
  call paths/fix shapes/tests.
- Franklin: checks/guards worker for helper-based renderer contract. Completed; updated generator
  checks for helper-only generated SQL, no dormant FORCE, and enforce FORCE/raw-context guards.
- Gibbs: independent P2-A audit. Completed; found one P1 P0.9 conditional ownership blocker, fixed
  before commit.
- Kant: post-fix independent P2-A audit. Completed; no blockers. Confirmed P0.9 conditional and
  conditional-chain enforce branches, zero raw `current_setting('app.*')` in generated policy SQL,
  dormant FORCE = 0, enforce FORCE = 223/223, and no uuid/bigint helper mismatches.
- Beauvoir: P2-B implementation brief. Completed read-only; no files changed, no DB touched.
- Sol/Codex CLI auditor: P2-B audit + re-audit. Completed read-only; first pass found NULL
  signature bypass and pgcrypto schema assumption, second pass cleared P2-B after fixes.

## #664 implementation batches

Batch P2-C1 — messaging/discussion/event actor pins:

- `program_item_discussion_messages`: patient insert must pin `sender_role='patient'`,
  `origin='patient_observation'`, `support_message_id IS NULL`.
- `support_conversation_messages`: patient insert must pin `sender_role='user'` and own conversation.
- `treatment_program_events`: patient insert must pin `actor_id=current patient` and whitelist patient
  event shapes.

Status:

- Implemented by CLI worker `codex-worker-p2-c1-patient-value-guards-2026-07-12T02-09-50-992Z`.
- `deploy/postgres/p2-c1-patient-value-guards.sql` adds invoker-mode insert triggers using protected
  context helpers. Invoker-mode is intentional: `app.is_staff()` remains role-derived from the caller,
  not from a SECURITY DEFINER owner role and not from a GUC.
- `apps/webapp/src/infra/repos/pgTreatmentProgramEvents.ts` omits `actor_id` for patient-principal
  inserts; the trigger fills it from `app.current_patient_user_id()`.
- Static guard is wired into `scripts/check-saas-db-regression.mjs`.

Validation:

- PASS `node --check docs/_TODO/SAAS_FOUNDATION/scripts/check-p2-c1-patient-value-guards-sql.mjs`
- PASS `node docs/_TODO/SAAS_FOUNDATION/scripts/check-p2-c1-patient-value-guards-sql.mjs`
- PASS `node --check docs/_TODO/SAAS_FOUNDATION/scripts/smoke-p2-c1-patient-value-guards.mjs`
- PASS `node --check scripts/check-saas-db-regression.mjs`
- PASS `pnpm --dir apps/webapp exec eslint src/infra/repos/pgTreatmentProgramEvents.ts`
- PASS `pnpm --dir apps/webapp run typecheck`
- PASS `node scripts/check-saas-db-regression.mjs`
- PASS `git diff --check`
- PASS `node docs/_TODO/SAAS_FOUNDATION/scripts/smoke-p2-c1-patient-value-guards.mjs` on
  scratch DB `bcb_saas_p2_c1_value_guard_scratch_*`; no prod/test/dev DB touched.

Audit:

- Codex read-only audit `codex-auditor-p2-c1-patient-value-guards-audit-2026-07-12T02-16-38-157Z`:
  PASS WITH RISKS, no blocking findings.
- Residual validation risk: the smoke uses a synthetic schema and broad table grants, so it proves
  trigger behavior but not the exact final P0.5b column-grant + generated-RLS composition end-to-end.
- Residual product/integrity risk: `treatment_program_events` validates patient event shape and owned
  instance but does not yet prove `target_id` belongs to that same owned stage/stage_item. Keep on the
  Phase 2 residual list if event targets become semantically trusted.

Batch P2-C2 — online intake / channel preference / reminder pins:

- `online_intake_status_history`: patient initial history only `NULL -> 'new'`, no `changed_by`/note.
- `user_channel_preferences.is_preferred_for_auth`: re-add narrow valid own-channel write with one preferred
  auth channel invariant.
- `reminder_rules.notification_topic_code`: verify/compute expected topic for patient-created reminders.

Status:

- Implemented by worker agent on `auto/code-pg-delta` (2026-07-12); no commit/push/branch switch.
- `deploy/postgres/p2-c2-patient-value-guards.sql` adds invoker-mode triggers using protected context
  helpers. Invoker-mode is intentional: `app.is_staff()` stays role-derived from the caller.
- `online_intake_status_history` patient INSERT is pinned to owned request/org, `from_status IS NULL`,
  `to_status='new'`, `changed_by IS NULL`, `note IS NULL`, request `status='new'`, and no prior
  history row for that request.
- `user_channel_preferences` patient INSERT/UPDATE is pinned to own row; `is_preferred_for_auth=true`
  is allowed only for `telegram|max|email|sms`; the guard matches `pgChannelPreferences.ts`'s
  canonical `userMatchSql` predicate and rejects a second preferred-auth row across canonical and
  mixed legacy rows.
- `reminder_rules` patient INSERT/UPDATE normalizes `notification_topic_code` from
  `category + linked_object_type + reminder_intent`, matching `notificationTopicCode.ts` semantics.
- P0.5b grants generator/docs regenerated to re-add the guarded OTP preference column and the initial
  intake-history INSERT columns.
- First Codex read-only audit blocked on `user_channel_preferences` ownership predicate drift from
  `userMatchSql`; worker fixed parity and added smoke coverage for mixed legacy rows.
- Sol deep audit (`codex-auditor-p2-c2-sol-final-audit-2026-07-12T02-39-14-045Z`) then blocked on:
  mixed legacy preferred-auth duplicate bypass and repeat initial intake history rows. Worker fixed
  both and lead validation passed again.
- Owner-required final Claude Opus audit completed via `agent-port`:
  `claude-auditor-p2-c2-claude-opus-final-audit-2026-07-12T03-06-09-674Z`.
  Verdict: PASS WITH RISKS, no blocking P0/P1 findings. The audit confirmed all three intents and
  verified the prior blockers were fixed: `user_channel_preferences` ownership predicate parity with
  `pgChannelPreferences.ts`, mixed legacy preferred-auth duplicate rejection, and duplicate/non-new
  intake initial-history rejection.
- Non-blocking audit residuals: PostgreSQL `btrim` vs JS `.trim()` whitespace parity for
  `reminder_intent`; trigger `EXISTS` checks depend on final RLS visibility/concurrency assumptions;
  current smoke proves trigger behavior on a synthetic scratch schema rather than full generated
  P0.5b grants + RLS composition; `reminder_rules.integrator_user_id` is not cross-validated when
  `platform_user_id` matches the patient.

Validation evidence:

- Static guard: `docs/_TODO/SAAS_FOUNDATION/scripts/check-p2-c2-patient-value-guards-sql.mjs` wired
  into `scripts/check-saas-db-regression.mjs`.
- Scratch-only smoke: `docs/_TODO/SAAS_FOUNDATION/scripts/smoke-p2-c2-patient-value-guards.mjs`
  creates and drops only `bcb_saas_p2_c2_value_guard_scratch_*`.
- Lead validation after latest worker fix passed:
  `node --check docs/_TODO/SAAS_FOUNDATION/scripts/check-p2-c2-patient-value-guards-sql.mjs`,
  `node docs/_TODO/SAAS_FOUNDATION/scripts/check-p2-c2-patient-value-guards-sql.mjs`,
  `node --check docs/_TODO/SAAS_FOUNDATION/scripts/smoke-p2-c2-patient-value-guards.mjs`,
  `git diff --check`,
  `node docs/_TODO/SAAS_FOUNDATION/scripts/smoke-p2-c2-patient-value-guards.mjs`, and
  `node scripts/check-saas-db-regression.mjs`.

Batch P2-C3 — booking lifecycle and LFK org stamp:

- `be_appointment_*` and `be_appointments`: patient lifecycle value pins and appointment transition guard.
- `lfk_sessions.organization_id`: stamp/verify org from current context or parent, deny NULL/mismatch.

Status:

- Implemented by Codex worker on `auto/code-pg-delta` (2026-07-12); no commit/push/branch switch.
- `deploy/postgres/p2-c3-patient-booking-lfk-guards.sql` adds invoker-mode patient-context triggers
  using P2-B helpers. Invoker-mode is intentional: `app.is_staff()` remains role-derived and staff
  sessions with a patient context bypass the patient guards.
- `be_appointments` patient INSERT is pinned to current org/patient, `source IN ('native',
'public_widget')`, `status IN ('confirmed', 'awaiting_payment')`, `original_start_at=start_at`,
  `reschedule_count=0`, and no payment/package/soft-delete fields.
- `be_appointments` patient UPDATE allows only the current patient lifecycle shapes: cancel to
  `cancelled_by_patient|late_cancellation`, the first reschedule step to `rescheduled`, and the second
  reschedule step back to `confirmed` with slot/location/service/original-start/count fields. Payment,
  package, and soft-delete fields are immutable for patient context.
- `be_appointment_cancellations` / `be_appointment_reschedules` patient INSERTs are pinned to owned
  appointment/org, `actor_type='patient'`, `actor_id=current patient`, `staff_comment IS NULL`, and
  `manual_override=false`. Policy-derived booleans/snapshots remain app-derived residual inputs.
- Active notification patch call paths were reconciled with P0.5b: app_patient now gets exactly
  `UPDATE(notifications_sent)` on cancellation/reschedule rows, and P2-C3 rejects any patient UPDATE
  except owned latest-row notification patch shape.
- `be_appointment_events` / `be_appointment_history_events` patient INSERTs are pinned to owned
  appointment/org, `actor_id=current patient`, and event types `created|cancelled|rescheduled`, so
  booking creation events are preserved.
- `lfk_sessions` patient INSERT/UPDATE stamps `organization_id` from `app.current_org_id()` when null,
  verifies current org, verifies `user_id=current patient`, and verifies the parent `lfk_complexes`
  row using the same platform-or-legacy ownership predicate as `pgLfkDiary.ts`.
- P0.5b generator/materialized grants/docs/smoke were updated for the narrow
  cancellation/reschedule `notifications_sent` UPDATE grant.
- Independent Claude Opus audit
  `claude-auditor-p2-c3-claude-opus-audit-2026-07-12T03-32-19-874Z` verdict: PASS WITH RISKS,
  no blockers. Risk #1 closed before commit by revoking PUBLIC EXECUTE on all C3 helper/trigger
  functions and explicitly granting EXECUTE to `app_staff`/`app_patient` (or scratch override roles via
  `p2_c3_staff_role` / `p2_c3_patient_role`). Functions remain `SECURITY INVOKER`; no
  `SECURITY DEFINER` was introduced.
- Follow-up Claude Opus audit
  `claude-auditor-p2-c3-claude-opus-followup-audit-2026-07-12T03-43-43-378Z` verdict: PASS.
  It confirmed the execute-grant risk is closed and no new blockers were introduced.

Validation:

- PASS `node --check docs/_TODO/SAAS_FOUNDATION/scripts/check-p2-c3-patient-booking-lfk-guards-sql.mjs`
- PASS `node docs/_TODO/SAAS_FOUNDATION/scripts/check-p2-c3-patient-booking-lfk-guards-sql.mjs`
- PASS `node --check docs/_TODO/SAAS_FOUNDATION/scripts/smoke-p2-c3-patient-booking-lfk-guards.mjs`
- PASS `node docs/_TODO/SAAS_FOUNDATION/scripts/smoke-p2-c3-patient-booking-lfk-guards.mjs` on
  scratch DB `bcb_saas_p2_c3_booking_lfk_scratch_*`; no prod/test/dev DB touched. The smoke now also
  proves C3 functions have no PUBLIC EXECUTE and do have explicit EXECUTE for the disposable
  app-staff/app-patient roles.
- PASS `node --check docs/_TODO/SAAS_FOUNDATION/scripts/p0-5b-grants-sql.mjs`
- PASS `node --check docs/_TODO/SAAS_FOUNDATION/scripts/smoke-p0-5b-grants.mjs`
- PASS `node docs/_TODO/SAAS_FOUNDATION/scripts/smoke-p0-5b-grants.mjs` on scratch DB
  `bcb_saas_p0_5b_grants_scratch_*`.
- PASS `git diff --check`
- PASS `node scripts/check-saas-db-regression.mjs`

Residuals:

- Cancellation/reschedule policy-derived booleans and policy snapshots are not recomputed in the DB
  trigger; the guard verifies patient ownership and actor/staff/manual pins, while trusting the
  existing service policy calculation.
- The C3 smoke uses a synthetic schema and broad table grants, so it proves trigger behavior but not
  the exact final generated RLS + P0.5b grant composition end-to-end.

### P2 execute ACL symmetry hardening

Status:

- Worker hardening slice on `auto/code-pg-delta` (2026-07-12); no commit/push and no prod/test/dev DB
  touched.
- P2-B now revokes PUBLIC EXECUTE on the signed setter and helper functions after creation, while
  keeping explicit EXECUTE grants to the supplied `p2_b_staff_role` / `p2_b_patient_role`. The setter
  remains the existing `SECURITY DEFINER` function; helper modes are unchanged.
- P2-C1 and P2-C2 now mirror the C3 grant style: `p2_c1_*` / `p2_c2_*` staff/patient role variables
  default to `app_staff` / `app_patient`, role existence is checked, PUBLIC EXECUTE is revoked for all
  helper/trigger functions, and EXECUTE is granted only to the explicit app roles or scratch override
  roles. All functions remain `SECURITY INVOKER`; no new `SECURITY DEFINER` was introduced.
- Static checks and scratch smokes now assert the no-PUBLIC + explicit-role EXECUTE contract for P2-B,
  P2-C1, and P2-C2.
- Independent Claude Opus audit
  `claude-auditor-p2-execute-acl-symmetry-opus-audit-2026-07-12T03-53-23-644Z` verdict:
  PASS WITH RISKS, no blockers. The audit confirmed execute-ACL symmetry is closed across P2-B/C1/C2.

Validation:

- PASS `node --check docs/_TODO/SAAS_FOUNDATION/scripts/check-p2-b-protected-context-sql.mjs`
- PASS `node docs/_TODO/SAAS_FOUNDATION/scripts/check-p2-b-protected-context-sql.mjs`
- PASS `node --check docs/_TODO/SAAS_FOUNDATION/scripts/check-p2-c1-patient-value-guards-sql.mjs`
- PASS `node docs/_TODO/SAAS_FOUNDATION/scripts/check-p2-c1-patient-value-guards-sql.mjs`
- PASS `node --check docs/_TODO/SAAS_FOUNDATION/scripts/check-p2-c2-patient-value-guards-sql.mjs`
- PASS `node docs/_TODO/SAAS_FOUNDATION/scripts/check-p2-c2-patient-value-guards-sql.mjs`
- PASS `node --check docs/_TODO/SAAS_FOUNDATION/scripts/smoke-p2-b-protected-context.mjs`
- PASS `node --check docs/_TODO/SAAS_FOUNDATION/scripts/smoke-p2-c1-patient-value-guards.mjs`
- PASS `node --check docs/_TODO/SAAS_FOUNDATION/scripts/smoke-p2-c2-patient-value-guards.mjs`
- PASS `node docs/_TODO/SAAS_FOUNDATION/scripts/smoke-p2-b-protected-context.mjs` on scratch DB
  `bcb_saas_p2_b_context_scratch_*`.
- PASS `node docs/_TODO/SAAS_FOUNDATION/scripts/smoke-p2-c1-patient-value-guards.mjs` on scratch DB
  `bcb_saas_p2_c1_value_guard_scratch_*`.
- PASS `node docs/_TODO/SAAS_FOUNDATION/scripts/smoke-p2-c2-patient-value-guards.mjs` on scratch DB
  `bcb_saas_p2_c2_value_guard_scratch_*`.
- PASS `node --check scripts/check-saas-db-regression.mjs`
- PASS `node scripts/check-saas-db-regression.mjs`
- PASS `git diff --check`

Residuals:

- Deploy gate: before applying these artifacts to a real database, confirm the locked-mode connection
  role is `app_staff` / `app_patient` or a member of one of those roles; otherwise
  `app.install_signed_context(...)` will fail after PUBLIC EXECUTE is revoked.
- Deploy ordering: role provisioning must run before P2-B/C1/C2/C3 artifacts because the scripts now
  fail closed when the configured app roles are absent.
- The smokes prove ACLs and trigger behavior on synthetic scratch schemas, not the final generated
  P0.5b grant + RLS composition end-to-end.
