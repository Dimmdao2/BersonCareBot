# Phase 0 design-lock — multitenant flip

Status: started 2026-07-12 after branch sync. Scope: design-lock only; no Phase 1+ code until this file has a reviewed exit note.

Branch baseline:
- `auto/code-pg-delta` = `db819434fc10073b0fe95af80a54adfd020653ae`
- `origin/feat/doctor-ui-rebuild` = same commit after sync
- `origin/auto/code-pg-delta` = same commit after sync

Owner decisions:
- Start model keeps one doctor and one admin as separate `platform_users`.
- Do not collapse `admin = doctor`.
- `#670` auth/UI/OTP rework is a separate product track and does not block this isolation cutover.

## Initial Audit Synthesis

Read-only audits completed on 2026-07-12:
- Security/locked labels: Nash (`gpt-5.5`, high reasoning).
- DB access surface: Ampere (`gpt-5.4`, high reasoning).
- RLS/migration/#664 cutover: Kuhn (`gpt-5.4`, high reasoning).

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
  cutover migration. Committed SQL has 160 org/hybrid FORCE statements and 204 patient-side FORCE
  statements.
- The current patient wall is not dormant-symmetric: unset patient context denies the patient branch.
- `#664` is not a GRANT-only cleanup. It needs `WITH CHECK`, triggers, or repo splits for value-level
  risks listed in `P0_5B_GRANTS.md`.

Missing cutover blockers now tracked here:
- Process-family smoke under real app roles after B4-fanout.
- Cluster-global role naming / environment-boundary decision for `app_staff` and `app_patient` if dev and
  prod share one PostgreSQL cluster.

## Goal

Return a concrete implementation decision before Phase 1:

1. Which locked-label mechanism will be used for `app.org`, patient identity, and staff/non-staff context.
2. Which DB access surfaces must be centralized or explicitly exempted.
3. Which migrations/RLS/grants/value checks must change before enforce.
4. Exact file list, validation plan, and effort estimate for Phases 1-4.

## Non-goals

- No prod/test DB writes.
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

### C. RLS / Migration / #664 Cutover

Owner: migration/RLS audit agent + orchestrator review.

Questions:
- Current ORG wall state in 0160-0168.
- Current PATIENT wall state in 0169-0175, including dormant symmetry gaps.
- Exact `FORCE ROW LEVEL SECURITY` placement and what must move to final cutover migration.
- Which `P0_5B_GRANTS.md` value-level residuals must become `WITH CHECK`, triggers, or repo splits before enforce.

Exit evidence:
- List of migrations/docs/scripts to edit in Phase 1/2.
- Explicit cutover blocker list.
- Confirmation that `DORMANT_DEPLOY_TEST_RUNBOOK.md` "Why safe" is corrected or queued.

Current cutover blockers:
- Remove or neutralize `FORCE ROW LEVEL SECURITY` from dormant deploy path until final cutover.
- Re-render patient wall with dormant symmetry or prove an equivalent compatibility mode.
- Close `P0_5B_GRANTS.md` value-level residuals:
  appointment lifecycle rows, `program_item_discussion_messages`, `support_conversation_messages`,
  `be_appointments`, `lfk_sessions.organization_id`, `reminder_rules.notification_topic_code`,
  `user_channel_preferences.is_preferred_for_auth`, and `online_intake_status_history`.

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

## Exit Checklist

- [ ] Locked-label mechanism chosen and justified.
- [ ] Spoofing proofs defined and assigned.
- [x] DB access surface refreshed from current branch.
- [ ] Non-centralizable entrypoints listed with principal source.
- [x] ORG/PATIENT wall migration risks listed.
- [ ] #664 value-level residuals mapped to concrete enforcement mechanism.
- [ ] First doctor/admin split reflected in seed/provisioning plan.
- [ ] Process-family smoke under real app roles planned.
- [ ] Cluster-global role naming/env-boundary decision recorded.
- [ ] Phase 1-4 file list and effort estimate written.
- [x] Independent read-only audits completed on the Phase 0 inputs.
- [ ] Independent audit completed on the Phase 0 conclusion.
- [ ] Owner receives Phase 0 result before Phase 1+ coding starts.
