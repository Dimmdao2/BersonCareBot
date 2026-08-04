-- TEMPORARY LOCAL MIGRATION NUMBER 0366 — the lead assigns the final number at merge.
-- RECONCILES-MIGRATION-HASH: 0360_saas_tariffs_capability_read_grace_ends_at_predrop_reconcile_local
--
-- #987 TEST deploy (04.08, second run of the day): `pnpm migrate`'s post-run completeness gate
-- (`inspectMigrationLedgerCompleteness`) failed closed with
-- `migration_ledger_incomplete tags=0359_...,0360_...` before any writer was released, leaving
-- deploy-test.sh stop all 5 TEST units on exit.
--
-- Root cause, confirmed live on TEST (bersoncarebot_test): `drizzle.__drizzle_migrations` already
-- carried a row at created_at = 1793539230105 — exactly 0360's journal `when` slot — but with the
-- content hash of 0362_oauth_vk_enabled_projection_repair_local instead of 0360's own hash. That row
-- pre-dates this deploy: it is residue from the earlier manual "temporary elevation" session (see
-- [[test-deploy-isolation-gate-and-resolve]] memory) that hand-applied 0362's VK projection fix on
-- TEST before this branch's migrations were renumbered/reordered into their final journal slots. The
-- installed migrator (`drizzle-orm@0.45.2`, `pg-core/dialect.cjs migrate()`) gates purely on
-- `lastDbMigration.created_at < migration.folderMillis` — a bad row sitting exactly on 0360's `when`
-- makes the comparison `1793539230105 < 1793539230105` false, so 0360's real body is skipped forever
-- on this database, and drizzle never gets a chance to insert 0360's own hash. Same bug class as
-- [[drizzle-migrator-watermark-not-hash]]: the watermark is a timestamp, not a content check, so a
-- wrong hash at the right timestamp is indistinguishable from "already correctly applied" to the
-- migrator itself. `run-webapp-drizzle-migrate.mjs`'s own completeness check has no watermark
-- awareness either — every journal entry must be covered directly or by a declared
-- `RECONCILES-MIGRATION-HASH` forward, or the run fails closed even though the resulting schema is
-- already correct (0360's policy body is byte-identical to what 0349 already installed, and to
-- 0359/0360 themselves — this migration changes no runtime behavior).
--
-- Fix, same append-only forward-repair idiom 0349/0355/0359/0360/0362 already use on this file set:
-- reissue 0360's exact policy body at a genuinely new, always-pending `when` slot so it actually runs
-- and lands its own hash, satisfying the completeness check for 0360 (and transitively for 0359, via
-- 0359 -> 0360 -> 0366) without touching the contaminated historical row, consistent with this
-- repo's immutable-migration discipline.

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
