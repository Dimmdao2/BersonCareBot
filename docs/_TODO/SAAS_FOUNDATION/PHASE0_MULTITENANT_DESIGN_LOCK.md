> RE-VERIFIED 2026-07-23 (all [x] audited vs code): see docs/\_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/PRODUCTION_READINESS_LEDGER_2026-07-23.md

# Phase 0 design-lock — multitenant TEST enforcement

> **ИСТОРИЧЕСКИЙ DESIGN EVIDENCE; TOPOLOGY ЗАМЕНЕНА 12.08.2026.** Старые staff/nonstaff pool и bootstrap
> решения ниже сохраняются как provenance, но target topology задаёт `DB_PRIVILEGE_LAYER_REBUILD/SCHEME.md`
> revision 11: два software ports, четыре runtime DB-login, отдельный global-admin certificate/pool и exact
> transaction context.

Status: Phase 0 design-lock delivered 2026-07-12 after branch sync. Scope: design-lock only; no Phase 1+
code until the owner confirms the Phase 1 direction recorded at the end of this file.

> **Checkbox marking 2026-07-27, corrected 2026-07-29.** Was: 3 open `- [ ]` boxes in the Exit Checklist
> counted as unstarted design-lock work. None had an owner cancellation: two completed design-lock facts are
> `[x]` with anchored evidence below; the unresolved spoofing-proof item remains `[ ]`.

Branch baseline:

- `auto/code-pg-delta` = `db819434fc10073b0fe95af80a54adfd020653ae`
- `origin/feat/doctor-ui-rebuild` = same commit after sync
- `origin/auto/code-pg-delta` = same commit after sync

Owner decisions:

- Start model keeps one doctor and one admin as separate `platform_users`.
- **Superseded owner attribution (2026-07-15):** this document previously presented “do not collapse
  `admin = doctor`” as the owner's decision. It was not. An organization administrator may also be a doctor;
  the interface may use an organization-settings tab, cabinet switching, or tabs on one page. See
  `OWNER_RULINGS_2026-07-15.md:142-151`.
- `#670` auth/UI/OTP rework is a separate product track and does not block this isolation work.

## Initial Audit Synthesis

Read-only audits completed on 2026-07-12:

- Security/locked labels: Nash (`gpt-5.5`, high reasoning).
- DB access surface: Ampere (`gpt-5.4`, high reasoning).
- RLS/migration/#664 TEST-enforcement design: Kuhn (`gpt-5.4`, high reasoning).

Accepted findings:

- `app.is_staff()` should remain DB-role-derived through `app_staff` membership. Do not reintroduce
  staff bypass as `app.actor`, `app.is_staff`, or any other settable GUC.
- `app.patient_user_id` and `app.integrator_user_id` are not runtime principal labels today and would be
  spoofable if implemented as plain custom GUCs.
- A SECURITY DEFINER setter is not sufficient if `app_patient` can call it with arbitrary victim IDs.
- `GRANT SET ON PARAMETER` is useful only if direct `SET app.*` / `set_config('app.*')` is denied to the
  business runtime roles and proven on the target PostgreSQL version.
- Per-checkout setup/reset is required for coverage; transaction-only setup misses plain
  `getPool()` / `getDrizzle()` / `DbPort.query` paths.
- `FORCE ROW LEVEL SECURITY` is already present in the dormant migration chain, not reserved for a final
  TEST-enforcement migration. Committed SQL has 160 org/hybrid FORCE statements and 210 patient-side FORCE
  statements.
- The current patient wall is not dormant-symmetric: unset patient context denies the patient branch.
- `#664` is not a GRANT-only cleanup. It needs `WITH CHECK`, triggers, or repo splits for value-level
  risks listed in `P0_5B_GRANTS.md`.

Scratch proofs completed on local disposable PostgreSQL 16.14:

- `REVOKE SET ON PARAMETER "app.patient_user_id" FROM PUBLIC` does **not** stop a real non-superuser
  login role from running `SET app.patient_user_id = ...`.
- Even after creating `pg_parameter_acl` with explicit `GRANT SET ON PARAMETER "app.patient_user_id"` only
  for a marker role, an unrelated real non-superuser login role can still run `SET app.patient_user_id`.
- `pg_parameter_acl` was cleaned after the proof; no `bcb_phase0_%` scratch roles/databases remain.
- A protected `app.principal_context` table plus SECURITY DEFINER setter with HMAC verification
  (`pgcrypto` installed in a pinned `app_ext` schema) works as a DB-enforced context mechanism in scratch:
  `app_patient` cannot read/write the context table, cannot install a victim identity with a bad/replayed
  signature, and can install only a payload with a matching trusted signature.
- Caveat: if a victim signature leaks, the setter can install that victim payload. A target-environment design must
  keep the signing secret outside patient-visible SQL/logs, include short TTL/backend binding, and clear
  context on release.

