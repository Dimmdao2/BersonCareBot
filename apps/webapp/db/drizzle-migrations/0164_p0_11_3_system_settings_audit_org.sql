ALTER TABLE "public"."system_settings_audit" ADD COLUMN IF NOT EXISTS "organization_id" uuid;

DO $$
BEGIN
  ALTER TABLE "public"."system_settings_audit"
    ADD CONSTRAINT "system_settings_audit_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "public"."be_organizations"("id")
    ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "idx_system_settings_audit_org_key_at"
  ON "public"."system_settings_audit" ("organization_id", "key", "changed_at" DESC);
