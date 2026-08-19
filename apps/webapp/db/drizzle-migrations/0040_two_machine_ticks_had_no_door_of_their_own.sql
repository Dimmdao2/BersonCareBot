-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- TEMPORARY LOCAL MIGRATION NUMBER 0040
--
-- Замер 19.08 на TEST. Критический тик, поднятый руками, ответил 200 за 2.1 с и записал
-- `health.operator_health_critical.tick | success`. В ту же секунду в логе PostgreSQL:
--
--   2026-08-19 10:36:43.480 bcb_test_webapp_staff@bersoncarebot_test 42501
--   ERROR:  permission denied for table be_organization_members
--   STATEMENT: select "platform_users"."id", "be_organization_members"."organization_id"
--              from "be_organization_members"
--              inner join "platform_users" on "platform_users"."id" = "be_organization_members"."platform_user_id"
--              where ("be_organization_members"."status" = $1
--                 and "platform_users"."role" in ($2, $3)
--                 and "platform_users"."merged_into_id" is null)
--
-- Это `pgStaffUsers.listActiveStaffOrganizationRecipients` — аудитория staff-веб-пуша
-- операторского алерта (`sendAdminIncidentStaffWebPush` ← `dispatchOperatorAlert`). Соседние
-- каналы того же диспетчера (telegram/max/sms/email) переехали на объявленный корень ещё
-- миграцией 0030 (`app.read_admin_notification_targets(text)`); веб-пуш остался сырым чтением
-- отношения и с введением порт-контекста перестал работать вовсе.
--
-- Чего это стоит человеку: канал веб-пуша операторского алерта не срабатывал НИ РАЗУ, а тик
-- при этом писал `success` — отказ гасился `.catch` внутри `dispatchOperatorAlert` и превращался
-- в «этот канал ничего не доставил». Пустой аудитории диспетчер бы не поверил
-- (`reportEmptyAudience`), но остальные каналы отвечали, поэтому «пусто» не наступало.
--
-- Дверь — та же, что у соседа по тому же диспетчеру: шов операторской телеметрии,
-- `app_worker`, только EXECUTE. Рабочим ролям не добавлено ни одной табличной привилегии;
-- шву добавляется поверхность `be_organization_members(organization_id, platform_user_id,
-- status)` — `platform_users(id, role, merged_into_id)` у него уже есть под соседний корень.

CREATE OR REPLACE FUNCTION app.list_operator_alert_staff_push_recipients()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
PARALLEL RESTRICTED
SET search_path = pg_catalog
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_telemetry_operator_owner'::name,
    'app_worker'::name,
    'service'::app.port_context_class,
    'notifications.staff-push-audience.read',
    app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]),
    'app.list_operator_alert_staff_push_recipients()'::regprocedure
  );

  -- Ровно тот предикат, который стоял в drizzle-запросе: ДЕЙСТВУЮЩЕЕ членство, роль персонала,
  -- не слитая учётка. Пара «человек ↔ клиника» возвращается целиком: веб-пуш операторского
  -- алерта адресуется в контексте конкретной клиники, и схлопнуть её до списка людей нельзя.
  SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
           'userId', staff_user.id,
           'organizationId', member.organization_id
         )), '[]'::jsonb)
    INTO v_result
    FROM public.be_organization_members AS member
    JOIN public.platform_users AS staff_user
      ON staff_user.id = member.platform_user_id
   WHERE member.status = 'active'
     AND staff_user.role IN ('doctor', 'admin')
     AND staff_user.merged_into_id IS NULL;

  RETURN v_result;