Missing TEST-enforcement blockers now tracked here:

- Process-family smoke under real app roles after B4-fanout.
- Cluster-global role naming / TEST-environment boundary for `app_staff` and `app_patient`.

## Goal

Return a concrete implementation decision before Phase 1:

1. Which locked-label mechanism will be used for `app.org`, patient identity, and staff/non-staff context.
2. Which DB access surfaces must be centralized or explicitly exempted.
3. Which migrations/RLS/grants/value checks must change before enforce.
4. Exact file list, validation plan, and effort estimate for Phases 1-4.

## Non-goals

- No database writes outside the declared disposable proof or authorized TEST task.
- No deploy.
- No `main`/`test` merge or push.
- No Phase 1 implementation hidden inside discovery.
- No broad auth redesign from `#670`.

## Workstreams

### A. Locked Labels

Owner: security audit agent + orchestrator review.

Questions:

- Can custom GUCs be made non-spoofable in the current Postgres/runtime model?
- Preferred mechanism: `GRANT SET ON PARAMETER`, SECURITY DEFINER setter, pinned checkout client, DB-role identity, or a hybrid.
- How do we prove an `app_patient` session cannot change `app.org` or impersonate another `app.patient_user_id`?
- How do we keep `app.is_staff()` as DB-role membership while exposing a single app-side principal abstraction?

Exit evidence:

- Scratch DB proof for patient session cannot set/override protected labels.
- Scratch DB proof for trusted runtime path can set labels and RLS sees them.
- Written failure mode for SQL injection / arbitrary SQL in app_patient context.
- Scratch DB proof that direct `SET app.org`, `SET app.patient_user_id`, `SET app.integrator_user_id`, and
  `set_config(...)` are denied for `app_patient`.
- Scratch DB proof that pooled client reuse does not leak labels across normal return, throw, rollback, or
  release paths.

Current decision direction:

- Reject `GRANT SET ON PARAMETER` as the sole lock for custom `app.*` labels.
- Reject raw custom GUCs as the trusted source of patient/integrator identity.
- Prefer helper functions such as `app.current_org_id()` / `app.current_patient_user_id()` reading a
  protected backend-context table written only through a signed SECURITY DEFINER setter.
- Keep `app.is_staff()` role-derived.
- Phase 1 must prove the hardened version with TTL/backend binding and release cleanup before any
  policy renderer is switched from raw `current_setting('app.*')` to helper functions.

### B. DB Access Surface

Owner: DB surface census agent + orchestrator review.

Questions:

- Where are labels applied now: transaction-only vs per-checkout.
- Which `getPool()`, `getDrizzle()`, `runWebappPgText`, integrator `DbPort.query`, scheduler, worker, and media-worker paths bypass labels.
- Which surfaces are centralizable, and which need per-job/per-row principals.
- What static guard should fail when SCOPED access has no principal in enforce-mode.

Exit evidence:

- Current count and file list, derived from `T0_DB_ACCESS_SURFACE.md` plus code.
- A finite list of non-centralizable entrypoints with planned principal source.
- Proposed static gate additions.

Current confirmed surface:

- `getPool(` runtime files: 74.
- `getDrizzle(` runtime files: 86.
- `runWebappPgText` current T0 count: 66.
- Route files with DB signals: 27.
- Server action entrypoints: 28.
- Core issue unchanged from `T0_DB_ACCESS_SURFACE.md`: labels apply only on transaction paths today.

### C. RLS / Migration / #664 TEST enforcement

Owner: migration/RLS audit agent + orchestrator review.

Questions:

- Current ORG wall state in 0160-0168.
- Current PATIENT wall state in 0169-0175, including dormant symmetry gaps.
- Exact `FORCE ROW LEVEL SECURITY` placement and what must move to final TEST-enforcement migration.
- Which `P0_5B_GRANTS.md` value-level residuals must become `WITH CHECK`, triggers, or repo splits before enforce.

Exit evidence:

- List of migrations/docs/scripts to edit in Phase 1/2.
- Explicit TEST-enforcement blocker list.
- Confirmation that `DORMANT_DEPLOY_TEST_RUNBOOK.md` "Why safe" is corrected or queued.

Current TEST-enforcement blockers:

- Remove or neutralize `FORCE ROW LEVEL SECURITY` from dormant deploy path until final TEST enforcement.
- Re-render patient wall with dormant symmetry or prove an equivalent compatibility mode.
- Close `P0_5B_GRANTS.md` value-level residuals:
  appointment lifecycle rows, `program_item_discussion_messages`, `support_conversation_messages`,
  `be_appointments`, `lfk_sessions.organization_id`, `reminder_rules.notification_topic_code`,
  `user_channel_preferences.is_preferred_for_auth`, and `online_intake_status_history`.
