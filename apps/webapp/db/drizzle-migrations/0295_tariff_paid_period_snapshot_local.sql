-- TEMPORARY LOCAL MIGRATION NUMBER 0295 -- the lead assigns the final number at merge.
-- #1082 §2.12 — ОПЛАЧЕННЫЙ ПЕРИОД ЗАМОРАЖИВАЕТ УСЛОВИЯ ТАРИФА. Owner ruling 01.08, verbatim:
-- «должно быть так: при оплате тарифа все настройки оплаченного тарифа фиксируются на оплаченный
-- период для конкретной клиники. Не важно что меняется после - клиника уже оплатила и пока оплата
-- не закончилась - имеет доступ к оплаченному».
--
-- What was wrong (established by the 01.08 §2.8-2.10 run, not assumed here): the mechanic door,
-- the cabinet door and the patient projection all join `saas_tariffs` LIVE on every call, and the
-- TS staff-snapshot read (`pgOrgEntitlements.ts`) does the same. An operator toggling a mechanic
-- or shrinking a quota takes it away from a clinic mid-period it already paid for — exactly what
-- the ruling forbids.
--
-- What this migration does:
--   1. Adds ONE nullable jsonb column to `saas_billing_subscriptions` — a COPY of the ENTIRE
--      `saas_tariffs` row (`to_jsonb(tariff)`), not a chosen list of fields. Owner 01.08, verbatim:
--      «снимок не надо сверять с переписью, его надо тупо скопировать... целиком». A field list
--      would silently miss any tariff column added later; `to_jsonb` cannot, because it serializes
--      whatever columns the row actually has at the moment it runs.
--   2. Backfills it for subscriptions already inside a live paid period, from their CURRENT tariff
--      row — the best available answer for a period that started before this column existed.
--   3. Adds `app.saas_billing_effective_tariff(organization_id, tariff_id)` — the ONE place that
--      decides frozen vs live. It returns the row rebuilt from the snapshot
--      (`jsonb_populate_record`) when this exact org+tariff pair has a snapshot AND `now()` is
--      still inside that subscription's paid period; otherwise it returns the live `saas_tariffs`
--      row, unchanged. Both doors, the patient projection AND the TS staff-snapshot read all call
--      this SAME function — the frozen/live switch is not duplicated per caller.
--   4. Repoints the three existing `LEFT JOIN public.saas_tariffs` call sites at this function via
--      `LEFT JOIN LATERAL`. Every other line of each function is unchanged, so `CREATE OR REPLACE`
--      is correct here (same rule 0286 already established for this file: composition of columns
--      does not change, so no DROP is needed).
--
-- Not touched: the ladder's own day-counting (`graceDays`/`readOnlyDays`/`terminalState`, §2.9/
-- §2.10) stays exactly as 0286 left it — only WHICH tariff row feeds it changes.
--
-- Manual platform-admin assignment (§2.12 item 5, decided here, not silently in code): assigning a
-- tariff manually ALREADY always opens a paid period the same way a real payment does (§5a item
-- 7.0 / 0286) — `assignManualTariff` never leaves `currentPeriodStartsAt`/`EndsAt` null for a real
-- assignment, only for unassignment. So a manual assignment freezes a snapshot on exactly the same
-- rule as a paid one: the clinic keeps what was configured at the moment of assignment for the
-- rest of that period, and a later edit by the platform admin to the live tariff does not reach it
-- until the period ends. An OPEN-ended manual grant (no tariff, i.e. unassignment) carries no
-- period and no snapshot, same as before.

-- 1. The snapshot column. Nullable: `null` means "no live paid period for this row" (never
--    assigned via a paid/manual period, period already ended, or a legacy row written before this
--    column existed) — the effective-tariff function below treats that identically to no snapshot.
ALTER TABLE public.saas_billing_subscriptions
  ADD COLUMN tariff_snapshot jsonb;
--> statement-breakpoint

-- 2. Backfill: subscriptions already inside a live paid period get the CURRENT tariff row as their
--    snapshot. There is no earlier state to recover — this is the best available answer, and it is
--    exactly what a fresh assignment/payment would have captured had this column existed then.
UPDATE public.saas_billing_subscriptions AS subscription
SET tariff_snapshot = (
      SELECT to_jsonb(tariff) FROM public.saas_tariffs AS tariff WHERE tariff.id = subscription.tariff_id
    ),
    updated_at = now()
