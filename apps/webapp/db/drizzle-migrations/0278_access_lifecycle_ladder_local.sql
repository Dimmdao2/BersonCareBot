-- TEMPORARY LOCAL MIGRATION NUMBER 0276 — the lead assigns the final number at merge.
-- #1069 stage 2: owner-configured access lifecycle, with no duration or terminal defaults.

ALTER TABLE public.saas_tariffs
  ADD COLUMN system_access_policy jsonb,
  ADD COLUMN mechanic_access_policies jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN included_seats_warning_at_percent integer;
--> statement-breakpoint

ALTER TABLE public.saas_tariffs
  ADD CONSTRAINT saas_tariffs_included_seats_warning_check
  CHECK (
    included_seats_warning_at_percent IS NULL
    OR included_seats_warning_at_percent BETWEEN 0 AND 100
  );
--> statement-breakpoint

ALTER TABLE public.saas_trial_policy
  DROP CONSTRAINT IF EXISTS saas_trial_policy_start_event_check;
--> statement-breakpoint
ALTER TABLE public.saas_trial_policy
  ADD CONSTRAINT saas_trial_policy_start_event_check
  CHECK (length(btrim(start_event)) > 0);
--> statement-breakpoint

-- Remove only the historical agent seed. An owner-edited lifecyclePolicy is preserved.
UPDATE public.system_settings
SET value_json = value_json #- '{value,lifecyclePolicy}',
    updated_at = now()
WHERE key = 'saas_billing_payment_provider'
  AND scope = 'admin'
  AND organization_id IS NULL
  AND value_json #> '{value,lifecyclePolicy}' =
    '{"graceDays": 7, "chargeAttempts": 3, "readOnlyDays": 21}'::jsonb;
--> statement-breakpoint

-- Patient reads receive the same tariff policy and server-derived degradation anchor as staff.
DROP FUNCTION IF EXISTS app.read_current_patient_organization_entitlements();
--> statement-breakpoint
CREATE FUNCTION app.read_current_patient_organization_entitlements()
RETURNS TABLE (
  tariff_mechanics jsonb,
  tariff_quotas jsonb,
  tariff_system_access_policy jsonb,
  tariff_mechanic_access_policies jsonb,
  included_seats integer,
  included_seats_warning_at_percent integer,
  override_mechanic text,
  override_enabled boolean,
  override_quota jsonb,
  override_expires_at timestamptz,
  seat_limit_override integer,
  lifecycle text,
  effective_tariff_id uuid,
  access_source text,
  degradation_started_at timestamptz
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
      END AS access_source,
      trial.ends_at AS degradation_started_at
    FROM exact_context AS context
    LEFT JOIN active_trial AS trial ON true
  )
  SELECT
    tariff.mechanics,
    tariff.quotas,
    tariff.system_access_policy,
    tariff.mechanic_access_policies,
    tariff.included_seats,
    tariff.included_seats_warning_at_percent,
    entitlement_override.mechanic,
    entitlement_override.enabled,
    entitlement_override.quota,
    entitlement_override.expires_at,
    entitlement_override.seat_limit_override,
    effective.lifecycle,
    effective.tariff_id,
    effective.access_source,
    effective.degradation_started_at
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