- Treat the full `P0_5B_GRANTS.md` "Flagged for extra review" section as B4-fanout triage scope, not only
  the value-level residuals above: `org_enrollments`, `comments`, `system_settings`,
  `user_channel_bindings` / `platform_user_contacts` / `user_phone_history`, and the payment/package family
  are all pre-flip smoke targets.

### D. Provisioning Scope

Owner: orchestrator after A-C are understood.

Questions:

- Minimum `OrganizationProvisioningService` write ports and files.
- How to create org, specialist, owner membership, and doctor session without creating `org_enrollments` for the owner.
- How to keep first-clinic doctor/admin split compatible.

Exit evidence:

- File list and API/UI scope only; implementation waits until labels/RLS design is locked.

## Validation Strategy

Use targeted tests during small slices. Use full CI only after branch sync, after major integration blocks, and before any deploy/merge checkpoint.

If full CI fails:

- Fix the failing step first.
- Re-run the failing step or narrower test.
- Then use `ci:resume:*` from the repaired point.
- Do not restart full CI from zero on every iteration.

Required Phase 0 validation:

- `pnpm install --frozen-lockfile && pnpm run ci` already passed on the synced baseline.
- Read-only audits must not start by running full CI; they start with diff/source analysis.
- Any scratch DB proof must use a disposable DB only and must print no PII.

## Phase Plan And Estimate

Phase 1 — locked labels + all scoped access labeled: 4-6 focused days.

Likely files:

- `packages/db-principal/src/index.ts`
- `apps/webapp/src/infra/db/withClient.ts`
- `apps/webapp/src/app-layer/db/drizzle.ts`
- `apps/webapp/src/infra/db/runWebappSql.ts`
- `apps/integrator/src/infra/db/client.ts`
- `apps/integrator/src/infra/db/withClient.ts`
- `apps/integrator/src/infra/db/runIntegratorSql.ts`
- `apps/media-worker/src/withClient.ts`
- `apps/media-worker/src/runMediaWorkerSql.ts`
- `docs/_TODO/SAAS_FOUNDATION/scripts/rls-sql-renderer.mjs`
- `docs/_TODO/SAAS_FOUNDATION/scripts/check-t0-db-access-surface.mjs`
- `scripts/check-db-chokepoint.mjs`
- new scratch/proof smoke scripts under `docs/_TODO/SAAS_FOUNDATION/scripts/`
- a new migration/ops SQL for `app.current_*()` helper functions, protected context table, and signed setter.

Expected work:

- Introduce full principal carrier: staff/org, patient/org/platform user, integrator user, bootstrap/infra.
- Set/clear principal per checkout, not only per transaction.
- Replace raw policy reads of trusted identity with helper functions backed by protected context.
- Keep `app.is_staff()` role-derived.
- Add static gates for runtime `SET app.*` and unlabeled scoped DB access.

Phase 2 — enforce-ready RLS + `#664`: 4-6 focused days.

Likely files:

- `docs/_TODO/SAAS_FOUNDATION/scripts/rls-sql-renderer.mjs`
- `docs/_TODO/SAAS_FOUNDATION/scripts/rls-descriptor-model.mjs`
- migrations `0160-0175` replacement/follow-up strategy or final TEST-enforcement migrations
- `deploy/postgres/p0-5b-grants.sql`
- `docs/_TODO/SAAS_FOUNDATION/P0_5B_GRANTS.md`
- booking lifecycle repos/services
- program discussion repo/service
- support conversation repo/service
- reminder rules and LFK session write paths.

Residual mapping:

- Appointment lifecycle tables: repo split or trigger/WITH CHECK pinning patient actor fields,
  `manual_override=false`, no staff comments/financial flags from patient role.
- `program_item_discussion_messages`: trigger/WITH CHECK pin `sender_role='patient'` and
  `origin='patient_observation'` for patient role.
- `support_conversation_messages`: trigger/WITH CHECK pin patient sender role.
- `be_appointments`: transition trigger/service split for patient cancel/reschedule only; no arbitrary
  status/specialist/branch reassignment.
- `lfk_sessions.organization_id`: set from protected org context or scoped parent, not nullable accident.
- `reminder_rules.notification_topic_code`: trace confirmed patient write or narrow values.
- `user_channel_preferences.is_preferred_for_auth`: re-add safely through a dedicated checked path or trigger.
- `online_intake_status_history`: add missing patient INSERT shape for the confirmed intake flow.

Extra-review mapping:

- `org_enrollments`: keep SELECT-only unless a traced patient-session insert path is proven; if re-added,
  exclude authorization/status forgery.
- `comments`: keep SELECT-only until a real patient route exists; future patient writes need column
  restriction and `author_id=self` / `comment_type='individual_override'`.
