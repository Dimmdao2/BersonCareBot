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
  CONSTRAINT "saas_trial_policy_start_event_check" CHECK ("start_event" = 'organization_provisioned'),
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

ALTER TABLE "saas_trial_policy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "saas_trial_policy" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_trial_policy_staff_read_write" ON "saas_trial_policy";
--> statement-breakpoint

ALTER TABLE "saas_organization_trials" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "saas_organization_trials" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_organization_trials_org_wall" ON "saas_organization_trials";
CREATE POLICY "saas_organization_trials_org_wall" ON "saas_organization_trials"
  FOR SELECT
  USING (app.is_staff() AND app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id());
--> statement-breakpoint

REVOKE ALL PRIVILEGES ON TABLE "saas_trial_policy", "saas_organization_trials" FROM app_staff;
GRANT SELECT ON TABLE "saas_organization_trials" TO app_staff;
GRANT SELECT ON TABLE "saas_organization_trials" TO app_owner;
REVOKE INSERT, UPDATE, DELETE ON TABLE "saas_tariffs", "saas_org_entitlement_overrides" FROM app_staff;
GRANT SELECT ON TABLE "saas_tariffs", "saas_org_entitlement_overrides" TO app_staff;
DROP POLICY IF EXISTS "saas_tariffs_staff_read_write" ON "saas_tariffs";
DROP POLICY IF EXISTS "saas_tariffs_staff_read" ON "saas_tariffs";
CREATE POLICY "saas_tariffs_staff_read" ON "saas_tariffs"
  FOR SELECT USING (app.is_staff());
DROP POLICY IF EXISTS "saas_org_entitlement_overrides_org_wall" ON "saas_org_entitlement_overrides";
DROP POLICY IF EXISTS "saas_org_entitlement_overrides_org_read" ON "saas_org_entitlement_overrides";
CREATE POLICY "saas_org_entitlement_overrides_org_read" ON "saas_org_entitlement_overrides"
  FOR SELECT USING (
    app.is_staff() AND app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()
  );
--> statement-breakpoint

-- Commercial columns remain platform-owned even though ordinary staff retains unrelated
-- organization mutations. A table-level UPDATE grant cannot express a negative column grant,
-- therefore the trigger is the authoritative denial boundary.
CREATE OR REPLACE FUNCTION app.reject_staff_commercial_organization_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
BEGIN
  IF current_user = 'app_staff'
     AND (NEW.tariff_id IS DISTINCT FROM OLD.tariff_id
       OR NEW.commercial_access_state IS DISTINCT FROM OLD.commercial_access_state) THEN
    RAISE EXCEPTION 'platform_commercial_capability_required';
  END IF;
  RETURN NEW;
END;
$function$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS be_organizations_staff_commercial_columns_guard ON public.be_organizations;
CREATE TRIGGER be_organizations_staff_commercial_columns_guard
  BEFORE UPDATE OF tariff_id, commercial_access_state ON public.be_organizations
  FOR EACH ROW EXECUTE FUNCTION app.reject_staff_commercial_organization_update();
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.reject_staff_commercial_organization_update() FROM PUBLIC;
--> statement-breakpoint

