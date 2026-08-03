-- Idempotent post-migration closure for the current C5A patient entitlement projection.
-- Frozen migration 0219 has the original five-column return type; migration 0225 replaced it
-- with the lifecycle/quota projection, now extended with owner access policy and its time anchor.
-- Replaying 0219 after 0225 is invalid because
-- PostgreSQL cannot change a function return type through CREATE OR REPLACE.
--
-- #1057 B0.3 (2026-08-03): this overlay's body had drifted since 0225 -- migration 0346 (#1069)
-- removed the trial-extension `grace` lifecycle stage and `saas_organization_trials.grace_ends_at`
-- outright, and 0346's own body already reads `trial.ends_at` plus the paid-period anchor via
-- `app.saas_billing_effective_tariff`. This overlay still read `trial.grace_ends_at` directly, so
-- deploying after 0346/0349 hard-failed with `column trial.grace_ends_at does not exist` (confirmed
-- live on TEST 2026-08-03) -- and, short of that crash, would have silently reverted the function
-- to its pre-0278+ body every deploy despite the return TABLE shape being unchanged since 0225 (the
-- signature assertion below only checks columns/types, not body logic, so it would have kept
-- passing). Body below is copied verbatim from 0346/0349's current definition.
\set ON_ERROR_STOP on

DROP FUNCTION IF EXISTS app.read_current_patient_organization_entitlements();
CREATE FUNCTION app.read_current_patient_organization_entitlements()
RETURNS TABLE (
  tariff_mechanics jsonb,
  tariff_quotas jsonb,
  tariff_system_access_policy jsonb,
  tariff_mechanic_access_policies jsonb,
  included_seats integer,
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
    SELECT organization.id, organization.tariff_id
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
  ), paid_period AS (
    SELECT max(subscription.current_period_ends_at) AS period_ends_at
    FROM public.saas_billing_subscriptions AS subscription
    INNER JOIN exact_context ON exact_context.id = subscription.organization_id
    WHERE subscription.status = ANY (ARRAY['active', 'expired'])
      AND subscription.current_period_ends_at IS NOT NULL
  ), effective AS (
    SELECT
      context.id AS organization_id,
      CASE
        WHEN trial.id IS NULL THEN context.tariff_id
        WHEN v_now <= trial.ends_at THEN trial.tariff_id
        WHEN trial.post_trial_behavior = 'tariff' THEN trial.post_trial_tariff_id
        ELSE trial.tariff_id
      END AS tariff_id,
      -- #1069 Т5-Т8: the trial-extension `grace` lifecycle stage is removed — the post-trial rule
      -- applies the instant `ends_at` passes, not after a further access-extending window.
      CASE
        WHEN trial.id IS NULL THEN 'active'
        WHEN v_now <= trial.ends_at THEN 'active'
        WHEN trial.post_trial_behavior = 'tariff' THEN 'active'
        ELSE trial.post_trial_behavior
      END AS lifecycle,
      CASE
        WHEN trial.id IS NULL THEN 'assignment'
        WHEN v_now > trial.ends_at AND trial.post_trial_behavior = 'tariff' THEN 'post_trial_tariff'
        ELSE 'trial'
      END AS access_source,
      COALESCE(trial.ends_at, paid_period.period_ends_at) AS degradation_started_at
    FROM exact_context AS context
    LEFT JOIN active_trial AS trial ON true
    LEFT JOIN paid_period ON true
  )
  SELECT
    tariff.mechanics,
    tariff.quotas,
    tariff.system_access_policy,
    tariff.mechanic_access_policies,
    tariff.included_seats,
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
  LEFT JOIN LATERAL app.saas_billing_effective_tariff(effective.organization_id, effective.tariff_id) AS tariff ON true
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
          WHEN statement_timestamp() <= trial.ends_at THEN trial.tariff_id
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
    'TABLE(tariff_mechanics jsonb, tariff_quotas jsonb, tariff_system_access_policy jsonb, tariff_mechanic_access_policies jsonb, included_seats integer, override_mechanic text, override_enabled boolean, override_quota jsonb, override_expires_at timestamp with time zone, seat_limit_override integer, lifecycle text, effective_tariff_id uuid, access_source text, degradation_started_at timestamp with time zone)'
)::int AS e1_current_patient_entitlements_signature_current;
