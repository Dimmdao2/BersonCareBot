-- 0132: system_settings_audit — history of every system_settings change (who / when / old → new).
-- DB-safety guard. The audit INSERT runs in the SAME transaction as the upsert (pgSystemSettings.ts),
-- so this table MUST exist on every environment. Canonical path: migrate-all.sh runs the webapp
-- DRIZZLE migrations (not the legacy apps/webapp/migrations/*.sql, which is blocked in CI).

CREATE TABLE IF NOT EXISTS "system_settings_audit" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "key" text NOT NULL,
  "scope" text NOT NULL,
  "old_value_json" jsonb,
  "new_value_json" jsonb NOT NULL,
  "changed_by" uuid REFERENCES "platform_users"("id"),
  "changed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "source" text
);

CREATE INDEX IF NOT EXISTS "idx_system_settings_audit_key_at"
  ON "system_settings_audit" ("key", "changed_at" DESC);