-- Replace the frozen 0219 projection with the canonical effective lifecycle projection. Identity
-- remains entirely server-derived from the signed patient principal. Ended trials are excluded,
-- expiry is preserved, and only unexpired overrides reach the patient resolver.
DROP FUNCTION IF EXISTS app.read_current_patient_organization_entitlements();
--> statement-breakpoint
CREATE FUNCTION app.read_current_patient_organization_entitlements()
RETURNS TABLE (
  tariff_mechanics jsonb,
  tariff_quotas jsonb,
  included_seats integer,
  override_mechanic text,
  override_enabled boolean,
  override_quota jsonb,
  override_expires_at timestamptz,
  seat_limit_override integer,
  lifecycle text,
  effective_tariff_id uuid,
  access_source text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_organization_id uuid := app.current_org_id();
  v_patient_user_id uuid := app.current_patient_user_id();
  v_now timestamptz := statement_timestamp();
BEGIN
  IF v_organization_id IS NULL OR v_patient_user_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH exact_context AS (
    SELECT organization.id, organization.tariff_id, organization.commercial_access_state
    FROM public.org_enrollments AS enrollment
    INNER JOIN public.be_organizations AS organization
      ON organization.id = enrollment.organization_id
     AND organization.is_active = true
    WHERE enrollment.organization_id = v_organization_id
      AND enrollment.platform_user_id = v_patient_user_id
      AND enrollment.status = 'active'
  ), active_trial AS (
    SELECT trial.*
    FROM public.saas_organization_trials AS trial
    INNER JOIN exact_context ON exact_context.id = trial.organization_id
    WHERE trial.status = 'active'
    LIMIT 1
  ), effective AS (
    SELECT
      context.id AS organization_id,
      CASE
        WHEN trial.id IS NULL THEN context.tariff_id
        WHEN v_now <= trial.grace_ends_at THEN trial.tariff_id
        WHEN trial.post_trial_behavior = 'tariff' THEN trial.post_trial_tariff_id
        ELSE trial.tariff_id
      END AS tariff_id,
      CASE
        WHEN trial.id IS NULL THEN 'active'
        WHEN v_now <= trial.ends_at THEN 'active'
        WHEN v_now <= trial.grace_ends_at THEN 'grace'
        WHEN trial.post_trial_behavior = 'tariff' THEN 'active'
        ELSE trial.post_trial_behavior
      END AS lifecycle,
      CASE
        WHEN trial.id IS NULL AND context.commercial_access_state = 'compatibility' THEN 'compatibility'
        WHEN trial.id IS NULL AND context.commercial_access_state = 'no_trial' THEN 'no_trial'
        WHEN trial.id IS NULL THEN 'assignment'
        WHEN v_now > trial.grace_ends_at AND trial.post_trial_behavior = 'tariff' THEN 'post_trial_tariff'
        ELSE 'trial'
      END AS access_source
    FROM exact_context AS context
    LEFT JOIN active_trial AS trial ON true
  )
  SELECT
    tariff.mechanics,
    tariff.quotas,
    tariff.included_seats,
    entitlement_override.mechanic,
    entitlement_override.enabled,
    entitlement_override.quota,
    entitlement_override.expires_at,
    entitlement_override.seat_limit_override,
    effective.lifecycle,
    effective.tariff_id,
    effective.access_source
  FROM effective
  LEFT JOIN public.saas_tariffs AS tariff ON tariff.id = effective.tariff_id
  LEFT JOIN public.saas_org_entitlement_overrides AS entitlement_override
    ON entitlement_override.organization_id = effective.organization_id
   AND (entitlement_override.expires_at IS NULL OR entitlement_override.expires_at > v_now)
  ORDER BY entitlement_override.mechanic;
END
$function$;
--> statement-breakpoint
ALTER FUNCTION app.read_current_patient_organization_entitlements() OWNER TO app_owner;
REVOKE ALL ON FUNCTION app.read_current_patient_organization_entitlements() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.read_current_patient_organization_entitlements() TO app_patient;
--> statement-breakpoint

DROP POLICY IF EXISTS saas_organization_trials_current_patient_capability_read
  ON public.saas_organization_trials;
CREATE POLICY saas_organization_trials_current_patient_capability_read
  ON public.saas_organization_trials
  FOR SELECT
  USING (
    app.current_org_id() IS NOT NULL
    AND app.current_patient_user_id() IS NOT NULL
    AND organization_id = app.current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.org_enrollments AS enrollment
      WHERE enrollment.organization_id = app.current_org_id()
        AND enrollment.platform_user_id = app.current_patient_user_id()
        AND enrollment.status = 'active'
    )
  );
--> statement-breakpoint

DROP POLICY IF EXISTS saas_tariffs_current_patient_capability_read ON public.saas_tariffs;
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
          WHEN statement_timestamp() <= trial.grace_ends_at THEN trial.tariff_id
          WHEN trial.post_trial_behavior = 'tariff' THEN trial.post_trial_tariff_id
          ELSE trial.tariff_id
        END
    )
  );