WHERE subscription.status = 'active'
  AND subscription.tariff_snapshot IS NULL
  AND subscription.current_period_starts_at IS NOT NULL
  AND subscription.current_period_ends_at > now();
--> statement-breakpoint

-- 3. THE single frozen/live switch. SECURITY DEFINER because `saas_billing_subscriptions` grants
--    no privilege to ambient `app_staff`/`app_patient` (0259: "ambient app_staff receives no
--    billing table privilege") — same boundary reason 0286 gave `app_owner` SELECT on this table.
CREATE OR REPLACE FUNCTION app.saas_billing_effective_tariff(
  p_organization_id uuid,
  p_tariff_id uuid
)
RETURNS SETOF public.saas_tariffs
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_now timestamptz := statement_timestamp();
  v_snapshot jsonb;
BEGIN
  IF p_tariff_id IS NULL THEN
    RETURN;
  END IF;

  SELECT subscription.tariff_snapshot INTO v_snapshot
  FROM public.saas_billing_subscriptions AS subscription
  WHERE subscription.organization_id = p_organization_id
    AND subscription.tariff_id = p_tariff_id
    AND subscription.status = ANY (ARRAY['active', 'expired'])
    AND subscription.tariff_snapshot IS NOT NULL
    AND subscription.current_period_starts_at IS NOT NULL
    AND subscription.current_period_starts_at <= v_now
    AND subscription.current_period_ends_at > v_now
  ORDER BY subscription.current_period_ends_at DESC
  LIMIT 1;

  IF v_snapshot IS NOT NULL THEN
    RETURN QUERY SELECT * FROM jsonb_populate_record(null::public.saas_tariffs, v_snapshot);
    RETURN;
  END IF;

  RETURN QUERY SELECT * FROM public.saas_tariffs WHERE id = p_tariff_id;
END
$function$;
--> statement-breakpoint

ALTER FUNCTION app.saas_billing_effective_tariff(uuid, uuid) OWNER TO app_owner;
REVOKE ALL ON FUNCTION app.saas_billing_effective_tariff(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.saas_billing_effective_tariff(uuid, uuid) TO app_staff, app_patient;
--> statement-breakpoint

-- 4a. Patient projection — repoint at the switch.
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
      CASE
        WHEN trial.id IS NULL AND context.commercial_access_state = 'compatibility' THEN 'compatibility'
        WHEN trial.id IS NULL AND context.commercial_access_state = 'no_trial' THEN 'no_trial'
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
  LEFT JOIN LATERAL app.saas_billing_effective_tariff(effective.organization_id, effective.tariff_id) AS tariff ON true
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

-- 4b. Mechanic door — repoint at the switch.
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
    LEFT JOIN LATERAL app.saas_billing_effective_tariff(effective.organization_id, effective.tariff_id) AS tariff ON true
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
        -- Period exists and has not run out. This is the ONLY «полный доступ навсегда» left: it
        -- lasts exactly as long as the paid period (or the trial) does. Checked before the policy
        -- so a tariff whose ladder is not configured yet still grants access inside a live period.
        WHEN degradation_started_at IS NOT NULL AND v_now < degradation_started_at
          THEN 'full_access'
        -- No period at all: clinics created before tariffs existed (temporary compatibility, canon
        -- §1.1) and any row the backfill above could not date. An ASSIGNED tariff no longer lands
        -- here — assignment now writes a period — so «назначен тариф → полный доступ навсегда»
        -- is gone as a branch.
        WHEN degradation_started_at IS NULL
          AND NOT (access_source = 'no_trial' OR lifecycle <> 'active') THEN 'full_access'
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
      -- Mirrors the no-anchor full-access branch above: an organization with no period at all is
      -- held open by the system, not by a configured mechanic policy.
      WHEN degradation_started_at IS NULL
        AND NOT (access_source = 'no_trial' OR lifecycle <> 'active') THEN 'system'
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

-- 4c. Cabinet door — repoint at the switch. Its `effective` CTE carries no `organization_id`
-- column, so the function's own `p_organization_id` parameter is used directly.
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
    LEFT JOIN LATERAL app.saas_billing_effective_tariff(p_organization_id, effective.tariff_id) AS tariff ON true
  ), resolved AS (
    SELECT
      snapshot.*,
      CASE
        WHEN degradation_started_at IS NOT NULL AND v_now < degradation_started_at
          THEN 'full_access'
        WHEN degradation_started_at IS NULL
          AND NOT (access_source = 'no_trial' OR lifecycle <> 'active') THEN 'full_access'
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
