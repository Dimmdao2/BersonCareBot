-- TEMPORARY LOCAL MIGRATION NUMBER 0360 — the lead assigns the final number at merge.
-- RECONCILES-MIGRATION-HASH: 0359_saas_tariffs_capability_read_grace_ends_at_predrop_local
--
-- #987 CI-from-zero brief companion to 0359. `0359_saas_tariffs_capability_read_grace_ends_at_
-- predrop_local.sql` is deliberately positioned (journal `when`) BEFORE 0346 so a from-zero build
-- redefines `saas_tariffs_current_patient_capability_read` off `ends_at` before 0346's
-- `DROP COLUMN grace_ends_at` runs. On any database that already ran the pre-fix migration chain
-- (DEV/TEST — already past that `when` slot, and already carrying the same fix via
-- `0349_saas_trial_grace_discount_window_reconcile_local.sql`'s own reconciliation of 0346), 0359's
-- own `when` falls BELOW that database's ledger watermark, so drizzle-orm's watermark-only migrator
-- (`pg-core/dialect.cjs`, `Number(lastDbMigration.created_at) < migration.folderMillis`) skips it
-- outright — correct (DEV/TEST must not replay it) but `0359`'s hash then never lands in
-- `drizzle.__drizzle_migrations`, and `run-webapp-drizzle-migrate.mjs`'s own post-run completeness
-- check (`inspectMigrationLedgerCompleteness`) has no watermark awareness: every journal entry must
-- be covered directly or by a declared `RECONCILES-MIGRATION-HASH` forward, or the run fails closed
-- with `migration_ledger_incomplete` even though the schema itself is already correct. This migration
-- IS that forward: it sits at the current end of the chain (a genuinely new, always-pending `when`
-- on every environment), so it always actually runs and always lands its own hash in the ledger,
-- satisfying the completeness check for 0359 everywhere. Its body is the same idempotent
-- `DROP POLICY IF EXISTS` / `CREATE POLICY` reassertion 0349 already established for this exact
-- policy — a no-op on DEV/TEST (already in this shape via 0349) and a no-op immediately after 0359
-- on a from-zero build (0359 already put it in this shape one migration earlier).

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