--> statement-breakpoint

-- `courses/items` is the first supported quota path. It is deliberately enforced on the
-- successful business INSERT itself: the advisory tenant lock serializes competing writers,
-- existing rows are the authority, replays that insert nothing do not consume capacity, and a
-- later failure in the outer transaction rolls both the course and the check back together.
CREATE OR REPLACE FUNCTION app.enforce_courses_snapshot_quota()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_now timestamptz := statement_timestamp();
  v_quota jsonb;
  v_limit bigint;
  v_count bigint;
BEGIN
  IF NEW.organization_id IS NULL THEN
    RAISE EXCEPTION 'course_organization_required';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('saas_quota:courses:' || NEW.organization_id::text, 0)
  );

  WITH active_trial AS (
    SELECT trial.*
    FROM public.saas_organization_trials AS trial
    WHERE trial.organization_id = NEW.organization_id
      AND trial.status = 'active'
    LIMIT 1
  ), effective_tariff AS (
    SELECT CASE
      WHEN trial.id IS NULL THEN organization.tariff_id
      WHEN v_now <= trial.grace_ends_at THEN trial.tariff_id
      WHEN trial.post_trial_behavior = 'tariff' THEN trial.post_trial_tariff_id
      ELSE trial.tariff_id
    END AS id
    FROM public.be_organizations AS organization
    LEFT JOIN active_trial AS trial ON true
    WHERE organization.id = NEW.organization_id
      AND organization.is_active = true
  )
  SELECT COALESCE(entitlement_override.quota, tariff.quotas -> 'courses')
  INTO v_quota
  FROM effective_tariff
  LEFT JOIN public.saas_tariffs AS tariff ON tariff.id = effective_tariff.id
  LEFT JOIN public.saas_org_entitlement_overrides AS entitlement_override
    ON entitlement_override.organization_id = NEW.organization_id
   AND entitlement_override.mechanic = 'courses'
   AND (entitlement_override.expires_at IS NULL OR entitlement_override.expires_at > v_now);

  IF v_quota IS NULL THEN
    RETURN NEW;
  END IF;
  IF (v_quota ->> 'unit') IS DISTINCT FROM 'items'
     OR (v_quota ->> 'period') IS DISTINCT FROM 'snapshot'
     OR (v_quota ->> 'usagePolicy') IS DISTINCT FROM 'snapshot'
     OR COALESCE(v_quota ->> 'kind', '') NOT IN ('numeric', 'unlimited') THEN
    RAISE EXCEPTION 'tariff_quota_enforcement_shape_invalid';
  END IF;
  IF v_quota ->> 'kind' = 'unlimited' THEN
    RETURN NEW;
  END IF;
  IF COALESCE(v_quota ->> 'limit', '') !~ '^[0-9]+$' THEN
    RAISE EXCEPTION 'tariff_quota_limit_invalid';
  END IF;

  v_limit := (v_quota ->> 'limit')::bigint;
  SELECT count(*) INTO v_count
  FROM public.courses
  WHERE organization_id = NEW.organization_id;

  IF v_count > v_limit THEN
    RAISE EXCEPTION 'saas_quota_reached:courses:%/%', v_count - 1, v_limit;
  END IF;
  IF v_limit > 0 AND v_count * 5 >= v_limit * 4 THEN
    RAISE WARNING 'saas_quota_warning:courses:%/%', v_count, v_limit;
  END IF;
  RETURN NEW;
END
$function$;
--> statement-breakpoint
ALTER FUNCTION app.enforce_courses_snapshot_quota() OWNER TO app_owner;
REVOKE ALL ON FUNCTION app.enforce_courses_snapshot_quota() FROM PUBLIC;
--> statement-breakpoint
DROP TRIGGER IF EXISTS courses_snapshot_quota_guard ON public.courses;
CREATE TRIGGER courses_snapshot_quota_guard
  AFTER INSERT ON public.courses
  FOR EACH ROW EXECUTE FUNCTION app.enforce_courses_snapshot_quota();
