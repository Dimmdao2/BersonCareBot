-- C5A: data-configured tariff quotas and exactly-one-trial lifecycle.
-- Ordered after the canonical 0224 unsupported-client fallback migration.

ALTER TABLE "saas_tariffs"
  ADD COLUMN IF NOT EXISTS "billing_period" text DEFAULT 'month' NOT NULL,
  ADD COLUMN IF NOT EXISTS "quotas" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "saas_tariffs"
  DROP CONSTRAINT IF EXISTS "saas_tariffs_billing_period_check";
--> statement-breakpoint
ALTER TABLE "saas_tariffs"
  ADD CONSTRAINT "saas_tariffs_billing_period_check"
  CHECK ("billing_period" IN ('day', 'month', 'year'));
--> statement-breakpoint

ALTER TABLE "saas_org_entitlement_overrides"
  ADD COLUMN IF NOT EXISTS "quota" jsonb,
  ADD COLUMN IF NOT EXISTS "expires_at" timestamptz;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_saas_org_entitlement_overrides_org_expiry"
  ON "saas_org_entitlement_overrides" USING btree ("organization_id", "expires_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "saas_trial_policy" (
  "key" text PRIMARY KEY DEFAULT 'global' NOT NULL,
  "tariff_id" uuid NOT NULL REFERENCES "saas_tariffs"("id") ON DELETE RESTRICT,
  "duration_days" integer NOT NULL,
  "grace_days" integer NOT NULL,
  "start_event" text NOT NULL,
  "post_trial_behavior" text NOT NULL,
  "post_trial_tariff_id" uuid REFERENCES "saas_tariffs"("id") ON DELETE RESTRICT,
  "is_active" boolean DEFAULT true NOT NULL,
  "updated_by" uuid,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "saas_trial_policy_key_check" CHECK ("key" = 'global'),
  CONSTRAINT "saas_trial_policy_duration_check" CHECK ("duration_days" > 0),
  CONSTRAINT "saas_trial_policy_grace_check" CHECK ("grace_days" >= 0),
  CONSTRAINT "saas_trial_policy_start_event_check" CHECK ("start_event" IN ('organization_provisioned', 'email_verified', 'manual')),
  CONSTRAINT "saas_trial_policy_post_behavior_check" CHECK ("post_trial_behavior" IN ('read_only', 'blocked', 'tariff')),
  CONSTRAINT "saas_trial_policy_post_tariff_check" CHECK (
    ("post_trial_behavior" = 'tariff' AND "post_trial_tariff_id" IS NOT NULL)
    OR ("post_trial_behavior" <> 'tariff' AND "post_trial_tariff_id" IS NULL)
  )
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "saas_organization_trials" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "be_organizations"("id") ON DELETE CASCADE,
  "tariff_id" uuid NOT NULL REFERENCES "saas_tariffs"("id") ON DELETE RESTRICT,
  "started_at" timestamptz NOT NULL,
  "ends_at" timestamptz NOT NULL,
  "grace_ends_at" timestamptz NOT NULL,
  "post_trial_behavior" text NOT NULL,
  "post_trial_tariff_id" uuid REFERENCES "saas_tariffs"("id") ON DELETE RESTRICT,
  "status" text DEFAULT 'active' NOT NULL,
  "extension_count" integer DEFAULT 0 NOT NULL,
  "created_by" uuid,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "saas_organization_trials_organization_uidx" UNIQUE ("organization_id"),
  CONSTRAINT "saas_organization_trials_dates_check" CHECK ("started_at" < "ends_at" AND "ends_at" <= "grace_ends_at"),
  CONSTRAINT "saas_organization_trials_extension_count_check" CHECK ("extension_count" >= 0),
  CONSTRAINT "saas_organization_trials_status_check" CHECK ("status" IN ('active', 'ended')),
  CONSTRAINT "saas_organization_trials_post_behavior_check" CHECK ("post_trial_behavior" IN ('read_only', 'blocked', 'tariff')),
  CONSTRAINT "saas_organization_trials_post_tariff_check" CHECK (
    ("post_trial_behavior" = 'tariff' AND "post_trial_tariff_id" IS NOT NULL)
    OR ("post_trial_behavior" <> 'tariff' AND "post_trial_tariff_id" IS NULL)
  )
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_saas_organization_trials_lifecycle"
  ON "saas_organization_trials" USING btree ("status", "grace_ends_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_saas_organization_trials_org_updated"
  ON "saas_organization_trials" USING btree ("organization_id", "updated_at" DESC);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "saas_organization_quota_usage" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "be_organizations"("id") ON DELETE CASCADE,
  "mechanic" text NOT NULL,
  "period_key" text NOT NULL,
  "used" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "saas_organization_quota_usage_scope_uidx" UNIQUE ("organization_id", "mechanic", "period_key"),
  CONSTRAINT "saas_organization_quota_usage_nonnegative_check" CHECK ("used" >= 0)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_saas_organization_quota_usage_org_updated"
  ON "saas_organization_quota_usage" USING btree ("organization_id", "updated_at" DESC);
--> statement-breakpoint

ALTER TABLE "saas_trial_policy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "saas_trial_policy" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_trial_policy_staff_read_write" ON "saas_trial_policy";
CREATE POLICY "saas_trial_policy_staff_read_write" ON "saas_trial_policy"
  FOR ALL USING (app.is_staff()) WITH CHECK (app.is_staff());
--> statement-breakpoint

ALTER TABLE "saas_organization_trials" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "saas_organization_trials" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_organization_trials_org_wall" ON "saas_organization_trials";
CREATE POLICY "saas_organization_trials_org_wall" ON "saas_organization_trials"
  FOR ALL
  USING (app.is_staff() AND app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())
  WITH CHECK (app.is_staff() AND app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id());
--> statement-breakpoint

ALTER TABLE "saas_organization_quota_usage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "saas_organization_quota_usage" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_organization_quota_usage_org_wall" ON "saas_organization_quota_usage";
CREATE POLICY "saas_organization_quota_usage_org_wall" ON "saas_organization_quota_usage"
  FOR ALL
  USING (app.is_staff() AND app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())
  WITH CHECK (app.is_staff() AND app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id());
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "saas_trial_policy" TO app_staff;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "saas_organization_trials" TO app_staff;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "saas_organization_quota_usage" TO app_staff;
