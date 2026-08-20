\set ON_ERROR_STOP off
BEGIN;

-- 1. Наложить DDL миграции 0050 внутри транзакции (в конце ROLLBACK — база не меняется).
\i apps/webapp/db/drizzle-migrations/0050_a_seat_invoice_is_not_cancelled_it_is_reissued.sql

-- Подготовка: тариф с ценой места.
UPDATE public.saas_tariffs SET additional_seat_price_minor = 150000
  WHERE id = 'e07db366-f471-40a5-bc9b-499908636acd';

\set org  '''a0000000-0000-4000-8000-000000000001'''
\set acct '''454f4931-3b83-4c4a-83b5-b0504fcb5f91'''
\set sub  '''1e28943a-fba2-41f0-ab0e-ac49e9409fec'''
\set tar  '''e07db366-f471-40a5-bc9b-499908636acd'''

-- Место продано на период 1 (июль), счёт за место 150000, НЕ оплачен, отрезок кончился 01.08.
INSERT INTO public.saas_billing_invoices
 (id, organization_id, saas_billing_account_id, saas_billing_subscription_id, tariff_id, tariff_name,
  amount_minor, currency, tariff_billing_period, service_period_starts_at, service_period_ends_at,
  status, provider_id, provider_idempotency_key, invoice_kind, additional_seat_quantity)
VALUES ('11111111-1111-4111-8111-111111111111', :org, :acct, :sub, :tar, 'СТАРТ',
  150000,'RUB','month','2026-07-01Z','2026-08-01Z','pending','yookassa','audit-seat-1','seat_overage',1);

\echo '=== П1. Долг = неоплаченный seat-счёт, чей отрезок кончился к началу нового периода ==='
SELECT id, amount_minor, status FROM public.saas_billing_invoices
 WHERE saas_billing_subscription_id = :sub AND invoice_kind='seat_overage'
   AND status IN ('draft','pending') AND service_period_ends_at <= '2026-08-01Z'
   AND service_period_ends_at <= '2026-08-01Z';

\echo '=== П2. ОГРАНИЧЕНИЕ: преемника нельзя повесить на ОПЛАЧИВАЕМЫЙ счёт (ждём отказ) ==='
INSERT INTO public.saas_billing_invoices
 (id, organization_id, saas_billing_account_id, saas_billing_subscription_id, tariff_id, tariff_name,
  amount_minor, carried_debt_minor, currency, tariff_billing_period, service_period_starts_at,
  service_period_ends_at, status, provider_id, provider_idempotency_key, invoice_kind, additional_seat_quantity)
VALUES ('22222222-2222-4222-8222-222222222222', :org, :acct, :sub, :tar, 'СТАРТ',
  230000, 150000, 'RUB','month','2026-08-01Z','2026-09-01Z','draft','yookassa','audit-period-2','tariff_period',0);
SAVEPOINT s2;
UPDATE public.saas_billing_invoices
   SET superseded_by_invoice_id = '22222222-2222-4222-8222-222222222222'
 WHERE id = '11111111-1111-4111-8111-111111111111';
ROLLBACK TO SAVEPOINT s2;

\echo '=== П3. Штатное гашение: void + преемник (ждём успех) ==='
UPDATE public.saas_billing_invoices
   SET status='void', superseded_by_invoice_id='22222222-2222-4222-8222-222222222222'
 WHERE id = '11111111-1111-4111-8111-111111111111';

\echo '=== П4. СВЕДЕНИЕ ДЕНЕГ: одна услуга ровно один раз ==='
SELECT
  (SELECT sum(amount_minor) FROM public.saas_billing_invoices
     WHERE saas_billing_subscription_id=:sub AND status <> 'void'
       AND id IN ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'))
      AS "к оплате всего",
  (SELECT carried_debt_minor FROM public.saas_billing_invoices WHERE id='22222222-2222-4222-8222-222222222222')
      AS "из них долг за место",
  (SELECT count(*) FROM public.saas_billing_invoices
     WHERE superseded_by_invoice_id='22222222-2222-4222-8222-222222222222') AS "погашено предшественников",
  (SELECT count(DISTINCT superseded_by_invoice_id) FROM public.saas_billing_invoices
     WHERE id='11111111-1111-4111-8111-111111111111') AS "преемников у старого счёта";

\echo '=== П5. ОГРАНИЧЕНИЕ: долг не может быть больше суммы счёта (ждём отказ) ==='
SAVEPOINT s5;
UPDATE public.saas_billing_invoices SET carried_debt_minor = 999999
 WHERE id='22222222-2222-4222-8222-222222222222';
ROLLBACK TO SAVEPOINT s5;

\echo '=== П6. Место за прошедший период не отбирается ==='
SELECT paid_additional_seats FROM public.saas_billing_subscriptions WHERE id=:sub;

\echo '=== П7. Функция смены тарифа: долг переезжает, а не прощается ==='
SELECT prosrc ~ 'carried_debt_minor' AS "функция знает про долг",
       prosrc ~ 'v_carried_debt_minor' AS "долг в арифметике"
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='app' AND p.proname='refresh_saas_billing_invoice_purchased_tariff';

\echo '=== П8. Частичный индекс под запрос долга ==='
EXPLAIN (COSTS OFF)
SELECT id FROM public.saas_billing_invoices
 WHERE saas_billing_subscription_id=:sub AND invoice_kind='seat_overage'
   AND status IN ('draft','pending') AND service_period_ends_at <= '2026-08-01Z';

\echo '=== П9. Преемник из ЧУЖОЙ организации (ждём отказ по FK) ==='
SAVEPOINT s9;
UPDATE public.saas_billing_invoices
   SET superseded_by_invoice_id = (SELECT id FROM public.saas_billing_invoices
                                    WHERE organization_id <> :org LIMIT 1)
 WHERE id='11111111-1111-4111-8111-111111111111';
ROLLBACK TO SAVEPOINT s9;

ROLLBACK;
