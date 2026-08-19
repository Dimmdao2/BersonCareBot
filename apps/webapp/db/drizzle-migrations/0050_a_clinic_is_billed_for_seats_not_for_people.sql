-- BCB-MIGRATION-BACKFILL
-- TEMPORARY LOCAL MIGRATION NUMBER 0050
--
-- Решение владельца 19.08, дословно (`docs/OWNER_DECISIONS.md` → Т12): «лимит клиентов - убрать».
-- Толкование там же: количество клиентов клиникой не ограничивается ни в одном тарифе; считаем и
-- продаём рабочие места, а не людей в базе; лимит убирается ЦЕЛИКОМ — из тарифа, из проверки и из
-- экранов, а НЕ выставляется в «бесконечность».
--
-- ШАГ 1 (этот statement) — данные. Механику убирают из кода тем же коммитом, и после этого ни один
-- читатель на ключ `patient_count` не смотрит. Оставить строки значило бы держать в базе число,
-- которое администратор увидит выгрузкой и примет за действующий лимит, а на поведение оно уже не
-- влияет. Поэтому ключ вычищается из ВСЕХ карт тарифа: `quotas` — само число, `mechanics` — флаг
-- включения, если он там когда-то оказался, `downgrade_policies` — правило при понижении,
-- `mechanic_access_policies` — лестница доступа.
--
-- «Бесконечность» здесь СОЗНАТЕЛЬНО не проставляется: `{"kind":"unlimited"}` — это по-прежнему
-- настроенный лимит, который виден в конструкторе и который кто-нибудь однажды поправит обратно.

UPDATE public.saas_tariffs
SET quotas = quotas - 'patient_count',
    mechanics = mechanics - 'patient_count',
    downgrade_policies = downgrade_policies - 'patient_count',
    mechanic_access_policies = mechanic_access_policies - 'patient_count',
    updated_at = now()
WHERE quotas ? 'patient_count'
   OR mechanics ? 'patient_count'
   OR downgrade_policies ? 'patient_count'
   OR mechanic_access_policies ? 'patient_count';
--> statement-breakpoint
-- BCB-MIGRATION-BACKFILL
--
-- ШАГ 2 — персональные оверрайды организаций по этой механике. Строка тут несёт либо `enabled`,
-- либо своё число `quota`; и то и другое теперь мёртвый груз. Прочитать её больше некому:
-- `readQuotaContext` ищет строку по имени механики, а такой механики в реестре нет.

DELETE FROM public.saas_org_entitlement_overrides
WHERE mechanic = 'patient_count';
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_org_commerce_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
--
-- ШАГ 3 — живая дверь решения о механике. `0022_quota_mechanics_have_no_off_state.sql` перечислял
-- `patient_count` среди механик-с-числом, которые всегда включены. Старая миграция не правится
-- (она уже применена на стендах) — это форвард-`CREATE OR REPLACE` той же сигнатуры: изменена одна
-- строка списка, остальное тело перенесено дословно из 0022.
--
-- Прав тут нет и быть не может (AGENTS.md §1): владелец функции и EXECUTE на неё приходят шагом
-- reconcile из `deploy/postgres/generated/privileges.<база>.sql`, а не отсюда.

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
