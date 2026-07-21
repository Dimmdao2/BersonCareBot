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

ALTER TABLE "be_organizations"
  ADD COLUMN IF NOT EXISTS "commercial_access_state" text DEFAULT 'compatibility' NOT NULL;
--> statement-breakpoint
ALTER TABLE "be_organizations"
  DROP CONSTRAINT IF EXISTS "be_organizations_commercial_access_state_check";
--> statement-breakpoint
ALTER TABLE "be_organizations"
  ADD CONSTRAINT "be_organizations_commercial_access_state_check"
  CHECK ("commercial_access_state" IN ('compatibility', 'no_trial', 'trial_pending', 'active'));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_be_organizations_commercial_access_state"
  ON "be_organizations" USING btree ("commercial_access_state", "is_active");
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

CREATE OR REPLACE FUNCTION app.reserve_saas_quota_growth(
  p_organization_id uuid,
  p_mechanic text,
  p_growth_by_unit jsonb
)
RETURNS TABLE (
  allowed boolean,
  warning boolean,
  used bigint,
  projected bigint,
  quota_limit bigint,
  utilization_percent integer,
  reason text,
  period_key text,
  reserved bigint
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_quota jsonb;
  v_kind text;
  v_unit text;
  v_period text;
  v_limit bigint;
  v_growth bigint;
  v_period_key text;
  v_previous bigint := 0;
  v_after bigint;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF NOT app.is_staff() OR app.current_org_id() IS DISTINCT FROM p_organization_id THEN
    RAISE EXCEPTION 'quota_organization_principal_required';
  END IF;

  SELECT COALESCE(active_override.quota, tariff.quotas -> p_mechanic)
  INTO v_quota
  FROM public.be_organizations organization
  LEFT JOIN public.saas_organization_trials trial
    ON trial.organization_id = organization.id
   AND trial.status = 'active'
  LEFT JOIN public.saas_tariffs tariff
    ON tariff.id = CASE
      WHEN trial.id IS NOT NULL AND v_now <= trial.grace_ends_at
        THEN trial.tariff_id
      WHEN trial.id IS NOT NULL
       AND trial.post_trial_behavior = 'tariff'
        THEN trial.post_trial_tariff_id
      ELSE organization.tariff_id
    END
  LEFT JOIN LATERAL (
    SELECT override.quota
    FROM public.saas_org_entitlement_overrides override
    WHERE override.organization_id = organization.id
      AND override.mechanic = p_mechanic
      AND (override.expires_at IS NULL OR override.expires_at > v_now)
    LIMIT 1
  ) active_override ON true
  WHERE organization.id = p_organization_id;

  IF v_quota IS NULL OR v_quota ->> 'kind' = 'unlimited' THEN
    RETURN QUERY SELECT true, false, 0::bigint, 0::bigint, NULL::bigint, NULL::integer,
      'allowed'::text, NULL::text, 0::bigint;
    RETURN;
  END IF;

  v_kind := v_quota ->> 'kind';
  v_unit := v_quota ->> 'unit';
  v_period := v_quota ->> 'period';
  IF v_kind <> 'numeric' OR v_unit IS NULL OR v_period NOT IN ('snapshot', 'day', 'month', 'year') THEN
    RAISE EXCEPTION 'quota_configuration_invalid';
  END IF;
  v_limit := (v_quota ->> 'limit')::bigint;
  v_growth := (p_growth_by_unit ->> v_unit)::bigint;
  IF v_limit < 0 OR v_growth IS NULL OR v_growth <= 0 THEN
    RAISE EXCEPTION 'quota_growth_unit_required';
  END IF;

  v_period_key := CASE v_period
    WHEN 'snapshot' THEN 'snapshot'
    WHEN 'day' THEN to_char(v_now AT TIME ZONE 'UTC', 'YYYY-MM-DD')
    WHEN 'month' THEN to_char(v_now AT TIME ZONE 'UTC', 'YYYY-MM')
    WHEN 'year' THEN to_char(v_now AT TIME ZONE 'UTC', 'YYYY')
  END;

  SELECT usage.used
  INTO v_previous
  FROM public.saas_organization_quota_usage usage
  WHERE usage.organization_id = p_organization_id
    AND usage.mechanic = p_mechanic
    AND usage.period_key = v_period_key;
  v_previous := COALESCE(v_previous, 0);

  v_after := NULL;
  INSERT INTO public.saas_organization_quota_usage (
    organization_id, mechanic, period_key, used, updated_at
  ) SELECT
    p_organization_id, p_mechanic, v_period_key, v_growth, v_now
  WHERE v_growth <= v_limit
  ON CONFLICT (organization_id, mechanic, period_key) DO UPDATE
    SET used = public.saas_organization_quota_usage.used + EXCLUDED.used,
        updated_at = EXCLUDED.updated_at
    WHERE public.saas_organization_quota_usage.used + EXCLUDED.used <= v_limit
  RETURNING public.saas_organization_quota_usage.used INTO v_after;

  IF v_after IS NULL THEN
    SELECT usage.used
    INTO v_previous
    FROM public.saas_organization_quota_usage usage
    WHERE usage.organization_id = p_organization_id
      AND usage.mechanic = p_mechanic
      AND usage.period_key = v_period_key;
    v_previous := COALESCE(v_previous, 0);
    RETURN QUERY SELECT false, true, v_previous, v_previous + v_growth, v_limit,
      CASE WHEN v_limit = 0 THEN 100 ELSE round(((v_previous + v_growth)::numeric / v_limit) * 100)::integer END,
      'quota_reached'::text, v_period_key, 0::bigint;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, (v_after * 100 >= v_limit * 80), v_after - v_growth, v_after, v_limit,
    CASE WHEN v_limit = 0 THEN 100 ELSE round((v_after::numeric / v_limit) * 100)::integer END,
    CASE WHEN v_after * 100 >= v_limit * 80 THEN 'warning_80' ELSE 'allowed' END,
    v_period_key, v_growth;
END;
$function$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.reserve_saas_quota_growth(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.reserve_saas_quota_growth(uuid, text, jsonb) TO app_staff;
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
