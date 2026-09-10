-- BCB-MIGRATION-OWNER: app_seam_org_commerce_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT pg_get_functiondef(to_regprocedure('app.list_saas_billing_subscriptions_due_for_renewal(timestamp with time zone,integer)')) LIKE '%storagePackagePriceMinor%' AND pg_get_functiondef(to_regprocedure('app.refresh_saas_billing_invoice_purchased_tariff(uuid,uuid,uuid,text)')) LIKE '%storage_package_id%'
--
-- Владелец 10.09.2026, дословно: «предоставляется пакет места [сразу], со следующего периода счёт
-- выставляется». План — `docs/_TODO/STORAGE_PACKAGES_2026-09-10.md`, этап М3.
--
-- Две двери выставляют счёт продления, и обе обязаны считать сумму ОДИНАКОВО:
--   * фоновый тик под `app_worker` — сумму собирает TypeScript, но цены он не читает сам: у этой
--     роли нет SELECT ни на матрицу цен тарифа, ни на матрицу цен пакетов, и появляться ему тут
--     незачем (решение F-2 от 05.09). Поэтому цену выдаёт ЭТОТ повышенный корень, который и так
--     называет пару (тариф, период);
--   * шов пересборки черновика под `app_seam_org_commerce_owner` — сумму выводит он сам, из строк
--     подписки, и `amount_minor` арендной роли по-прежнему недоступна.
--
-- КАКОЙ пакет действует со следующего периода, решается одним выражением
-- `COALESCE(pending, CASE WHEN cancel THEN NULL ELSE paid END)` — тем же, что в TypeScript
-- (`storagePackageForNextPeriod`). Копий у этого правила теперь две, и это цена того, что сумму
-- считают два владельца; расхождение ловится живым прогоном продления в приёмке (М6a).

CREATE OR REPLACE FUNCTION app.list_saas_billing_subscriptions_due_for_renewal(
  p_as_of timestamp with time zone,
  p_limit integer
) RETURNS jsonb
LANGUAGE plpgsql
STABLE PARALLEL RESTRICTED SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM app.require_accepted_context('app_seam_org_commerce_owner'::name, 'app_worker'::name, 'service'::app.port_context_class, 'billing.saas-renewal.due-list', app.hash_port_typed_args(ARRAY[ROW('timestamptz@1', pg_catalog.timestamptz_send($1))::app.port_typed_arg, ROW('integer@1', pg_catalog.int4send($2))::app.port_typed_arg]), 'app.list_saas_billing_subscriptions_due_for_renewal(timestamp with time zone,integer)'::regprocedure);

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
           'billingPeriod', due.billing_period,
           'billingPeriodMonths', period.months,
           'billingPeriodPriceMinor', price.price_minor,
           -- Пакет объёма следующего периода и его цена за ЭТОТ период. `NULL` в обоих полях —
           -- «пакета нет»; пакет без цены за период — дыра в каталоге, и разбор на стороне
           -- приложения такую строку отбрасывает, а не выставляет счёт без объёма.
           'storagePackageId', due.next_storage_package_id,
           'storagePackagePriceMinor', storage_price.price_minor
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
             COALESCE(subscription.pending_billing_period_code, subscription.billing_period_code) AS billing_period,
             COALESCE(
               subscription.pending_storage_package_id,
               CASE WHEN subscription.storage_package_cancel_at_period_end THEN NULL
                    ELSE subscription.paid_storage_package_id END
             ) AS next_storage_package_id
        FROM public.saas_billing_subscriptions AS subscription
       WHERE subscription.source = 'paid_subscription'
         AND subscription.status = 'active'
         AND subscription.cancelled_at IS NULL
         AND subscription.current_period_ends_at IS NOT NULL
         AND subscription.current_period_ends_at <= p_as_of
       ORDER BY subscription.current_period_ends_at
       LIMIT p_limit
    ) AS due
    LEFT JOIN public.saas_billing_periods AS period ON period.code = due.billing_period
    LEFT JOIN public.saas_tariff_period_prices AS price
      ON price.tariff_id = due.purchased_tariff_id AND price.billing_period_code = due.billing_period
    LEFT JOIN public.saas_storage_package_period_prices AS storage_price
      ON storage_price.package_id = due.next_storage_package_id
     AND storage_price.billing_period_code = due.billing_period;

  RETURN v_result;
