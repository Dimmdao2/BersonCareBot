-- TEMPORARY LOCAL MIGRATION NUMBER 0296 -- the lead assigns the final number at merge.
-- #1069 §2.13: ЧЕТЫРЁХ СОСТОЯНИЙ ДОСТУПА НЕ СУЩЕСТВУЕТ — ВЫРЕЗАТЬ.
--
-- Owner 01.08, verbatim: «Совместимость это бред - вырезай нахуй полностью», «клиника
-- зарегистрирована - получает либо триал либо отправляется на оплату тарифа», «без триала - бред»,
-- «единственное что надо это какой выбран или назначен тариф. триал - это не состояние клиники,
-- это состояние доступа к тарифу без реальной оплаты».
--
-- What goes: `be_organizations.commercial_access_state` (`compatibility` / `no_trial` /
-- `trial_pending` / `active`, migration 0225) and every branch reading it. `trial_pending` was never
-- written by any code path — the gap it modeled never existed in practice.
--
-- What this does NOT touch (#1069 §2.13 boundary — the ladder, its policy and the paid-period
-- freeze stay exactly as 0286 left them):
--   * the grace/read_only/terminal arithmetic and its policy-is-data behaviour;
--   * the paid-period anchor (`saas_billing_subscriptions.current_period_ends_at`) and the
--     assigned-tariff-with-no-period "full access, nothing to measure from" branch — that one is
--     NOT the removed `compatibility` state (an org in it always has a resolved tariff); it is the
--     separate case §2.12/7.0 protects.
--
-- The only real behaviour change: an organization with NEITHER a resolved tariff NOR an active
-- trial now gets NO access anywhere (mechanic door, cabinet door, patient projection), instead of
-- the old `compatibility`/`no_trial` split silently deciding that for it. Composition unchanged,
-- so `CREATE OR REPLACE` is correct here (see 0286's note on why that failed once for a column-set
-- change; this migration's function signatures are identical to 0286's).

-- 1. Patient projection: drop the raw column from the read and collapse the four-state branch to
--    the two real sources — an active trial, or a plain assignment.
CREATE OR REPLACE FUNCTION app.read_current_patient_organization_entitlements()
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
    -- §5a item 7.0. `expired` keeps its period on purpose: once a period lapses, dropping the anchor
    -- would hand the organization full access back, which is the opposite of what non-payment means.
    -- `pending_payment` and `cancelled` grant nothing, so they carry no anchor.
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
      -- #1069 §2.13 — no raw state to branch on: without a trial the source is always a plain
      -- assignment (assigned tariff or none at all; a missing tariff is decided by `tariff_id`).
      CASE
        WHEN trial.id IS NULL THEN 'assignment'
        WHEN v_now > trial.grace_ends_at AND trial.post_trial_behavior = 'tariff' THEN 'post_trial_tariff'
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

