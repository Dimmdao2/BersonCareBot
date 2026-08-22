-- BCB-MIGRATION-OWNER: app_seam_specialist_provision_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname IN ('app','app_ext','integrator') AND pg_catalog.strpos(p.prosrc, 'policy.tariff_id') > 0) AND (SELECT pg_catalog.strpos(p.prosrc, 'discount_ends_at') > 0 AND pg_catalog.strpos(p.prosrc, 'grace_ends_at') = 0 AND pg_catalog.strpos(p.prosrc, 'grace_days') = 0 FROM pg_catalog.pg_proc p WHERE p.oid = 'app.start_provisioned_organization_trial()'::regprocedure);
--
-- Б2 (owner blocker, 22.08.2026): живая регистрация клиники на TEST доходит до подтверждения кода и
-- умирает на выдаче — `POST /api/auth/specialist-signup/confirm` отдаёт `503 provisioning_pending`, а
-- в журнале PostgreSQL под `bcb_test_webapp_patient` в ту же секунду:
--
--   42703 ERROR: column policy.tariff_id does not exist
--
-- Тело `app.start_provisioned_organization_trial()` в каталоге осталось в редакции ДО перестройки
-- триальной модели (#1069 Т5/Т6, решения владельца 03.08) и называет четыре имени, которых в его
-- таблицах нет ни на DEV, ни на TEST, ни в эталонном снимке
-- `deploy/postgres/generated/prod-to-target/schema-pre.sql`:
--
--   `policy.tariff_id`      — у `public.saas_trial_policy` такой колонки НЕТ (есть
--                             `post_trial_tariff_id`, и это тариф ПОСЛЕ трила);
--   `v_policy.tariff_id`    — то же имя, прочитанное из `SELECT policy.*`;
--   `v_policy.grace_days`   — колонка снята, её место заняла `discount_window_days`;
--   `grace_ends_at`         — у `public.saas_organization_trials` колонка называется
--                             `discount_ends_at`.
--
-- Функция сломана с рождения этой перестройки и просто ни разу не исполнялась: до неё не доходили,
-- потому что раньше падали более ранние стены (закрыты 22.08). 42703 поднимается на ПЕРВОМ живом
-- вызове — ровно тот класс отказа, о котором предупреждает AGENTS.md §1 («Перед приземлением
-- миграции — разбор её прав»): миграция, reconcile и деплой зелёные, а человек остаётся без клиники.
--
-- ЧТО ТЕЛО ДОЛЖНО ДЕЛАТЬ. Пробная подписка НЕ несёт собственного тарифа: «the trial is a one-time
-- period on the organization's FIRST tariff, whatever it is … It is no longer bound to its own
-- tariff (there is no `tariffId` here)» (`apps/webapp/db/schema/saasEntitlements.ts`, шапка
-- `saasTrialPolicy`, решение владельца 03.08 Т5). На пути автоматической выдачи первый тариф — это
-- настройка регистрации `public.saas_registration_tariff_policy.tariff_id`, которую тело уже читает
-- отдельным запросом в `v_registration_tariff_id`. Тариф ПОСЛЕ трила — `post_trial_tariff_id` при
-- `post_trial_behavior = 'tariff'` (`20260819T210005_a_clinic_is_billed_for_seats_not_for_people.sql`
-- :111 и далее — `app.resolve_organization_mechanic_access` читает пару именно так). Продуктового
-- выбора владельца здесь нет: две живые реализации того же старта трила в приложении уже написаны
-- ровно так — `apps/webapp/src/infra/repos/pgSaasBilling.ts:846` (`startOrganizationTrial`:
-- `tariffId` приходит снаружи, `discountEndsAt = endsAt + discountWindowDays`) и
-- `apps/webapp/src/infra/repos/pgPlatformEntitlements.ts:242` (`startTrialForOrganization`:
-- `tariffId: organization.tariffId`, тот же расчёт окна). Обе не читают у политики никакого
-- «тарифа трила» — его там нет.
--
-- ОТКУДА ВЗЯТО ТЕЛО. Правильная редакция уже лежит в репозитории —
-- `deploy/postgres/c5a-platform-operations-runtime.sql:733`, runtime-overlay, который применяет
-- rehydrate, а не reconcile; именно поэтому в каталог DEV/TEST она никогда не доехала, и её же
-- считает эталоном соседнее живое доказательство
-- `deploy/postgres/privileges/specialist-owner-provisioning.devDbProof.test.mjs`. Эта миграция
-- переносит её в каталог дословно и добавляет ровно одно, чего в overlay нет и быть не может:
-- аттестованный гейт первым исполняемым оператором. Текст гейта взят побайтно из `pg_proc`
-- именованной DEV и совпадает знак в знак со строкой, которую рендерит генератор
-- (`deploy/postgres/generated/privileges.bcb_webapp_dev.sql:2430` и одноимённая строка артефакта
-- `bersoncarebot_test`), поэтому шагу reconcile, который владеет этим выражением, переписывать
-- нечего.
--
-- `CREATE OR REPLACE` сохраняет OID, поэтому `function_identity` (`regprocedure`), объявленные
-- способности, `delegatesTo` из `declaration.ts` и все вызовы адресуют тот же объект. Владелец,
-- сигнатура, тип возврата, волатильность, `SECURITY DEFINER` и `SET search_path` — прежние.
--
-- ПОВЕРХНОСТЬ ОТНОШЕНИЙ НЕ РАСШИРЯЕТСЯ, новых прав не нужно. Декларация
-- (`deploy/postgres/privileges/function-census.ts:12217`) уже описывает ИМЕННО эту редакцию:
-- `public.saas_trial_policy` — SELECT по `key, duration_days, start_event, post_trial_behavior,
-- post_trial_tariff_id, is_active, updated_at, discount_window_days` (никакого `tariff_id`);
-- `public.saas_organization_trials` — SELECT/INSERT по колонкам с `discount_ends_at` и без
-- `grace_ends_at`. Оба `FOR UPDATE OF` (`reg`, `policy`) уже оплачены `ROW_LOCK_SURFACES`
-- (`declaration.ts:2066`) колонкой `updated_at` каждой из двух таблиц. Ни одной новой таблицы, ни
-- одной новой колонки, ни новой seam-роли — объявлять в этой ветке нечего.
--
-- Прав тут нет и быть не может (AGENTS.md §1): владельца, EXECUTE и выражение гейта кладёт шаг
-- reconcile из `deploy/postgres/generated/privileges.<база>.sql`.
CREATE OR REPLACE FUNCTION app.start_provisioned_organization_trial()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_patient_user_id uuid := app.current_patient_user_id();
  v_organization_id uuid;
  v_policy record;
  v_registration_tariff_id uuid;
  v_started_at timestamptz;
  v_trial_id uuid;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_specialist_provision_owner'::name, ARRAY['app_patient'::name, 'app_platform_settings'::name]::name[]);

  IF v_patient_user_id IS NULL THEN
    RAISE EXCEPTION 'provisioning_patient_principal_required';
  END IF;

  v_organization_id := app.current_provisioned_owner_organization();
  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'provisioned_owner_organization_required';
  END IF;

  -- §5a item 2.6a -- the registration-tariff setting is independent of the trial policy below.
  -- A missing row or NULL tariff_id is a legal owner choice: the clinic picks a tariff later. A
  -- non-NULL reference must resolve to an active tariff; silently treating a broken setting as
  -- NULL would create an organization without the tariff the owner configured.
  SELECT reg.tariff_id
  INTO v_registration_tariff_id
  FROM public.saas_registration_tariff_policy AS reg
  WHERE reg.key = 'global'
  LIMIT 1
  FOR UPDATE OF reg;

  IF FOUND AND v_registration_tariff_id IS NOT NULL THEN
    PERFORM 1
    FROM public.saas_tariffs AS tariff
    WHERE tariff.id = v_registration_tariff_id
      AND tariff.is_active;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'registration_tariff_policy_tariff_invalid';
    END IF;
  END IF;

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
    AND policy.start_event = 'organization_provisioned'
  LIMIT 1
  FOR UPDATE OF policy;
  -- #1069 T5 (owner 03.08): without a registration tariff there is nothing to trial at provision
  -- time — the clinic owner chooses later via app.choose_organization_first_tariff(), which applies
  -- the same one-time trial policy to that first attachment.
  IF NOT FOUND OR v_registration_tariff_id IS NULL THEN
    -- No active trial policy is configured on this platform (owner has not set one), or there is no
    -- tariff yet for a trial to apply to. Whether the organization instead gets a direct starting
    -- tariff is governed by the independent registration-tariff setting above -- never a hardcoded
    -- value.
    IF v_registration_tariff_id IS NOT NULL THEN
      UPDATE public.be_organizations
      SET tariff_id = v_registration_tariff_id,
          updated_at = now()
      WHERE id = v_organization_id;

      INSERT INTO public.admin_audit_log (
        organization_id, actor_id, action, target_id, details, status
      ) VALUES (
        v_organization_id, v_patient_user_id, 'saas_registration_tariff_assign',
        v_registration_tariff_id::text,
        jsonb_build_object(
          'reason', 'automatic organization provisioning -- registration tariff setting',
          'before', NULL,
          'after', jsonb_build_object('tariffId', v_registration_tariff_id)
        ),
        'ok'
      );
    END IF;
    -- #1069 §2.13 (owner 01.08): «нет активного тарифа и нет триала -- доступа нет». Registration
    -- tariff also unset: the person picks a tariff themselves, and the organization is left with no
    -- tariff_id -- there is no separate "compatibility" state left to land it in.
    RETURN false;
  END IF;

  v_started_at := clock_timestamp();
  INSERT INTO public.saas_organization_trials (
    organization_id, tariff_id, started_at, ends_at, discount_ends_at,
    post_trial_behavior, post_trial_tariff_id, status, created_by
  ) VALUES (
    v_organization_id, v_registration_tariff_id, v_started_at,
    v_started_at + make_interval(days => v_policy.duration_days),
    v_started_at + make_interval(days => v_policy.duration_days + v_policy.discount_window_days),
    v_policy.post_trial_behavior, v_policy.post_trial_tariff_id, 'active', v_patient_user_id
  )
  ON CONFLICT (organization_id) DO NOTHING
  RETURNING id INTO v_trial_id;
  IF v_trial_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.be_organizations
  SET tariff_id = v_registration_tariff_id,
      updated_at = now()
  WHERE id = v_organization_id;

  INSERT INTO public.admin_audit_log (
    organization_id, actor_id, action, target_id, details, status
  ) VALUES (
    v_organization_id, v_patient_user_id, 'saas_trial_start', v_trial_id::text,
    jsonb_build_object(
      'reason', 'automatic organization provisioning trial',
      'before', NULL,
      'after', jsonb_build_object(
        'tariffId', v_registration_tariff_id,
        'durationDays', v_policy.duration_days,
        'discountWindowDays', v_policy.discount_window_days,
        'startEvent', v_policy.start_event,
        'postTrialBehavior', v_policy.post_trial_behavior,
        'postTrialTariffId', v_policy.post_trial_tariff_id
      )
    ),
    'ok'
  );
  RETURN true;
END
$function$;
