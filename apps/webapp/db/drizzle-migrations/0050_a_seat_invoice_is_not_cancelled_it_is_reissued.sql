-- BCB-MIGRATION-OWNER: app_object_owner
-- TEMPORARY LOCAL MIGRATION NUMBER 0050
--
-- Решение владельца 19.08, дословно, двумя строками одного разговора:
--
--   «отмена неоплаченного счёта администратором — это с чего бы его отменять? как делается у
--   других — разве они дают админу просто отменить счет? Может перевыставить его».
--
--   «Если до конца периода счет не оплачен — делать его просроченным и включать долг в стоимость
--   следующего периода: он либо автооплатится, либо весь доступ закрыт по правилам тарифов (как
--   настроил глоб-админ)».
--
-- Основание практикой — `docs/_TODO/SAAS_FOUNDATION/SEAT_UNPAID_PRACTICE_2026-08-19.md`, вопросы 2
-- и 3. Ключевое различие оттуда: `void` говорит миру «счёта не было», а неоплаченный счёт говорит
-- «мы продали, нам не заплатили». Это не соседние ступени одной шкалы, а два разных утверждения о
-- реальности, и услуга, которая была оказана, в первую категорию попасть не может, не превратив
-- отчётность в ложь.
--
-- ЧТО ЗДЕСЬ ПОЯВЛЯЕТСЯ И ПОЧЕМУ ИМЕННО ТАК.
--
-- 1. `superseded_by_invoice_id` — ПРЕЕМНИК. Аннулирование С преемником означает «сумма переехала на
--    тот счёт»; без преемника — «долга не было». По одному статусу `void` эти два случая
--    неразличимы, поэтому преемник хранится строкой, а не выводится из соседства дат. Через него же
--    видно, что перевыставление — не отмена под другим именем.
--
-- 2. `carried_debt_minor` — сколько в сумме счёта приехало с ПРОШЛОГО периода. Хранится отдельно от
--    `amount_minor`, ЧАСТЬЮ которого является: счёт обязан уметь объяснить плательщику, откуда в
--    нём выросшее число, а сумма к оплате остаётся одним полем, а не двумя слагаемыми, которые
--    разъедутся.
--
-- 3. Ограничение `…_superseded_is_void_check` — конструкция вместо дисциплины. Пока оно стоит,
--    невозможно связать преемника, оставив старый счёт оплачиваемым: иначе одна услуга осталась бы
--    оплачиваемой дважды — по старому счёту и внутри нового. Симметрично
--    `…_carried_debt_check` не даёт долгу оказаться больше суммы, в которую он якобы входит.
--
-- 4. Частичный индекс `idx_saas_billing_invoices_seat_debt` — под запрос, который теперь исполняет
--    КАЖДОЕ выставление счёта следующего периода (обе двери: клиника платит сама и фоновый тик):
--    «неоплаченные счета за место этой подписки, чей отрезок услуги закончился». Порядок колонок —
--    сначала равенство (подписка), потом диапазон (конец отрезка), по §1 «Миграции: индекс на
--    горячую колонку — в том же PR».
--
-- 5. `app.refresh_saas_billing_invoice_purchased_tariff` переопределяется ровно на одну строку
--    арифметики. Функция пересчитывает сумму черновика при смене тарифа под ним и до сих пор
--    считала «тариф + места». Оставить её как есть значило бы, что смена тарифа МОЛЧА ПРОЩАЕТ
--    переехавший долг — самый дорогой класс ошибки: правдоподобное неверное число. Тело функции
--    больше ничем не отличается от редакции миграции 0023.
--
-- Прав эта миграция не выдаёт и не отзывает (§1): новых объектов, требующих грантов, здесь нет —
-- добавлены колонки существующей таблицы и переопределено тело существующей функции.

ALTER TABLE public.saas_billing_invoices
  ADD COLUMN IF NOT EXISTS carried_debt_minor integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS superseded_by_invoice_id uuid;
--> statement-breakpoint
ALTER TABLE public.saas_billing_invoices
  DROP CONSTRAINT IF EXISTS saas_billing_invoices_superseded_by_org_fkey;
--> statement-breakpoint
ALTER TABLE public.saas_billing_invoices
  ADD CONSTRAINT saas_billing_invoices_superseded_by_org_fkey
  FOREIGN KEY (superseded_by_invoice_id, organization_id)
  REFERENCES public.saas_billing_invoices (id, organization_id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE public.saas_billing_invoices
  DROP CONSTRAINT IF EXISTS saas_billing_invoices_carried_debt_check;
--> statement-breakpoint
ALTER TABLE public.saas_billing_invoices
  ADD CONSTRAINT saas_billing_invoices_carried_debt_check
  CHECK (carried_debt_minor >= 0 AND carried_debt_minor <= amount_minor);
--> statement-breakpoint
ALTER TABLE public.saas_billing_invoices
  DROP CONSTRAINT IF EXISTS saas_billing_invoices_superseded_is_void_check;
--> statement-breakpoint
ALTER TABLE public.saas_billing_invoices
  ADD CONSTRAINT saas_billing_invoices_superseded_is_void_check
  CHECK (superseded_by_invoice_id IS NULL OR status = 'void');
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_saas_billing_invoices_seat_debt
  ON public.saas_billing_invoices (saas_billing_subscription_id, service_period_ends_at)
  WHERE invoice_kind = 'seat_overage' AND status IN ('draft', 'pending');
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_org_commerce_owner
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
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
  v_carried_debt_minor integer;
  v_tariff public.saas_tariffs%ROWTYPE;
  v_amount_minor integer;
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_org_commerce_owner'::name,
    ARRAY['app_clinic_billing'::name]::name[]
  );

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

  -- Долг за прошлый период переезжает через пересчёт нетронутым: смена тарифа под черновиком меняет
  -- цену тарифа, а не отменяет то, что клиника уже должна.
  v_amount_minor :=
    v_tariff.price_minor
    + v_paid_additional_seats * coalesce(v_tariff.additional_seat_price_minor, 0)
    + coalesce(v_carried_debt_minor, 0);

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