-- 2. Mechanic door.
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
  ), paid_period AS (
    SELECT max(subscription.current_period_ends_at) AS period_ends_at
    FROM public.saas_billing_subscriptions AS subscription
    WHERE subscription.organization_id = p_organization_id
      AND subscription.status = ANY (ARRAY['active', 'expired'])
      AND subscription.current_period_ends_at IS NOT NULL
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
      -- #1069 §2.13 — same collapse as the patient projection above.
      CASE
        WHEN trial.id IS NULL THEN 'assignment'
        WHEN v_now > trial.grace_ends_at AND trial.post_trial_behavior = 'tariff' THEN 'post_trial_tariff'
        ELSE 'trial'
      END AS access_source,
      COALESCE(trial.ends_at, paid_period.period_ends_at) AS degradation_started_at,
      -- Which clock the ladder is running on. The door cannot tell non-payment from an expired
      -- trial without this, and «условие: ошибка оплаты» has to follow the real one.
      CASE
        WHEN trial.ends_at IS NOT NULL THEN 'trial'
        WHEN paid_period.period_ends_at IS NOT NULL THEN 'paid_period'
        ELSE NULL
      END AS period_source
    FROM public.be_organizations AS organization
    LEFT JOIN active_trial AS trial ON true
    LEFT JOIN paid_period ON true
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
        -- #1069 §2.13 (owner 01.08): «нет активного тарифа и нет триала → доступа нет» — no
        -- compatibility carve-out survives for an organization with no resolved tariff at all.
        WHEN resolved_tariff_id IS NULL THEN false
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
        WHEN resolved_tariff_id IS NULL THEN 'unconfigured'
        WHEN NOT mechanic_included THEN 'disabled'
        -- Period exists and has not run out. This is the ONLY «полный доступ навсегда» left: it
        -- lasts exactly as long as the paid period (or the trial) does. Checked before the policy
        -- so a tariff whose ladder is not configured yet still grants access inside a live period.
        WHEN degradation_started_at IS NOT NULL AND v_now < degradation_started_at
          THEN 'full_access'
        -- No period at all: an assigned tariff with nothing yet to measure from (§2.12/7.0 keeps
        -- this open, on purpose — not the removed `compatibility` state, which needed no tariff at
        -- all; `resolved_tariff_id IS NULL` above already excludes that case here).
        WHEN degradation_started_at IS NULL AND lifecycle = 'active' THEN 'full_access'
        WHEN policy IS NULL THEN 'unconfigured'
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
        WHEN lifecycle = 'blocked' THEN policy ->> 'terminalState'
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
      -- Mirrors the no-anchor full-access branch above: an assigned tariff with no period at all is
      -- held open by the system, not by a configured mechanic policy.
      WHEN degradation_started_at IS NULL AND lifecycle = 'active' THEN 'system'
      ELSE configured_policy_source
    END,
    CASE
      WHEN resolved_state = 'grace' THEN jsonb_build_object(
        'until', grace_ends_at,
        'periodEndsAt', degradation_started_at,
        'periodSource', period_source,
        'notifications', COALESCE(policy -> 'notifications', '[]'::jsonb),
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
--> statement-breakpoint

-- 3. Cabinet door. Unlike the mechanic door, it has no early "no tariff at all" branch of its own
--    (no `mechanic_included` concept) — the eternal-full-access branch below needs its own
--    `resolved_tariff_id IS NOT NULL` guard so a tariff-less organization falls through to
--    `policy IS NULL` (`unconfigured`) instead of being let in by `lifecycle = 'active'` alone.
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
  ), paid_period AS (
    SELECT max(subscription.current_period_ends_at) AS period_ends_at
    FROM public.saas_billing_subscriptions AS subscription
    WHERE subscription.organization_id = p_organization_id
      AND subscription.status = ANY (ARRAY['active', 'expired'])
      AND subscription.current_period_ends_at IS NOT NULL
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
      -- #1069 §2.13 — same collapse as the other two doors.
      CASE
        WHEN trial.id IS NULL THEN 'assignment'
        WHEN v_now > trial.grace_ends_at AND trial.post_trial_behavior = 'tariff' THEN 'post_trial_tariff'
        ELSE 'trial'
      END AS access_source,
      COALESCE(trial.ends_at, paid_period.period_ends_at) AS degradation_started_at,
      CASE
        WHEN trial.ends_at IS NOT NULL THEN 'trial'
        WHEN paid_period.period_ends_at IS NOT NULL THEN 'paid_period'
        ELSE NULL
      END AS period_source
    FROM public.be_organizations AS organization
    LEFT JOIN active_trial AS trial ON true
    LEFT JOIN paid_period ON true
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
        WHEN degradation_started_at IS NOT NULL AND v_now < degradation_started_at
          THEN 'full_access'
        -- #1069 §2.13: without a resolved tariff there is nothing to hold access open with —
        -- `resolved_tariff_id IS NOT NULL` is what used to be carried by the `compatibility` state.
        WHEN degradation_started_at IS NULL
          AND resolved_tariff_id IS NOT NULL AND lifecycle = 'active' THEN 'full_access'
        WHEN policy IS NULL THEN 'unconfigured'
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
        WHEN lifecycle = 'blocked' THEN policy ->> 'terminalState'
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
        'periodEndsAt', degradation_started_at,
        'periodSource', period_source,
        'notifications', COALESCE(policy -> 'notifications', '[]'::jsonb),
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
--> statement-breakpoint

-- 4. The staff-write guard trigger (migration 0225) named the column explicitly; it has to be
--    dropped and recreated rather than altered, and the function body's own reference goes too.
CREATE OR REPLACE FUNCTION app.reject_staff_commercial_organization_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
BEGIN
  IF current_user = 'app_staff'
     AND NEW.tariff_id IS DISTINCT FROM OLD.tariff_id THEN
    RAISE EXCEPTION 'platform_commercial_capability_required';
  END IF;
  RETURN NEW;
END;
$function$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS be_organizations_staff_commercial_columns_guard ON public.be_organizations;
CREATE TRIGGER be_organizations_staff_commercial_columns_guard
  BEFORE UPDATE OF tariff_id ON public.be_organizations
  FOR EACH ROW EXECUTE FUNCTION app.reject_staff_commercial_organization_update();
--> statement-breakpoint

-- 5. The column itself. Drops its CHECK constraint and its index
--    (`idx_be_organizations_commercial_access_state`) with it — both depend solely on this column.
ALTER TABLE "be_organizations" DROP COLUMN IF EXISTS "commercial_access_state";
