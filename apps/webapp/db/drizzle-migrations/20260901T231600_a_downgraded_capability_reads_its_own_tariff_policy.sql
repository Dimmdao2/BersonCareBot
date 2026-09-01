-- BCB-MIGRATION-OWNER: app_seam_org_commerce_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT position('downgrade_policies' in pg_get_functiondef(to_regprocedure('app.resolve_organization_mechanic_access(uuid,text)'))) > 0
--
-- §5a 4b.3/4b.4 (owner 30.07, re-opened by code sweep 20.08): a capability mechanic's downgrade
-- policy offers three values — `block` (already refused earlier, at transition time) ·
-- `disable_immediately` · `read_only` — but this door only ever emitted `disabled` for an excluded
-- mechanic, so the two capability values that DID reach here (`disable_immediately`, `read_only`)
-- produced the identical final state. `downgradePolicies` is already stored per tariff
-- (`0281_…downgrade_policy…`, `saas_tariffs.downgrade_policies`) and already reaches this function
-- through the existing `saas_billing_effective_tariff` LATERAL join — it only needed to be
-- SELECTed and READ. No new column, no second evaluator: `checkEntitlement` in
-- `requireEntitlement.ts` already branches on `state === 'read_only'` vs `'disabled'` correctly for
-- every mechanic; this door was the one link not producing the distinction.
--
-- Forward `CREATE OR REPLACE` of the same signature; body is the one from
-- `20260819T210005_a_clinic_is_billed_for_seats_not_for_people.sql` (that migration is applied on
-- every stand and is not edited) with `tariff.downgrade_policies` added to the snapshot and read in
-- the `NOT mechanic_included` branch. Numeric mechanics (`freeze_growth`/`block`) never reach this
-- branch at all — `included` already treats `files`/`branches` as always-included, so their own
-- write door (`transactionQuotaPort`) is what freezes growth, exactly as before this migration.