- `system_settings`: likely SELECT-only if patient branding/feature reads need it; never app_patient write.
- `user_channel_bindings`, `platform_user_contacts`, `user_phone_history`: keep SELECT-only until a confirmed
  patient self-service write flow is traced.
- Payment/package family: keep as B4-fanout smoke target. If patient-initiated payment flows write these
  rows, add narrow write grants plus value checks before flip.

Phase 3 — specialist self-registration/provisioning: 2-3 focused days.

Likely files:

- `apps/webapp/src/infra/repos/pgBookingEngine.ts`
- `apps/webapp/src/infra/repos/pgOrganizationMembership.ts`
- `apps/webapp/src/modules/organization-membership/ports.ts`
- auth email-password register/confirm routes and service layer
- new `OrganizationProvisioningService` module or app-layer service
- minimal signup UI/API for specialist intent.

Expected work:

- Add `createOrganization(freshUuid, title)` instead of reusing default-org upsert semantics.
- Add membership write port.
- Create `be_specialists` and active owner membership with `specialist_id`.
- Do not create `org_enrollments` for the owner.
- Update seed/provisioning assumptions for separate doctor/admin users.

Phase 4 — TEST enforcement: 2-3 focused days plus an owner-authorized TEST window.

Likely files:

- `deploy/HOST_DEPLOY_README.md`
- `docs/_TODO/SAAS_FOUNDATION/DORMANT_DEPLOY_TEST_RUNBOOK.md`
- new flip runbook
- migration/deploy scripts for NO FORCE / FORCE TEST enforcement
- smoke scripts for process-family real-role runs.

Required gates:

- Fresh disposable dump-copy validation.
- 2-org + 2-patient deny/allow smoke.
- Process-family smoke under real `app_staff`/`app_patient` roles.
- 0 missing-principal shadow entries.
- 0 permission errors across doctor, patient, integrator, scheduler, queue, media, pre-auth.
- Rollback: disable signup, revert FORCE/role wiring, restart.

Total estimate: 12-18 focused person-days, consistent with the original owner-facing estimate. The first
useful milestone is Phase 1 proof package and all scoped DB access labeled; that is the part that should
not be diluted by UI work.

## Exit Checklist

- [x] Locked-label direction chosen: protected backend-context table + signed SECURITY DEFINER setter +
      helper functions; raw custom GUCs rejected as trusted identity.
- [x] Initial spoofing proofs run for custom GUC ACL and signed backend-context setter.
- [x] Hardened locked-label implementation designed with TTL/backend binding/release cleanup. — `packages/db-principal/src/index.ts` §`installSignedDbPrincipalContext` / `releaseSignedDbPrincipal` — «const backendPid = await readBackendPid(client);», «signer.ttlMs ?? 30_000», «SELECT app.release_principal_context()»; `SAAS_ENFORCE_ROADMAP.md` §Phase C1 — «On release, always release protected context and `RESET ROLE`; poison/destroy the client if cleanup fails.»
- [ ] Remaining spoofing proofs defined and assigned.
- [x] DB access surface refreshed from current branch.
- [x] Non-centralizable entrypoints listed with principal source.
- [x] ORG/PATIENT wall migration risks listed.
- [x] #664 value-level residuals and extra-review tails mapped to concrete enforcement/triage mechanism.
- [x] First doctor/admin split reflected in seed/provisioning plan.
- [x] Process-family smoke under real app roles planned.
- [x] Cluster-global role naming/env-boundary decision recorded. — `SAAS_C0_LOCKED_TOPOLOGY_ADR.md` §Decision — «Use two runtime login roles and two pools:»; «`app_runtime_staff_login LOGIN NOINHERIT NOBYPASSRLS`»; «`app_runtime_nonstaff_login LOGIN NOINHERIT NOBYPASSRLS`».
- [x] Phase 1-4 file list and effort estimate written.
- [x] Independent read-only audits completed on the Phase 0 inputs.
- [x] Independent audit completed on the Phase 0 conclusion.
- [x] Owner receives Phase 0 result before Phase 1+ coding starts.

## Exit Note

Phase 0 is complete as a design-lock package. It deliberately does **not** implement Phase 1 runtime
wiring.

Ready for owner decision:

- Proceed with protected backend-context table + signed SECURITY DEFINER setter + helper functions for
  trusted org/patient/integrator identity.
- Keep `app.is_staff()` role-derived via fixed `app_staff` membership.
- Decide cluster-global naming/env boundary for fixed `app_staff` / `app_patient` roles before wiring real
  runtime credentials.

Open Phase 1 proof work, not Phase 0 discovery:

- Hardened locked-label implementation with TTL/backend binding/release cleanup.
- Remaining spoofing proofs against the hardened implementation.
- Process-family smoke under real app roles after B4-fanout.
