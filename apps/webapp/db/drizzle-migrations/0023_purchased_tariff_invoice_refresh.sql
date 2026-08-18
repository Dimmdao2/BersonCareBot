-- BCB-MIGRATION-OWNER: app_seam_org_commerce_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- TEMPORARY LOCAL MIGRATION NUMBER 0023
--
-- Решение владельца 18.08 (L-10), дословно: «клиент получает то что оплачено. То что не оплачено
-- не получает. Вот и все».
--
-- Незанятый черновик счёта за период может описывать тариф, который клиника уже не покупает: смену
-- запланировали или отменили после того, как черновик был выставлен. Второй строкой такой счёт не
-- выставишь — `saas_billing_invoices_period_uidx` запрещает второй `tariff_period` на тот же период,
-- — значит черновик надо переписать под покупаемый тариф.
--
-- Почему это аксессор, а не грант арендной роли (решение ведущего 18.08): сумма счёта — ровно та
-- колонка, которую арендная роль не должна уметь переписывать никогда. Сегодня худшее, что может
-- сделать принуждённый `app_clinic_billing` (баг, инъекция, неосторожный будущий вызов), — получить
-- отказ; с грантом на `amount_minor` худшее — изменить, сколько клиника должна. Поэтому сумму
-- выводит функция, из строки тарифа этой же подписки, и никогда не принимает её от вызывающего.
--
-- `p_tariff_id` — это НЕ «сколько платить», а «какой из двух тарифов этой же подписки». Правило
-- «какой тариф покупают» живёт в одном месте на весь продукт
-- (`modules/saas-billing/payableTariff.ts:purchasedTariffId`), здесь оно не повторяется: функция
-- лишь отказывает всему, что не является текущим либо запланированным тарифом ЭТОЙ подписки.
--
-- Отказ (`false`) вместо исключения — во всех случаях, где переписывать нечего или нельзя: чужой
-- счёт, не черновик, уже есть заказ у провайдера, тариф не из этой подписки, тариф без цены.
-- Заказ, который провайдер уже держит, не переписывается никогда — он настоящий; это ровно те же
-- условия отказа, что несёт сегодня код репозитория (`infra/repos/pgSaasBilling.ts`).
CREATE OR REPLACE FUNCTION app.refresh_saas_billing_invoice_purchased_tariff(
  p_saas_billing_invoice_id uuid,
  p_organization_id uuid,
  p_tariff_id uuid
)
 RETURNS boolean
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_saas_billing_subscription_id uuid;
  v_subscription_tariff_id uuid;
  v_subscription_pending_tariff_id uuid;
  v_paid_additional_seats integer;
  v_tariff public.saas_tariffs%ROWTYPE;
  v_amount_minor integer;
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_org_commerce_owner'::name,
    ARRAY['app_clinic_billing'::name]::name[]
  );

  SELECT invoice.saas_billing_subscription_id
  INTO v_saas_billing_subscription_id
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

  SELECT subscription.tariff_id, subscription.pending_tariff_id, subscription.paid_additional_seats
  INTO v_subscription_tariff_id, v_subscription_pending_tariff_id, v_paid_additional_seats
  FROM public.saas_billing_subscriptions AS subscription
  WHERE subscription.id = v_saas_billing_subscription_id
    AND subscription.organization_id = p_organization_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF p_tariff_id IS DISTINCT FROM v_subscription_tariff_id
     AND p_tariff_id IS DISTINCT FROM v_subscription_pending_tariff_id THEN
    RETURN false;
  END IF;

  SELECT * INTO v_tariff FROM public.saas_tariffs AS tariff WHERE tariff.id = p_tariff_id;

  IF NOT FOUND OR v_tariff.price_minor IS NULL OR v_tariff.currency IS NULL THEN
    RETURN false;
  END IF;

  IF v_paid_additional_seats > 0 AND v_tariff.additional_seat_price_minor IS NULL THEN
    RETURN false;
  END IF;

  v_amount_minor :=
    v_tariff.price_minor + v_paid_additional_seats * coalesce(v_tariff.additional_seat_price_minor, 0);

  UPDATE public.saas_billing_invoices AS invoice
  SET tariff_id = v_tariff.id,
      tariff_name = v_tariff.name,
      amount_minor = v_amount_minor,
      currency = v_tariff.currency,
      tariff_billing_period = v_tariff.billing_period,
      additional_seat_quantity = v_paid_additional_seats,
      -- Снимок периода — копия ЖИВОЙ строки тарифа целиком (та же форма, что пишет
      -- `readTariffSnapshotForPeriod`); вместе с ним уходит и снимок чека на прежнюю сумму,
      -- который хранится внутри этого же jsonb (`withReceiptSnapshot`).
      tariff_snapshot = to_jsonb(v_tariff),
      updated_at = now()
  WHERE invoice.id = p_saas_billing_invoice_id
    AND invoice.organization_id = p_organization_id
    AND invoice.status = 'draft'
    AND invoice.provider_invoice_ref IS NULL;

  RETURN FOUND;
END
$function$;
