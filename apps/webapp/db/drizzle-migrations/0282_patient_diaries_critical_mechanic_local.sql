-- TEMPORARY LOCAL MIGRATION NUMBER 0282 — the lead assigns the final number at merge.
-- #1069 item 4a.4: `patient_diaries` becomes a critical mechanic (owner 31.07, "дневники у пациентов
-- не отбираем") — same treatment as `patient_card`/`patient_app`: always full_access, no override or
-- tariff can gate it. CREATE OR REPLACE re-applies owner/ACL grants so this is safe to re-run.

CREATE OR REPLACE FUNCTION app.resolve_organization_mechanic_access(
  p_organization_id uuid,
  p_mechanic text
)
RETURNS TABLE (
  mechanic text,
  state text,
  policy_source text,
  warning jsonb,
  mutation_allowed boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_current_organization_id uuid := app.current_org_id();
  v_now timestamptz := statement_timestamp();
BEGIN
  IF v_current_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_mechanic_access_principal_required'
      USING ERRCODE = '42501';
  END IF;
  IF v_current_organization_id <> p_organization_id THEN
    RAISE EXCEPTION 'organization_mechanic_access_principal_mismatch'
      USING ERRCODE = '42501';
  END IF;
  IF p_mechanic IS NULL OR btrim(p_mechanic) = '' THEN
    RAISE EXCEPTION 'organization_mechanic_access_mechanic_required'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH active_trial AS (
    SELECT trial.*
    FROM public.saas_organization_trials AS trial
    WHERE trial.organization_id = p_organization_id
      AND trial.status = 'active'
    LIMIT 1
  ), effective AS (
    SELECT
      organization.id AS organization_id,
      CASE
        WHEN trial.id IS NULL THEN organization.tariff_id
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
        WHEN trial.id IS NULL AND organization.commercial_access_state = 'compatibility'
          THEN 'compatibility'
        WHEN trial.id IS NULL AND organization.commercial_access_state = 'no_trial'
          THEN 'no_trial'
        WHEN trial.id IS NULL THEN 'assignment'
        WHEN v_now > trial.grace_ends_at AND trial.post_trial_behavior = 'tariff'
          THEN 'post_trial_tariff'
        ELSE 'trial'
      END AS access_source,
      trial.ends_at AS degradation_started_at
    FROM public.be_organizations AS organization
    LEFT JOIN active_trial AS trial ON true
    WHERE organization.id = p_organization_id
      AND organization.is_active = true
  ), snapshot AS (
    SELECT
      effective.*,
      tariff.id AS resolved_tariff_id,
      tariff.mechanics,
      tariff.quotas,
      tariff.system_access_policy,
      tariff.mechanic_access_policies,
      tariff.included_seats,
      entitlement_override.mechanic AS override_mechanic,
      entitlement_override.enabled AS override_enabled,
      COALESCE(
        tariff.mechanic_access_policies -> p_mechanic,
        tariff.system_access_policy
      ) AS policy,
      CASE
        WHEN tariff.mechanic_access_policies ? p_mechanic THEN 'mechanic'
        WHEN tariff.system_access_policy IS NOT NULL THEN 'system'
        ELSE 'unconfigured'
      END AS configured_policy_source
    FROM effective
    LEFT JOIN public.saas_tariffs AS tariff ON tariff.id = effective.tariff_id
    LEFT JOIN public.saas_org_entitlement_overrides AS entitlement_override
      ON entitlement_override.organization_id = effective.organization_id
     AND entitlement_override.mechanic = p_mechanic
     AND (
       entitlement_override.expires_at IS NULL
       OR entitlement_override.expires_at > v_now
     )
  ), included AS (
    SELECT
      snapshot.*,
      CASE
        WHEN p_mechanic = ANY (ARRAY['patient_card', 'patient_app', 'patient_diaries']) THEN true
        WHEN override_mechanic IS NOT NULL THEN override_enabled
        WHEN resolved_tariff_id IS NULL THEN access_source = 'compatibility'
        WHEN p_mechanic = 'clinic_team' THEN included_seats IS NOT NULL
        WHEN p_mechanic = ANY (ARRAY['files', 'patient_count', 'branches'])
          THEN quotas ? p_mechanic
        ELSE COALESCE((mechanics ->> p_mechanic)::boolean, false)
      END AS mechanic_included
    FROM snapshot
  ), resolved AS (
    SELECT
      included.*,
      CASE
        WHEN p_mechanic = ANY (ARRAY['patient_card', 'patient_app', 'patient_diaries']) THEN 'full_access'
        WHEN access_source = 'no_trial' AND resolved_tariff_id IS NULL THEN 'unconfigured'
        WHEN NOT mechanic_included THEN 'disabled'
        WHEN NOT (access_source = 'no_trial' OR lifecycle <> 'active') THEN 'full_access'
        WHEN policy IS NULL THEN 'unconfigured'
        WHEN degradation_started_at IS NOT NULL AND v_now < degradation_started_at
          THEN 'full_access'
        WHEN degradation_started_at IS NOT NULL
          AND (policy ->> 'graceDays')::integer > 0
          AND v_now < degradation_started_at
            + make_interval(days => (policy ->> 'graceDays')::integer)
          THEN 'grace'
        WHEN degradation_started_at IS NOT NULL
          AND (policy ->> 'readOnlyDays')::integer > 0
          AND v_now < degradation_started_at
            + make_interval(days => (policy ->> 'graceDays')::integer)
            + make_interval(days => (policy ->> 'readOnlyDays')::integer)
          THEN 'read_only'
        WHEN degradation_started_at IS NOT NULL THEN policy ->> 'terminalState'
        WHEN lifecycle = 'read_only' THEN 'read_only'
        WHEN lifecycle = 'blocked' OR access_source = 'no_trial'
          THEN policy ->> 'terminalState'
        ELSE 'unconfigured'
      END AS resolved_state,
      CASE
        WHEN degradation_started_at IS NULL THEN NULL
        ELSE degradation_started_at
          + make_interval(days => (policy ->> 'graceDays')::integer)
      END AS grace_ends_at
    FROM included
  )
  SELECT
    p_mechanic,
    resolved_state,
    CASE
      WHEN p_mechanic = ANY (ARRAY['patient_card', 'patient_app', 'patient_diaries']) THEN 'critical'
      WHEN NOT mechanic_included THEN 'unconfigured'
      WHEN NOT (access_source = 'no_trial' OR lifecycle <> 'active') THEN 'system'
      ELSE configured_policy_source
    END,
    CASE
      WHEN resolved_state = 'grace' THEN jsonb_build_object(
        'until', grace_ends_at,
        'count', (policy ->> 'warningCount')::integer,
        'nextState', CASE
          WHEN (policy ->> 'readOnlyDays')::integer > 0 THEN 'read_only'
          ELSE policy ->> 'terminalState'
        END
      )
      ELSE NULL
    END,
    resolved_state = ANY (ARRAY['full_access', 'grace'])
  FROM resolved;
END
$function$;
--> statement-breakpoint
ALTER FUNCTION app.resolve_organization_mechanic_access(uuid, text) OWNER TO app_owner;
REVOKE ALL ON FUNCTION app.resolve_organization_mechanic_access(uuid, text)
  FROM PUBLIC, app_staff, app_patient;
GRANT EXECUTE ON FUNCTION app.resolve_organization_mechanic_access(uuid, text)
  TO app_staff, app_patient;
GRANT SELECT ON TABLE public.be_organizations, public.saas_tariffs,
  public.saas_org_entitlement_overrides, public.saas_organization_trials TO app_owner;