END
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_org_commerce_owner
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- Тот же шов, что пересобирает черновик продления под изменившуюся пару (тариф, период), теперь
-- складывает в сумму и цену пакета объёма — и вписывает сам пакет в счёт. Иначе смена тарифа под
-- черновиком тихо роняла бы объём из суммы: сумма пересчитывалась бы без него, а пакет клиника
-- продолжала бы получать.
CREATE OR REPLACE FUNCTION app.refresh_saas_billing_invoice_purchased_tariff(
  p_saas_billing_invoice_id uuid,
  p_organization_id uuid,
  p_tariff_id uuid,
  p_billing_period_code text
) RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_saas_billing_subscription_id uuid;
  v_subscription_tariff_id uuid;
  v_subscription_billing_period_code text;
  v_subscription_pending_tariff_id uuid;
  v_subscription_pending_billing_period_code text;
  v_paid_additional_seats integer;
  v_carried_debt_minor integer;
  v_tariff public.saas_tariffs%ROWTYPE;
  v_price_minor integer;
  v_amount_minor integer;
  v_storage_package_id uuid;
  v_storage_price_minor integer;
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_org_commerce_owner'::name,
    ARRAY['app_clinic_billing'::name]::name[]
  );

  IF p_organization_id IS NULL
     OR p_organization_id IS DISTINCT FROM app.current_org_id() THEN
    RAISE EXCEPTION 'saas_billing_organization_context_denied'
      USING ERRCODE = '42501';
  END IF;

  SELECT invoice.saas_billing_subscription_id, invoice.carried_debt_minor
  INTO v_saas_billing_subscription_id, v_carried_debt_minor
  FROM public.saas_billing_invoices AS invoice
  WHERE invoice.id = p_saas_billing_invoice_id
    AND invoice.organization_id = p_organization_id
    AND invoice.invoice_kind = 'tariff_period'
    AND invoice.description IS NULL
    AND invoice.expires_at IS NULL
    AND invoice.status = 'draft'
    AND invoice.provider_invoice_ref IS NULL
  FOR UPDATE;

  IF v_saas_billing_subscription_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT subscription.tariff_id, subscription.billing_period_code,
         subscription.pending_tariff_id, subscription.pending_billing_period_code,
         subscription.paid_additional_seats,
         COALESCE(
           subscription.pending_storage_package_id,
           CASE WHEN subscription.storage_package_cancel_at_period_end THEN NULL
                ELSE subscription.paid_storage_package_id END
         )
  INTO v_subscription_tariff_id, v_subscription_billing_period_code,
       v_subscription_pending_tariff_id, v_subscription_pending_billing_period_code,
       v_paid_additional_seats, v_storage_package_id
  FROM public.saas_billing_subscriptions AS subscription
  WHERE subscription.id = v_saas_billing_subscription_id
    AND subscription.organization_id = p_organization_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- #1069 owner decision 2026-09-05 (period grid) — the PAIR (not the tariff alone) must match
  -- either the subscription's current pair or its scheduled pending one; anything else is refused.
  IF (p_tariff_id, p_billing_period_code)
       IS DISTINCT FROM (v_subscription_tariff_id, v_subscription_billing_period_code)
     AND (p_tariff_id, p_billing_period_code)
       IS DISTINCT FROM (v_subscription_pending_tariff_id, v_subscription_pending_billing_period_code)
  THEN
    RETURN false;
  END IF;

  SELECT * INTO v_tariff FROM public.saas_tariffs AS tariff WHERE tariff.id = p_tariff_id;

  IF NOT FOUND OR v_tariff.currency IS NULL THEN
    RETURN false;
  END IF;

  IF v_paid_additional_seats > 0 AND v_tariff.additional_seat_price_minor IS NULL THEN
    RETURN false;
  END IF;

  -- #1069 owner decision 2026-09-05 (period grid) — the amount comes from the money matrix for
  -- THIS (tariff, period) pair, never the tariff's frozen legacy `price_minor`.
  SELECT price.price_minor INTO v_price_minor
  FROM public.saas_tariff_period_prices AS price
  WHERE price.tariff_id = p_tariff_id
    AND price.billing_period_code = p_billing_period_code;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Пакет без цены за этот период — дыра в каталоге. Отказ, а не ноль: ноль означал бы, что объём
  -- клинике выдан даром, и увидеть это было бы уже не по чему.
  v_storage_price_minor := 0;
  IF v_storage_package_id IS NOT NULL THEN
    SELECT storage_price.price_minor INTO v_storage_price_minor
    FROM public.saas_storage_package_period_prices AS storage_price
    WHERE storage_price.package_id = v_storage_package_id
      AND storage_price.billing_period_code = p_billing_period_code;

    IF NOT FOUND THEN
      RETURN false;
    END IF;
  END IF;

  v_amount_minor :=
    v_price_minor
    + v_paid_additional_seats * coalesce(v_tariff.additional_seat_price_minor, 0)
    + coalesce(v_storage_price_minor, 0)
    + coalesce(v_carried_debt_minor, 0);

  UPDATE public.saas_billing_invoices AS invoice
  SET tariff_id = v_tariff.id,
      tariff_name = v_tariff.name,
      amount_minor = v_amount_minor,
      currency = v_tariff.currency,
      tariff_billing_period = p_billing_period_code,
      additional_seat_quantity = v_paid_additional_seats,
      storage_package_id = v_storage_package_id,
      tariff_snapshot = to_jsonb(v_tariff),
      updated_at = now()
  WHERE invoice.id = p_saas_billing_invoice_id
    AND invoice.organization_id = p_organization_id
    AND invoice.status = 'draft'
    AND invoice.provider_invoice_ref IS NULL;

  RETURN FOUND;
END;
$function$;
