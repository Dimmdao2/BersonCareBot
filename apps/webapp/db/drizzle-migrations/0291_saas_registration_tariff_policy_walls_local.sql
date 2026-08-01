-- TEMPORARY LOCAL MIGRATION NUMBER 0291 -- the lead assigns the final number at merge.
-- 0289 created saas_registration_tariff_policy with no walls at all -- the audit gate
-- (tiers-218.tsv grounding, P0.10) caught it as "IN CODE, NO TIER". Give it the same wall
-- shape its sister saas_trial_policy got in 0225: RLS enabled + forced, no policy for it
-- (FORCE with no matching policy denies everyone but the schema owner / a SECURITY DEFINER
-- path), plus an explicit REVOKE from app_staff for defense in depth. Product code reads and
-- writes this table only through app_platform_settings; that role's own FOR ALL policy lives
-- in deploy/postgres/c5a-platform-operations-runtime.sql. This migration only closes the
-- app_staff / default-privilege gap that 0289 left open.

ALTER TABLE "saas_registration_tariff_policy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "saas_registration_tariff_policy" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_registration_tariff_policy_staff_read_write" ON "saas_registration_tariff_policy";
--> statement-breakpoint

REVOKE ALL PRIVILEGES ON TABLE "saas_registration_tariff_policy" FROM app_staff;
