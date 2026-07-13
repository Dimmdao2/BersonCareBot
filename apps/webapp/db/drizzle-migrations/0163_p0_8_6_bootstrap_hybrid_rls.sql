ALTER TABLE "public"."system_settings" ADD COLUMN IF NOT EXISTS "organization_id" uuid;
ALTER TABLE "integrator"."system_settings" ADD COLUMN IF NOT EXISTS "organization_id" uuid;

CREATE UNIQUE INDEX IF NOT EXISTS "system_settings_global_key_scope_uidx" ON "public"."system_settings" ("key", "scope") WHERE "organization_id" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "system_settings_org_key_scope_uidx" ON "public"."system_settings" ("key", "scope", "organization_id") WHERE "organization_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "integrator_system_settings_global_key_scope_uidx" ON "integrator"."system_settings" ("key", "scope") WHERE "organization_id" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "integrator_system_settings_org_key_scope_uidx" ON "integrator"."system_settings" ("key", "scope", "organization_id") WHERE "organization_id" IS NOT NULL;

ALTER TABLE "public"."system_settings" DROP CONSTRAINT IF EXISTS "system_settings_pkey";
ALTER TABLE "integrator"."system_settings" DROP CONSTRAINT IF EXISTS "system_settings_pkey";

DO $$
BEGIN
  ALTER TABLE "public"."system_settings"
    ADD CONSTRAINT "system_settings_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "public"."be_organizations"("id")
    ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "integrator"."system_settings"
    ADD CONSTRAINT "integrator_system_settings_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "public"."be_organizations"("id")
    ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "integrator"."system_settings" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_bootstrap_hybrid_p0_8_6" ON "integrator"."system_settings";
CREATE POLICY "saas_bootstrap_hybrid_p0_8_6" ON "integrator"."system_settings" FOR ALL USING (("organization_id" IS NULL OR (NULLIF(current_setting('app.org', true), '') IS NOT NULL AND "organization_id" = NULLIF(current_setting('app.org', true), '')::uuid))) WITH CHECK (("organization_id" IS NULL OR (NULLIF(current_setting('app.org', true), '') IS NOT NULL AND "organization_id" = NULLIF(current_setting('app.org', true), '')::uuid)));
ALTER TABLE "public"."platform_user_contacts" ADD COLUMN IF NOT EXISTS "organization_id" uuid;

DO $$
BEGIN
  ALTER TABLE "public"."platform_user_contacts"
    ADD CONSTRAINT "platform_user_contacts_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "public"."be_organizations"("id")
    ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "public"."platform_user_contacts" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_bootstrap_hybrid_p0_8_6" ON "public"."platform_user_contacts";
CREATE POLICY "saas_bootstrap_hybrid_p0_8_6" ON "public"."platform_user_contacts" FOR ALL USING (("organization_id" IS NULL OR (NULLIF(current_setting('app.org', true), '') IS NOT NULL AND "organization_id" = NULLIF(current_setting('app.org', true), '')::uuid))) WITH CHECK (("organization_id" IS NULL OR (NULLIF(current_setting('app.org', true), '') IS NOT NULL AND "organization_id" = NULLIF(current_setting('app.org', true), '')::uuid)));
ALTER TABLE "public"."system_settings" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_bootstrap_hybrid_p0_8_6" ON "public"."system_settings";
CREATE POLICY "saas_bootstrap_hybrid_p0_8_6" ON "public"."system_settings" FOR ALL USING (("organization_id" IS NULL OR (NULLIF(current_setting('app.org', true), '') IS NOT NULL AND "organization_id" = NULLIF(current_setting('app.org', true), '')::uuid))) WITH CHECK (("organization_id" IS NULL OR (NULLIF(current_setting('app.org', true), '') IS NOT NULL AND "organization_id" = NULLIF(current_setting('app.org', true), '')::uuid)));
ALTER TABLE "public"."user_phone_history" ADD COLUMN IF NOT EXISTS "organization_id" uuid;

DO $$
BEGIN
  ALTER TABLE "public"."user_phone_history"
    ADD CONSTRAINT "user_phone_history_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "public"."be_organizations"("id")
    ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "public"."user_phone_history" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_bootstrap_hybrid_p0_8_6" ON "public"."user_phone_history";
CREATE POLICY "saas_bootstrap_hybrid_p0_8_6" ON "public"."user_phone_history" FOR ALL USING (("organization_id" IS NULL OR (NULLIF(current_setting('app.org', true), '') IS NOT NULL AND "organization_id" = NULLIF(current_setting('app.org', true), '')::uuid))) WITH CHECK (("organization_id" IS NULL OR (NULLIF(current_setting('app.org', true), '') IS NOT NULL AND "organization_id" = NULLIF(current_setting('app.org', true), '')::uuid)));
