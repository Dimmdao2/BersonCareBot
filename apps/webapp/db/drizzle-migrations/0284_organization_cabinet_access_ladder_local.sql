-- TEMPORARY LOCAL MIGRATION NUMBER 0284 — the lead assigns the final number at merge.
-- #1069 §5a/2.1a: organization-cabinet entry is a separate system-level ladder subject. It uses
-- the tariff's system_access_policy and never treats a mechanic as the cabinet itself.

CREATE OR REPLACE FUNCTION app.resolve_organization_cabinet_access(
  p_organization_id uuid
)
RETURNS TABLE (
  state text,
  policy_source text,
  warning jsonb
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
    RAISE EXCEPTION 'organization_cabinet_access_principal_required'
      USING ERRCODE = '42501';
  END IF;
  IF v_current_organization_id <> p_organization_id THEN
    RAISE EXCEPTION 'organization_cabinet_access_principal_mismatch'
      USING ERRCODE = '42501';
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
      tariff.system_access_policy AS policy
    FROM effective
    LEFT JOIN public.saas_tariffs AS tariff ON tariff.id = effective.tariff_id
  ), resolved AS (
    SELECT
      snapshot.*,
      CASE
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
    FROM snapshot
  )
  SELECT
    resolved_state,
    CASE WHEN policy IS NULL THEN 'unconfigured' ELSE 'system' END,
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
    END
  FROM resolved;
END
$function$;
--> statement-breakpoint
ALTER FUNCTION app.resolve_organization_cabinet_access(uuid) OWNER TO app_owner;
REVOKE ALL ON FUNCTION app.resolve_organization_cabinet_access(uuid)
  FROM PUBLIC, app_staff, app_patient;
GRANT EXECUTE ON FUNCTION app.resolve_organization_cabinet_access(uuid)
  TO app_staff, app_patient;
GRANT SELECT ON TABLE public.be_organizations, public.saas_tariffs,
  public.saas_organization_trials TO app_owner;
