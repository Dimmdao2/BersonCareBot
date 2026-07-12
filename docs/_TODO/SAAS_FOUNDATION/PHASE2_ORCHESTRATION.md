# Phase 2 orchestration — enforce-ready RLS + #664

Status: in progress, started 2026-07-12 by owner command.

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
- Targeted node checks for renderer/generators/guards.
- `pnpm run check:saas-db-regression`.
- Scratch smoke for helper-based enforce/dormant behavior.
- Disposable prod-dump copy rehearsal when available; never prod/test/dev.
- Independent Sol/Opus-class audit on final diff with task/design docs and validation output.

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

Batch P2-C3 — booking lifecycle and LFK org stamp:
- `be_appointment_*` and `be_appointments`: patient lifecycle value pins and appointment transition guard.
- `lfk_sessions.organization_id`: stamp/verify org from current context or parent, deny NULL/mismatch.