END
$function$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_org_commerce_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
--
-- Замер 19.08 на TEST. Часовой тик продления подписок отвечает 500:
--
--   curl -X POST -H "Authorization: Bearer $INTERNAL_JOB_SECRET" \
--     http://127.0.0.1:6300/api/internal/saas-billing/renewal/tick   -->  500
--   webapp:   "[internal/saas-billing/renewal/tick] failed"
--   postgres: 2026-08-19 10:36:56.919 bcb_test_webapp_global_admin@bersoncarebot_test 42501
--             ERROR: platform port context actor is not a platform administrator
--
-- Строки `billing.saas_renewal.tick` в `operator_job_status` нет вовсе — тик не отработал НИ РАЗУ.
--
-- Почему. Маршрут входил ПЛАТФОРМЕННЫМ принципалом и подставлял актором нулевой UUID
-- (`SAAS_BILLING_RENEWAL_TICK_SYSTEM_PLATFORM_USER_ID`). Класс `platform` по построению —
-- класс живого администратора платформы: `app_ext.assert_port_context_claim` требует строку
-- `platform_users.role='admin'`, и выдуманного актора отвергает. Это не лишняя строгость, а
-- смысл класса; машинному тику нужен машинный класс, а не более слабая проверка. Все остальные
-- внутренние тики вебаппа входят инфра-принципалом (класс `service`, роль `app_worker`) —
-- этот был единственным исключением и единственным, который не работал.
--
-- Что мешает просто переключить класс: перечисление «у кого кончился оплаченный период» —
-- работа МЕЖАРЕНДНАЯ, а `app_worker` видит подписки только своей организации
-- (RLS `rev10_direct_business_181`: `organization_id = app.current_org_id()`). Поэтому у
-- перечисления своя дверь — корень у шва коммерции, того же, что уже читает подписку и тариф
-- в `app.refresh_saas_billing_invoice_purchased_tariff`.
--
-- Правило «за какой тариф платят» остаётся ОДНО и живёт в `payableTariff.ts`
-- (`pendingTariffId ?? tariffId`); здесь оно воспроизведено ровно потому, что длина периода
-- берётся из покупаемого тарифа. Подписка, чьей строки тарифа нет, пропускается — ровно так же,
-- как её пропускал прежний внутренний join.

CREATE OR REPLACE FUNCTION app.list_saas_billing_subscriptions_due_for_renewal(
  p_as_of timestamp with time zone,
  p_limit integer
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
PARALLEL RESTRICTED
SET search_path = pg_catalog
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_org_commerce_owner'::name,
    'app_worker'::name,
    'service'::app.port_context_class,
    'billing.saas-renewal.due-list',
    app.hash_port_typed_args(ARRAY[
      ROW('timestamptz@1', pg_catalog.timestamptz_send(p_as_of))::app.port_typed_arg,
      ROW('integer@1', pg_catalog.int4send(p_limit))::app.port_typed_arg
    ]),
    'app.list_saas_billing_subscriptions_due_for_renewal(timestamp with time zone,integer)'::regprocedure
  );

  IF p_as_of IS NULL THEN
    RAISE EXCEPTION 'saas_billing_renewal_as_of_invalid' USING ERRCODE = '22023';
  END IF;
  -- Верхняя граница закрыта ЗДЕСЬ: корень отдаёт межарендный список, и «сколько строк за раз»
  -- не может быть свободным числом от вызывающего.
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 200 THEN
    RAISE EXCEPTION 'saas_billing_renewal_limit_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'saasBillingSubscriptionId', due.id,
           'organizationId', due.organization_id,
           'tariffId', due.purchased_tariff_id,
           'pendingTariffId', due.pending_tariff_id,
           'currentPeriodEndsAt', due.current_period_ends_at,
           'savedPaymentMethodId', due.saved_payment_method_id,
           'autopayConsentedAt', due.autopay_consented_at,
           'autopayRevokedAt', due.autopay_revoked_at,
           'billingPeriod', due.billing_period
         ) ORDER BY due.current_period_ends_at), '[]'::jsonb)
    INTO v_result
    FROM (
      SELECT subscription.id AS id,
             subscription.organization_id AS organization_id,
             COALESCE(subscription.pending_tariff_id, subscription.tariff_id) AS purchased_tariff_id,
             subscription.pending_tariff_id AS pending_tariff_id,
             subscription.current_period_ends_at AS current_period_ends_at,
             subscription.saved_payment_method_id AS saved_payment_method_id,
             subscription.autopay_consented_at AS autopay_consented_at,
             subscription.autopay_revoked_at AS autopay_revoked_at,
             tariff.billing_period AS billing_period
        FROM public.saas_billing_subscriptions AS subscription
        JOIN public.saas_tariffs AS tariff
          ON tariff.id = COALESCE(subscription.pending_tariff_id, subscription.tariff_id)
       WHERE subscription.source = 'paid_subscription'
         AND subscription.status = 'active'
         AND subscription.current_period_ends_at IS NOT NULL
         AND subscription.current_period_ends_at <= p_as_of
       ORDER BY subscription.current_period_ends_at
       LIMIT p_limit
    ) AS due;

  RETURN v_result;
END
$function$;
