-- BCB-MIGRATION-OWNER: app_seam_specialist_provision_owner
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- TEMPORARY LOCAL MIGRATION NUMBER 0024
--
-- Решение владельца 18.08 (L-11), дословно: «про клинику, у которой он уже закончился: она выбирает
-- платный тариф — ИДЕТ ОПЛАЧИВАТЬ И ПОТОМ ПОЛУЧАЕТ ДОСТУП».
--
-- Что было не так. Функция писала `be_organizations.tariff_id = p_tariff_id` БЕЗУСЛОВНО — до любого
-- счёта и до любой оплаты — и только потом решала, отдать ли `payment_required`. А `tariff_id`
-- организации и есть «действующий тариф»: из него `resolveCommercialAccess`/
-- `app.read_current_patient_organization_entitlements()` берут ветку `assignment`, а из неё —
-- полный набор механик. У организации С записью о пробном периоде это пока не проявлялось (ветка
-- пробного выходит раньше и до назначения не доходит), у организации БЕЗ такой записи выбор
-- платного тарифа немедленно открывал все его механики бесплатно.
--
-- Как теперь. Разведены две разные вещи, которые раньше писались одной строкой:
--   ВЫБРАНО  — строка подписки `saas_billing_subscriptions(organization_id, 'paid_subscription')`
--              с `tariff_id = <выбранный>` и `status = 'pending_payment'`. Она пишется всегда: по
--              ней клиника видит свой выбор и по ней же выставляется счёт.
--   ДЕЙСТВУЕТ — `be_organizations.tariff_id`. Пишется здесь ТОЛЬКО когда реально начался пробный
--              период (он и есть доступ без оплаты, отдельная настройка владельца), а в платном
--              случае — не пишется вовсе: тариф вступает в силу единственным существующим путём,
--              `app.apply_paid_saas_billing_tariff`, по факту оплаты счёта.
--
-- Почему не `pending_tariff_id`. Эта колонка means «уже действующий тариф сменится на другой на
-- границе периода» и читается правилом `purchasedTariffId` (`modules/saas-billing/payableTariff.ts`)
-- как «что покупают вместо текущего». У первого выбора текущего тарифа нет вообще, поэтому запись
-- туда сделала бы экран «запланированной сменой» того, что ещё ни разу не начиналось. Носитель
-- «выбрано, но не действует» уже есть — это сама строка подписки в `pending_payment`.
--
-- Журнал. `saas_registration_tariff_assign` остаётся ровно там, где назначение реально произошло
-- (пробный период). Выбор без оплаты пишется своим действием `saas_tariff_choice_pending_payment` —
-- иначе журнал утверждал бы назначение, которого не было.
CREATE OR REPLACE FUNCTION app.choose_organization_first_tariff(
  p_tariff_id uuid,
  p_actor_id uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_organization_id uuid := app.current_org_id();
  v_policy record;
  v_started_at timestamptz;
  v_trial_id uuid;
  v_has_prior_trial boolean;
  v_account_id uuid;
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_specialist_provision_owner'::name,
    ARRAY['app_clinic_billing'::name, 'app_staff'::name]::name[]
  );

  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_context_required';
  END IF;

  -- Тариф уже действует — это не первый выбор, а смена; у неё свой путь.
  PERFORM 1
  FROM public.be_organizations AS org
  WHERE org.id = v_organization_id
    AND org.tariff_id IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'organization_tariff_already_assigned';
  END IF;

  PERFORM 1
  FROM public.saas_tariffs AS tariff
  WHERE tariff.id = p_tariff_id
    AND tariff.is_active;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tariff_not_found';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.saas_organization_trials AS trial
    WHERE trial.organization_id = v_organization_id
  )
  INTO v_has_prior_trial;

  -- ВЫБРАНО. Пишется в обоих исходах: и когда начнётся пробный период, и когда клиника идёт платить.
  -- Повторный выбор до оплаты просто переписывает эту же строку — счёт выставляется на то, что
  -- выбрано последним.
  INSERT INTO public.saas_billing_accounts AS account (organization_id)
  VALUES (v_organization_id)
  ON CONFLICT (organization_id) DO UPDATE
  SET updated_at = now()
  RETURNING account.id INTO v_account_id;

  INSERT INTO public.saas_billing_subscriptions AS subscription (
    organization_id,
    saas_billing_account_id,
    tariff_id,
    source,
    status,
    lifecycle_state
  )
  VALUES (
    v_organization_id,
    v_account_id,
    p_tariff_id,
    'paid_subscription',
    'pending_payment',
    'active'
  )
  ON CONFLICT (organization_id, source) DO UPDATE
  SET tariff_id = EXCLUDED.tariff_id,
      status = 'pending_payment',
      lifecycle_state = 'active',
      updated_at = now(),
      current_period_starts_at = NULL,
      current_period_ends_at = NULL,
      pending_tariff_id = NULL,
      tariff_snapshot = NULL;

  -- Пробный период даётся организации один раз и тарифом не управляется: его длительность, точка
  -- отсчёта и поведение после окончания — строка `saas_trial_policy`, которую владелец правит в
  -- кабинете глобального админа. Здесь читается настройка, а не значения.
  IF NOT v_has_prior_trial THEN
    SELECT
      policy.duration_days,
      policy.discount_window_days,
      policy.post_trial_behavior,
      policy.post_trial_tariff_id,
      policy.start_event
    INTO v_policy
    FROM public.saas_trial_policy AS policy
    WHERE policy.key = 'global'
      AND policy.is_active
    LIMIT 1;

    IF FOUND THEN
      v_started_at := clock_timestamp();

      INSERT INTO public.saas_organization_trials (
        organization_id, tariff_id, started_at, ends_at, discount_ends_at,
        post_trial_behavior, post_trial_tariff_id, status, created_by
      ) VALUES (
        v_organization_id,
        p_tariff_id,
        v_started_at,
        v_started_at + make_interval(days => v_policy.duration_days),
        v_started_at + make_interval(days => v_policy.duration_days + v_policy.discount_window_days),
        v_policy.post_trial_behavior,
        v_policy.post_trial_tariff_id,
        'active',
        p_actor_id
      )
      ON CONFLICT (organization_id) DO NOTHING
      RETURNING id INTO v_trial_id;
    END IF;
  END IF;

  IF v_trial_id IS NULL THEN
    -- Сначала оплата. `be_organizations.tariff_id` НЕ трогаем: доступ откроет
    -- `app.apply_paid_saas_billing_tariff`, когда счёт станет `paid`.
    INSERT INTO public.admin_audit_log (
      organization_id, actor_id, action, target_id, details, status
    ) VALUES (
      v_organization_id,
      p_actor_id,
      'saas_tariff_choice_pending_payment',
      p_tariff_id::text,
      jsonb_build_object(
        'reason', 'clinic first tariff choice awaits payment',
        'before', NULL,
        'after', jsonb_build_object('tariffId', p_tariff_id)
      ),
      'ok'
    );

    RETURN jsonb_build_object('outcome', 'payment_required');
  END IF;

  -- ДЕЙСТВУЕТ. Единственный случай, когда первый выбор сам открывает доступ, — начавшийся пробный
  -- период: он по решению владельца даётся организации при первом входе и оплаты не требует.
  UPDATE public.be_organizations
  SET tariff_id = p_tariff_id,
      updated_at = now()
  WHERE id = v_organization_id;

  INSERT INTO public.admin_audit_log (
    organization_id, actor_id, action, target_id, details, status
  ) VALUES (
    v_organization_id,
    p_actor_id,
    'saas_registration_tariff_assign',
    p_tariff_id::text,
    jsonb_build_object(
      'reason', 'clinic first tariff choice trial',
      'before', NULL,
      'after', jsonb_build_object('tariffId', p_tariff_id)
    ),
    'ok'
  );

  INSERT INTO public.admin_audit_log (
    organization_id, actor_id, action, target_id, details, status
  ) VALUES (
    v_organization_id,
    p_actor_id,
    'saas_trial_start',
    v_trial_id::text,
    jsonb_build_object(
      'reason', 'clinic first tariff choice trial',
      'before', NULL,
      'after', jsonb_build_object(
        'tariffId', p_tariff_id,
        'durationDays', v_policy.duration_days,
        'discountWindowDays', v_policy.discount_window_days,
        'startEvent', v_policy.start_event,
        'postTrialBehavior', v_policy.post_trial_behavior,
        'postTrialTariffId', v_policy.post_trial_tariff_id
      )
    ),
    'ok'
  );

  RETURN jsonb_build_object(
    'outcome', 'trial_started',
    'endsAt', (v_started_at + make_interval(days => v_policy.duration_days))::text,
    'trialId', v_trial_id::text
  );
END
$function$;