CREATE OR REPLACE FUNCTION app.resolve_organization_mechanic_access(p_organization_id uuid, p_mechanic text)
 RETURNS TABLE(mechanic text, state text, policy_source text, warning jsonb, mutation_allowed boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_current_organization_id uuid := app.current_org_id();
  v_now timestamptz := statement_timestamp();
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_org_commerce_owner'::name, ARRAY['app_patient'::name, 'app_staff'::name, 'app_tenant_service'::name]::name[]);

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
  ), global_paid_policy AS (
    SELECT
      policy.post_paid_period_behavior,
      policy.post_paid_period_tariff_id
    FROM public.saas_paid_period_policy AS policy
    WHERE policy.key = 'global'
      AND policy.is_active = true
    LIMIT 1
  ), effective AS (
    SELECT
      organization.id AS organization_id,
      CASE
        WHEN trial.id IS NOT NULL AND v_now <= trial.ends_at THEN trial.tariff_id
        WHEN trial.id IS NOT NULL AND trial.post_trial_behavior = 'tariff' THEN trial.post_trial_tariff_id
        WHEN trial.id IS NOT NULL THEN trial.tariff_id
        WHEN paid_period.period_ends_at IS NOT NULL
          AND v_now >= paid_period.period_ends_at
          AND global_paid_policy.post_paid_period_behavior = 'tariff'
          THEN global_paid_policy.post_paid_period_tariff_id
        ELSE organization.tariff_id
      END AS tariff_id,
      CASE
        WHEN trial.id IS NULL
          AND paid_period.period_ends_at IS NOT NULL
          AND v_now >= paid_period.period_ends_at
          AND global_paid_policy.post_paid_period_behavior IS NOT NULL
          THEN CASE
            WHEN global_paid_policy.post_paid_period_behavior = 'tariff' THEN 'active'
            ELSE global_paid_policy.post_paid_period_behavior
          END
        WHEN trial.id IS NULL THEN 'active'
        WHEN v_now <= trial.ends_at THEN 'active'
        WHEN trial.post_trial_behavior = 'tariff' THEN 'active'
        ELSE trial.post_trial_behavior
      END AS lifecycle,
      CASE
        WHEN trial.id IS NULL
          AND paid_period.period_ends_at IS NOT NULL
          AND v_now >= paid_period.period_ends_at
          AND global_paid_policy.post_paid_period_behavior = 'tariff'
          THEN 'post_paid_period_tariff'
        WHEN trial.id IS NULL THEN 'assignment'
        WHEN v_now > trial.ends_at AND trial.post_trial_behavior = 'tariff' THEN 'post_trial_tariff'
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
    LEFT JOIN global_paid_policy ON true
    WHERE organization.id = p_organization_id
      AND organization.is_active = true
  ), snapshot AS (
    SELECT
      effective.*,
      tariff.id AS resolved_tariff_id,
      tariff.mechanics,
      tariff.quotas,
      tariff.system_access_policy,
      tariff.included_seats,
      -- §5a 4b.3/4b.4 — the value the owner stored for THIS mechanic on THIS tariff; read once
      -- here so the `resolved` CTE below can select behaviour by data instead of adding a branch.
      tariff.downgrade_policies,
      entitlement_override.mechanic AS override_mechanic,
      entitlement_override.enabled AS override_enabled,
      tariff.system_access_policy AS policy,
      CASE
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
  ), policy_history AS (
    -- §5a 2.9/2.10: tariff edits are live once a paid period has ended, but an edit must not
    -- retroactively erase a stage already earned by the organization. The tariff audit already
    -- keeps the exact before/after row and edit time, so it is the data boundary without a second
    -- per-organization snapshot. Only changes after this organization's degradation anchor matter.
    SELECT
      audit.created_at,
      audit.details -> 'before' -> 'systemAccessPolicy' AS previous_policy
    FROM public.admin_audit_log AS audit
    WHERE audit.action = 'saas_tariff_update'
      AND audit.target_id = (SELECT resolved_tariff_id::text FROM snapshot)
      AND audit.created_at > (SELECT degradation_started_at FROM snapshot)
  ), policy_timing AS (
    SELECT
      snapshot.*,
      CASE
        WHEN degradation_started_at IS NULL OR policy IS NULL THEN NULL
        ELSE GREATEST(
          degradation_started_at
            + make_interval(days => (policy ->> 'graceDays')::integer),
          COALESCE(
            (
              SELECT max(
                degradation_started_at
                  + make_interval(days => (previous_policy ->> 'graceDays')::integer)
              )
              FROM policy_history
            ),
            '-infinity'::timestamptz
          )
        )
      END AS grace_ends_at
    FROM snapshot
  ), policy_schedule AS (
    SELECT
      policy_timing.*,
      CASE
        WHEN policy_timing.grace_ends_at IS NULL OR policy IS NULL THEN NULL
        ELSE GREATEST(
          policy_timing.grace_ends_at
            + make_interval(days => (policy ->> 'readOnlyDays')::integer),
          COALESCE(
            (
              SELECT max(
                policy_timing.grace_ends_at
                  + make_interval(days => (previous_policy ->> 'readOnlyDays')::integer)
              )
              FROM policy_history
              WHERE policy_history.created_at >= policy_timing.grace_ends_at
            ),
            '-infinity'::timestamptz
          )
        )
      END AS read_only_ends_at
    FROM policy_timing
  ), included AS (
    SELECT
      policy_schedule.*,
      CASE
        WHEN p_mechanic = ANY (ARRAY['patient_card', 'patient_app', 'patient_diaries']) THEN true
        WHEN override_mechanic IS NOT NULL THEN override_enabled
        -- #1069 §2.13 (owner 01.08): «нет активного тарифа и нет триала → доступа нет» — no
        -- compatibility carve-out survives for an organization with no resolved tariff at all.
        WHEN resolved_tariff_id IS NULL THEN false
        WHEN p_mechanic = 'clinic_team' THEN included_seats IS NOT NULL
        -- Owner 18.08 (L-1): «ТАМ НЕ НАДО ВООБЩЕ СТАВИТЬ ВАРИАНТ ВЫКЛЮЧЕН — ЛИБО ЛИМИТ ЛИБО БЕЗ
        -- ЛИМИТА для всех таких механик с лимитом». A limit-bearing mechanic has no OFF state:
        -- its quota answers «сколько», never «есть ли», so a tariff that named no number states
        -- «без лимита» and the mechanic stays included. The ceiling is enforced where it belongs,
        -- in the write transaction (decideStockQuota); «нет доступа» remains expressible as an
        -- organization override (enabled = false) or a numeric limit of 0.
        --
        -- Т12 (владелец 19.08, дословно): «лимит клиентов - убрать». `patient_count` вышел из этого
        -- списка вместе с самой механикой: у неё больше нет ни числа в тарифе, ни проверки на
        -- записи, поэтому решать про неё здесь стало нечего. Осталось два штучных числа.
        WHEN p_mechanic = ANY (ARRAY['files', 'branches']) THEN true
        ELSE COALESCE((mechanics ->> p_mechanic)::boolean, false)
      END AS mechanic_included
    FROM policy_schedule
  ), resolved AS (
    SELECT
      included.*,
      CASE
        WHEN p_mechanic = ANY (ARRAY['patient_card', 'patient_app', 'patient_diaries']) THEN 'full_access'
        WHEN resolved_tariff_id IS NULL THEN 'unconfigured'
        -- §5a 4b.3/4b.4: this tariff excludes the mechanic — which final state depends on the
        -- VALUE this tariff stored for it, not on a mechanic name. `disable_immediately` and an
        -- unset policy both fail closed to `disabled` (fail-closed default, same as before this
        -- migration); `read_only` is the one value that keeps read access instead.
        WHEN NOT mechanic_included THEN
          CASE
            WHEN downgrade_policies ->> p_mechanic = 'read_only' THEN 'read_only'
            ELSE 'disabled'
          END
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
          AND v_now < included.grace_ends_at
          THEN 'grace'
        WHEN degradation_started_at IS NOT NULL
          AND v_now < included.read_only_ends_at
          THEN 'read_only'
        WHEN degradation_started_at IS NOT NULL THEN policy ->> 'terminalState'
        WHEN lifecycle = 'read_only' THEN 'read_only'
        WHEN lifecycle = 'blocked' THEN policy ->> 'terminalState'
        ELSE 'unconfigured'
      END AS resolved_state
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
        'until', resolved.grace_ends_at,
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
$function$
