-- TEMPORARY LOCAL MIGRATION NUMBER 0359 — the lead assigns the final number at merge.
-- ⚠️ POSITION, NOT JUST NUMBER: this migration's journal entry MUST stay ordered strictly BEFORE
-- 0346_saas_trial_grace_discount_window_local's entry (see meta/_journal.json — its `idx`/`when`
-- were shifted by +1 from 0346 onward to make room right in front of it). Renumbering this file at
-- merge must preserve "runs immediately before 0346", not just pick any free trailing slot — an
-- append-only slot at the end would reproduce the exact from-zero failure this migration fixes
-- (drizzle-orm 0.45.2 runs the whole pending batch in ONE transaction, in journal-array order; once
-- 0346 raises 2BP01 the transaction aborts before anything positioned after it, including 0349's own
-- reconciliation, ever executes — see run below).
--
-- #987 CI-from-zero brief (owner-authorized slot, 04.08): `test-webapp-postgres` is red on a
-- from-zero build because migration 0346 raises `2BP01 dependent_objects_still_exist` on:
--   apps/webapp/db/drizzle-migrations/0346_saas_trial_grace_discount_window_local.sql:72-74
--     ALTER TABLE "saas_organization_trials" DROP COLUMN IF EXISTS "grace_ends_at";
-- Reproduced live (2026-08-04) via `npx tsx scripts/postgres-integration/cli.ts build-template` in
-- this worktree: fails with `sqlstate=2BP01` while restoring the a0-greenfield baseline (idx<=287)
-- and replaying every migration after it — exactly the from-zero chain `test:webapp:postgres` runs.
--
-- Root cause: the RLS policy `saas_tariffs_current_patient_capability_read`, created by
-- `0225_saas_tariff_quotas_trial.sql:270-290`, has a USING clause that reads
-- `trial.grace_ends_at` directly (`WHEN statement_timestamp() <= trial.grace_ends_at THEN
-- trial.tariff_id`, line 290) — making it a dependent object of
-- `saas_organization_trials.grace_ends_at`. Postgres refuses to drop a column a policy still
-- references, so 0346's `DROP COLUMN grace_ends_at` cannot succeed while this policy exists in its
-- 0225 form. Nothing between 0225 and 0346 touches this policy.
--
-- Why 0349's own fix (`0349_saas_trial_grace_discount_window_reconcile_local.sql:78-104`, which
-- DOES drop+recreate this exact policy against `ends_at` instead) does not rescue a from-zero build:
-- 0349 sits AFTER 0346 in journal order. drizzle-orm 0.45.2's installed migrator
-- (`pg-core/dialect.cjs` `migrate()`) wraps the ENTIRE pending batch — every journal entry above the
-- single global watermark — in one `session.transaction`, executed strictly in journal-array order;
-- it does not commit per-file. The moment 0346's statement raises 2BP01 the whole transaction rolls
-- back and the loop's remaining iterations (0347, 0348, 0349, ...) never run at all. 0349 was written
-- to reconcile a DIFFERENT, already-happened DEV/TEST incident (0346 landing under a temporary
-- number that collided with another worktree's migration at the same ledger watermark slot, so its
-- body silently never ran there — see 0349's own header) — not the from-zero ordering problem, and
-- it structurally cannot be, positioned where it is.
--
-- Fix: pre-drop+recreate the policy here, BEFORE 0346 runs, using the same `ends_at` boundary 0349
-- already established (identical CASE shape, `grace_ends_at` renamed to `ends_at` — no behavior
-- change, matching 0346's own `app.read_current_patient_organization_entitlements()` rewrite). Once
-- this runs first, 0346's `DROP COLUMN grace_ends_at` has no dependent object left and 0349's later
-- reapplication of the same DROP POLICY/CREATE POLICY is a harmless no-op (idempotent:
-- `DROP POLICY IF EXISTS` / `CREATE POLICY` with identical body). 0346's own file is untouched — it
-- is already applied on DEV/TEST and its body must not diverge from what those environments ran.
-- This migration's `when` sits below DEV/TEST's already-advanced watermark, so it is a no-op there
-- too (skipped, exactly like any already-superseded reconciliation) and only actually executes on a
-- from-zero build, which has no watermark yet.

DROP POLICY IF EXISTS saas_tariffs_current_patient_capability_read ON public.saas_tariffs;
--> statement-breakpoint
CREATE POLICY saas_tariffs_current_patient_capability_read ON public.saas_tariffs
  FOR SELECT
  USING (
    app.current_org_id() IS NOT NULL
    AND app.current_patient_user_id() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.be_organizations AS organization
      INNER JOIN public.org_enrollments AS enrollment
        ON enrollment.organization_id = organization.id
       AND enrollment.platform_user_id = app.current_patient_user_id()
       AND enrollment.status = 'active'
      LEFT JOIN public.saas_organization_trials AS trial
        ON trial.organization_id = organization.id
       AND trial.status = 'active'
      WHERE organization.id = app.current_org_id()
        AND organization.is_active = true
        AND saas_tariffs.id = CASE
          WHEN trial.id IS NULL THEN organization.tariff_id
          WHEN statement_timestamp() <= trial.ends_at THEN trial.tariff_id
          WHEN trial.post_trial_behavior = 'tariff' THEN trial.post_trial_tariff_id
          ELSE trial.tariff_id
        END
    )
  );
