# TASK A — Tighten PII bootstrap-hybrid tables (plan + checklist)

> Single source of "done" for this task (owner rule #2). Every item `- [ ]/[x]` with an evidence link.
> Canon model: `TENANT_WALLS_AND_ACCESS_MODEL.md`. Spec: `HANDOFF_2026-07-12.md` §"TASK A". Task: taskdb #708.
> Branch `auto/code-pg-delta`. NOT pushed to main/test. Validation ONLY on disposable `bcb_saas_*_rehearsal_*`.

## Problem (the hole)
`public.platform_user_contacts` and `public.user_phone_history` are `scopingKind: bootstrap_hybrid`
(`rls-descriptor-model.mjs:34-40`). Their RLS predicate
(`renderBootstrapHybridPredicate`, `rls-sql-renderer.mjs:491-495`) is:
```
("organization_id" IS NULL OR (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))
```
The leading unqualified `"organization_id" IS NULL` makes every NULL-org row readable by ANY session
(incl. any clinic's staff). That is the leak to close at enforce. The other 3 hybrid tables
(`system_settings`, `system_settings_audit`, `integrator.system_settings`) legitimately keep global-NULL
(platform defaults) — DO NOT change them.

## Target predicate (strict) — BOTH PII tables, surgical single change
```
(app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())
OR
("organization_id" IS NULL
   AND app.current_org_id() IS NULL
   AND app.current_patient_user_id() IS NULL
   AND app.current_integrator_user_id() IS NULL
   AND NOT app.is_staff())
```
- Closes hole: staff of clinic A (current_org_id=A) never matches the NULL branch → no global NULL read.
- Keeps integrator write of phone_history (org-match branch has NO `is_staff()` gate; patient never carries org, so no exploit).
- Keeps bootstrap read/write of genuine NULL rows (OTP/messenger/public-booking run under context-less bootstrap principal → matches the 2nd branch).
- DORMANT wrap = `((dormantCompatibilityPredicate) OR strict)` (the SCOPED path, NOT the bootstrap_hybrid short-circuit) so legacy `legacy-guc` clinic #1 still sees ALL rows → **not blocked**.

## Three traps the implementation MUST respect
1. **Dormant trap:** these 2 tables must flow through the general dormant path
   (`renderPhase4DormantCompatPredicate` line ~90 → `((dormantCompat) OR strict)`), NOT the
   `scopingKind === "bootstrap_hybrid"` short-circuit at `phase4-locked-policy-artifact.mjs:86-88`.
   Otherwise backfilled rows become invisible in the default legacy-guc mode and clinic #1 breaks.
2. **Integrator write:** `pgUserProjection.updatePhone` (source=projection) closes prior interval via UPDATE;
   integrator is NOT staff → org-match branch must NOT require `is_staff()`.
3. **Bootstrap write:** OTP (`pgUserByPhone.createOrBind`), messenger (`pgPhoneMessengerBind`), public booking
   (`upsertBookingFormContactsBestEffort`) run under context-less bootstrap principal → they write NULL-org rows
   → the NULL branch (gated to bootstrap) must remain so those writes pass WITH CHECK.

## Checklist

### 1. Drizzle schema + migration
- [ ] Add `organizationId: uuid("organization_id")` (nullable) + `idx_*_organization_id` + idempotent FK to
      `be_organizations(id) ON DELETE CASCADE` to `platform_user_contacts` (`apps/webapp/db/schema/platformUserContacts.ts`).
- [ ] Same for `user_phone_history` (`apps/webapp/db/schema/schema.ts:130`).
- [ ] New migration `apps/webapp/db/drizzle-migrations/0178_*.sql` (template: `0151_*`): ADD COLUMN IF NOT EXISTS,
      index, idempotent FK, backfill, journal entry `meta/_journal.json` (idx 178, `when` strictly > 177's).
- [ ] Backfill (idiom from 0151/0152): single active org via
      `org_enrollments WHERE status='active' GROUP BY platform_user_id HAVING count(DISTINCT organization_id)=1`
      (optionally UNION `be_organization_members` active). Stamp that org where unambiguous.
      Leave NULL for genuine pre-auth (0 or multi enrollment) rows — do NOT COALESCE-to-default (unlike message_log),
      because the gated-NULL branch depends on real bootstrap rows staying NULL. Add a post-backfill NOTICE (not
      EXCEPTION) reporting residual NULL count per table.

### 2. Repos stamp organization_id
- [ ] `pgPlatformUserContacts.upsertContact`: stamp `organization_id` from `getCurrentDbPrincipalOrganizationId()`
      (`@bersoncare/db-principal`) — set for doctor/admin; `undefined` (→ NULL) for booking/bootstrap.
- [ ] `pgPhoneHistory.applyPlatformUserPhoneHistoryTransition`: add `organization_id` to the INSERT, sourced from
      `getCurrentDbPrincipalOrganizationId()` (set for admin/projection; NULL for otp/messenger bootstrap).
- [ ] Confirm no call site needs org threaded that can't get it ambiently (booking/otp/messenger legitimately NULL).

### 3. Enforce policy (RLS DSL) — split the 2 PII tables off bootstrap_hybrid
- [ ] `rls-descriptor-model.mjs`: give `platform_user_contacts` + `user_phone_history` a new scopingKind
      (e.g. `bootstrap_hybrid_org_gated`) + new predicateTemplate; keep the 3 system_settings on `bootstrap_hybrid`.
- [ ] `rls-sql-renderer.mjs`: new render fn for the gated strict predicate above.
- [ ] `phase4-locked-policy-artifact.mjs`: `renderPhase4StrictPredicate` branch for the new kind; ensure the new kind
      does NOT hit the bootstrap_hybrid short-circuit in `renderPhase4DormantCompatPredicate` (so dormant = general wrap).
- [ ] `p0-8-6-policy-targets.mjs`: `getP086BootstrapHybridDescriptors` / `assertP086BootstrapHybridTargets` /
      `renderP086PolicyStatements` updated to span both kinds (still 5 targets: 3 old-shape + 2 new-shape).
- [ ] Regenerate artifact: `node docs/_TODO/SAAS_FOUNDATION/scripts/phase4-locked-policy-artifact.mjs --write`.
- [ ] Update `check-p0-8-6-policy-generator.mjs` to assert per-table shapes (system_settings → old; 2 PII → gated).
- [ ] Green: `check-p0-8-rls-descriptors.mjs`, `check-p0-8-sql-renderer.mjs`, `check-p0-8-6-policy-generator.mjs`,
      `check-phase4-locked-policy-artifact.mjs`, `check-p0-9-enforce-descriptors.mjs`.

### 4. Verify (orchestrator runs 4b/4c on disposable copy)
- [ ] 4a. `node scripts/check-saas-db-regression.mjs` green (static suite).
- [ ] 4b. R2 isolation smoke: `smoke-r2-real-policy-isolation.mjs` green + extended to prove the 2 PII tables:
      staff clinic-walled on org rows; NULL rows NOT visible to staff; bootstrap CAN read/write NULL.
- [ ] 4c. Full rehearsal on disposable prod-copy (`rehearse-multitenant-isolation.mjs`, host sudo -u postgres) —
      clinic #1 not blocked (dormant + enforce), who-sees-what matrix still holds, contacts/phone writes succeed.
- [ ] 4d. webapp typecheck + scoped repo tests green.

### 5. Independent audit + acceptance
- [ ] Independent adversarial audit by a DIFFERENT model (reality-check: predicate correctness, dormant trap,
      integrator/bootstrap write paths, no clinic #1 lockout, checker coverage).
- [ ] Owner live acceptance. Update taskdb #708 with commit_ref.

## Status (2026-07-12)
Steps 1–3 implemented (Codex 5.5) + independently re-verified by lead against reality: all 6 RLS/journal checks,
`check-saas-db-regression`, webapp `tsc`, 33 scoped repo tests GREEN. R2 real-policy smoke GREEN on a real temp
cluster, extended with PERMANENT PII NULL-gating assertions proving on strict+FORCE: staff sees only its org rows
& NOT NULL rows (hole closed); bootstrap (no-context, non-staff) reads+writes ONLY NULL rows; dormant clinic #1 not
blocked. Independent adversarial audit: **SHIP-WITH-FIXES** — core correct, hole closed exactly, dormant-safe.

## NOT DONE — FLIP-BLOCKERS (must close before any enforce/locked+FORCE cutover; NOT needed for TEST-dormant deploy)
- [ ] **FB#1 [HIGH] user_phone_history close-prior UPDATE vs partial unique index.** Under strict RLS an org-context
  session (admin/integrator) cannot SEE a prior NULL-org active row (OTP/messenger/booking bootstrap origin), so
  `applyPlatformUserPhoneHistoryTransition`'s `UPDATE ... WHERE valid_to IS NULL` won't close it; the new-active
  INSERT then violates `uq_user_phone_history_user_active` (unique indexes ignore RLS) → phone-update tx rollback.
  Latent (dormant app role is BYPASSRLS → no break; bites only at locked+FORCE). Fix options (owner triage):
  (a) close prior via SECURITY DEFINER helper closing ALL the user's active rows regardless of org; (b) re-stamp
  org on transition; (c) pre-flip invariant: no NULL-org active row survives for an org-known user.
- [ ] **FB#2 [MEDIUM] locked-mode bootstrap base DB role must be NOBYPASSRLS AND not a member of app_staff.**
  Bootstrap/infra principals `RESET ROLE` to the base `DATABASE_URL` role (db-principal `applySignedDbPrincipal`
  early-returns for bootstrap). If that role ∈ app_staff → `NOT app.is_staff()` false → bootstrap NULL reads/writes
  fail closed; if BYPASSRLS → bootstrap sees every clinic. R2 smoke proves the DESIRED role shape works; add a
  flip-gate assertion on the real locked base role.
- [x] Full prod-copy rehearsal DONE (dump 20260712_201501, 251 users): deploy-667 GREEN, migration applied,
  contacts_null_org=0 on real data, dormant clinic#1 not blocked, strict+FORCE who-sees-what matrix ALL CONFIRMED,
  disposable copy dropped, prod untouched. → landed change PROVEN end-to-end on real data.
- [ ] Owner live acceptance folds into TASK B TEST-dormant deploy walkthrough (register new specialist → empty
  patient base; existing clinic keeps working).

## Audit notes (LOW / no action)
- 0178 does NOT re-create the drizzle 0163 policy (deploy artifact is canonical; dormant no-op under BYPASSRLS) — by design.
- contacts onConflict `COALESCE(existing, EXCLUDED)` keeps first-writer org (unique key excludes org) — acceptable, contacts ≠ identity.
- `pgTreatmentTail15C.repo.test.ts` stamps org on a source=otp INSERT (mocked principal) — parity test only, fine.
