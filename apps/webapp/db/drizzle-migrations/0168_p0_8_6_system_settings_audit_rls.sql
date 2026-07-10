-- 0168: P0.8.6 supplemental — BOOTSTRAP hybrid RLS for public.system_settings_audit, added
-- after the original P0.8.6 sweep (0163). system_settings_audit mirrors public.system_settings'
-- nullable-organization_id hybrid tier (0164_p0_11_3_system_settings_audit_org.sql); see
-- docs/_TODO/SAAS_FOUNDATION/LOG.md taskdb #648. Statement is the same generated output as 0163,
-- produced by `node docs/_TODO/SAAS_FOUNDATION/scripts/p0-8-6-policy-targets.mjs --sql` for this table.

ALTER TABLE "public"."system_settings_audit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."system_settings_audit" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_bootstrap_hybrid_p0_8_6" ON "public"."system_settings_audit";
CREATE POLICY "saas_bootstrap_hybrid_p0_8_6" ON "public"."system_settings_audit" FOR ALL USING (("organization_id" IS NULL OR (NULLIF(current_setting('app.org', true), '') IS NOT NULL AND "organization_id" = NULLIF(current_setting('app.org', true), '')::uuid))) WITH CHECK (("organization_id" IS NULL OR (NULLIF(current_setting('app.org', true), '') IS NOT NULL AND "organization_id" = NULLIF(current_setting('app.org', true), '')::uuid)));
