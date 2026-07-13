-- 0167: P0.8.3 supplemental — dormant permissive org RLS for the two SCOPED direct-org tables
-- added after the original P0.8.3 sweep (0160): public.org_enrollments and
-- public.broadcast_drafts (docs/_TODO/SAAS_FOUNDATION/LOG.md taskdb #648). Statements are the
-- same generated output as 0160, produced by
-- `node docs/_TODO/SAAS_FOUNDATION/scripts/p0-8-3-policy-targets.mjs --sql` for these two tables.

ALTER TABLE "public"."org_enrollments" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."org_enrollments";
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."org_enrollments" FOR ALL USING ((NULLIF(current_setting('app.org', true), '') IS NULL OR "organization_id" = NULLIF(current_setting('app.org', true), '')::uuid)) WITH CHECK ((NULLIF(current_setting('app.org', true), '') IS NULL OR "organization_id" = NULLIF(current_setting('app.org', true), '')::uuid));
ALTER TABLE "public"."broadcast_drafts" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."broadcast_drafts";
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."broadcast_drafts" FOR ALL USING ((NULLIF(current_setting('app.org', true), '') IS NULL OR "organization_id" = NULLIF(current_setting('app.org', true), '')::uuid)) WITH CHECK ((NULLIF(current_setting('app.org', true), '') IS NULL OR "organization_id" = NULLIF(current_setting('app.org', true), '')::uuid));
