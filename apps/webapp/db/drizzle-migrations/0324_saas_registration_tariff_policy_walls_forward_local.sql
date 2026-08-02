-- TEMPORARY LOCAL MIGRATION NUMBER 0324
-- TEMPORARY LOCAL MIGRATION NUMBER 0291 -- the lead assigns the final number at merge.
-- 0289 created saas_registration_tariff_policy with no walls at all -- the audit gate
-- (tiers-218.tsv grounding, P0.10) caught it as "IN CODE, NO TIER". Give it the same wall
-- shape its sister saas_trial_policy got in 0225: RLS enabled + forced, plus an explicit
-- REVOKE from app_staff for defense in depth.
--
-- Round-2 audit finding: unlike 0225's table, this one must NOT depend on an external overlay
-- for its app_platform_settings policy. deploy-prod.sh never applies
-- deploy/postgres/c5a-platform-operations-runtime.sql (only deploy-test-saas.sh does), so a
-- FORCE-RLS table with no policy created here would deny every role including
-- app_platform_settings on prod and abort app.start_provisioned_organization_trial() --
-- breaking clinic registration outright. Made self-sufficient here, following the sibling
-- migration 0290_saas_billing_refunds.sql, which grants and creates its own
-- app_platform_settings policies in the same migration rather than relying on an overlay.
-- c5a's own CREATE POLICY for this table stays in place and is idempotent against this one.

ALTER TABLE "saas_registration_tariff_policy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "saas_registration_tariff_policy" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_registration_tariff_policy_staff_read_write" ON "saas_registration_tariff_policy";
--> statement-breakpoint

REVOKE ALL PRIVILEGES ON TABLE "saas_registration_tariff_policy" FROM app_staff;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON TABLE "saas_registration_tariff_policy" TO app_platform_settings;
--> statement-breakpoint

DROP POLICY IF EXISTS "saas_registration_tariff_policy_platform_operations" ON "saas_registration_tariff_policy";
CREATE POLICY "saas_registration_tariff_policy_platform_operations"
  ON "saas_registration_tariff_policy"
  FOR ALL TO app_platform_settings USING (true) WITH CHECK (true);
