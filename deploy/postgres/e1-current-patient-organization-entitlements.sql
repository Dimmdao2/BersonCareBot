-- Idempotent post-migration closure for the current C5A patient entitlement projection.
-- Frozen migration 0219 has the original five-column return type; migration 0225 replaced it
-- with the lifecycle/quota projection, now extended with owner access policy and its time anchor.
-- Replaying 0219 after 0225 is invalid because
-- PostgreSQL cannot change a function return type through CREATE OR REPLACE.
\set ON_ERROR_STOP on

DROP FUNCTION IF EXISTS app.read_current_patient_organization_entitlements();
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

ALTER FUNCTION app.read_current_patient_organization_entitlements() OWNER TO app_owner;
REVOKE ALL ON FUNCTION app.read_current_patient_organization_entitlements()
  FROM PUBLIC, app_staff, app_patient CASCADE;
GRANT EXECUTE ON FUNCTION app.read_current_patient_organization_entitlements() TO app_patient;
GRANT SELECT ON TABLE public.saas_tariffs, public.saas_org_entitlement_overrides,
  public.saas_organization_trials TO app_owner;
REVOKE ALL ON TABLE public.saas_tariffs, public.saas_org_entitlement_overrides,
  public.saas_organization_trials FROM app_patient;

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

DROP POLICY IF EXISTS saas_org_entitlement_overrides_current_patient_capability_read
  ON public.saas_org_entitlement_overrides;
CREATE POLICY saas_org_entitlement_overrides_current_patient_capability_read
  ON public.saas_org_entitlement_overrides
  FOR SELECT
  USING (
    app.current_org_id() IS NOT NULL
    AND app.current_patient_user_id() IS NOT NULL
    AND organization_id = app.current_org_id()
    AND EXISTS (
      SELECT 1
      FROM public.be_organizations AS organization
      INNER JOIN public.org_enrollments AS enrollment
        ON enrollment.organization_id = organization.id
       AND enrollment.platform_user_id = app.current_patient_user_id()
       AND enrollment.status = 'active'
      WHERE organization.id = app.current_org_id()
        AND organization.is_active = true
    )
  );

SELECT 1 / (
  pg_get_function_result('app.read_current_patient_organization_entitlements()'::regprocedure) =
    'TABLE(tariff_mechanics jsonb, tariff_quotas jsonb, tariff_system_access_policy jsonb, tariff_mechanic_access_policies jsonb, included_seats integer, included_seats_warning_at_percent integer, override_mechanic text, override_enabled boolean, override_quota jsonb, override_expires_at timestamp with time zone, seat_limit_override integer, lifecycle text, effective_tariff_id uuid, access_source text, degradation_started_at timestamp with time zone)'
)::int AS e1_current_patient_entitlements_signature_current;
