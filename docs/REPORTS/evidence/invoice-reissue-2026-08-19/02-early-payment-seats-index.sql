BEGIN;
\i apps/webapp/db/drizzle-migrations/0050_a_seat_invoice_is_not_cancelled_it_is_reissued.sql
UPDATE public.saas_tariffs SET additional_seat_price_minor=150000 WHERE id='e07db366-f471-40a5-bc9b-499908636acd';
UPDATE public.saas_billing_subscriptions SET paid_additional_seats=3 WHERE id='1e28943a-fba2-41f0-ab0e-ac49e9409fec';

-- A: место июля, счёт НЕ оплачен, отрезок КОНЧИЛСЯ 01.08
INSERT INTO public.saas_billing_invoices (id,organization_id,saas_billing_account_id,saas_billing_subscription_id,tariff_id,tariff_name,amount_minor,currency,tariff_billing_period,service_period_starts_at,service_period_ends_at,status,provider_id,provider_idempotency_key,invoice_kind,additional_seat_quantity)
VALUES ('11111111-1111-4111-8111-111111111111','a0000000-0000-4000-8000-000000000001','454f4931-3b83-4c4a-83b5-b0504fcb5f91','1e28943a-fba2-41f0-ab0e-ac49e9409fec','e07db366-f471-40a5-bc9b-499908636acd','СТАРТ',150000,'RUB','month','2026-07-01Z','2026-08-01Z','pending','yookassa','a-seat-jul','seat_overage',1);
-- B: место АВГУСТА, счёт не оплачен, отрезок ЕЩЁ ИДЁТ (кончается 01.09)
INSERT INTO public.saas_billing_invoices (id,organization_id,saas_billing_account_id,saas_billing_subscription_id,tariff_id,tariff_name,amount_minor,currency,tariff_billing_period,service_period_starts_at,service_period_ends_at,status,provider_id,provider_idempotency_key,invoice_kind,additional_seat_quantity)
VALUES ('33333333-3333-4333-8333-333333333333','a0000000-0000-4000-8000-000000000001','454f4931-3b83-4c4a-83b5-b0504fcb5f91','1e28943a-fba2-41f0-ab0e-ac49e9409fec','e07db366-f471-40a5-bc9b-499908636acd','СТАРТ',150000,'RUB','month','2026-08-01Z','2026-09-01Z','pending','yookassa','b-seat-aug','seat_overage',1);

\echo '=== #4 ДОСРОЧНАЯ ОПЛАТА: выставляем сентябрь 15.08 (asOf), долг = только тот, чей отрезок кончился И <= asOf ==='
SELECT id, service_period_ends_at::date, amount_minor FROM public.saas_billing_invoices
 WHERE saas_billing_subscription_id='1e28943a-fba2-41f0-ab0e-ac49e9409fec' AND invoice_kind='seat_overage'
   AND status IN ('draft','pending')
   AND service_period_ends_at <= '2026-09-01Z'   -- periodStartsAt следующего периода
   AND service_period_ends_at <= '2026-08-15Z';  -- asOf: клиника платит досрочно

\echo '=== то же без условия asOf (что было бы БЕЗ защиты досрочной оплаты) ==='
SELECT id, service_period_ends_at::date FROM public.saas_billing_invoices
 WHERE saas_billing_subscription_id='1e28943a-fba2-41f0-ab0e-ac49e9409fec' AND invoice_kind='seat_overage'
   AND status IN ('draft','pending') AND service_period_ends_at <= '2026-09-01Z';

\echo '=== #5 МЕСТО ЗА ПРОШЕДШИЙ ПЕРИОД: paid_additional_seats до и после гашения долга ==='
SELECT paid_additional_seats AS "до" FROM public.saas_billing_subscriptions WHERE id='1e28943a-fba2-41f0-ab0e-ac49e9409fec';
INSERT INTO public.saas_billing_invoices (id,organization_id,saas_billing_account_id,saas_billing_subscription_id,tariff_id,tariff_name,amount_minor,carried_debt_minor,currency,tariff_billing_period,service_period_starts_at,service_period_ends_at,status,provider_id,provider_idempotency_key,invoice_kind,additional_seat_quantity)
VALUES ('22222222-2222-4222-8222-222222222222','a0000000-0000-4000-8000-000000000001','454f4931-3b83-4c4a-83b5-b0504fcb5f91','1e28943a-fba2-41f0-ab0e-ac49e9409fec','e07db366-f471-40a5-bc9b-499908636acd','СТАРТ',680000,150000,'RUB','month','2026-08-01Z','2026-09-01Z','draft','yookassa','period-aug','tariff_period',3);
UPDATE public.saas_billing_invoices SET status='void', superseded_by_invoice_id='22222222-2222-4222-8222-222222222222' WHERE id='11111111-1111-4111-8111-111111111111';
SELECT paid_additional_seats AS "после" FROM public.saas_billing_subscriptions WHERE id='1e28943a-fba2-41f0-ab0e-ac49e9409fec';

\echo '=== СВЕДЕНИЕ: 80000 тариф + 3*150000 места + 150000 долг = 680000; июльский seat погашен ==='
SELECT id, status, amount_minor, carried_debt_minor, superseded_by_invoice_id IS NOT NULL AS "есть преемник"
  FROM public.saas_billing_invoices
 WHERE id IN ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333')
 ORDER BY id;
SELECT sum(amount_minor) AS "всего к оплате (без void)" FROM public.saas_billing_invoices
 WHERE id IN ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333') AND status<>'void';

\echo '=== #8 индекс под запрос долга ПРИ ЗАПРЕЩЁННОМ seq scan ==='
SET LOCAL enable_seqscan=off;
EXPLAIN (COSTS OFF) SELECT id FROM public.saas_billing_invoices
 WHERE saas_billing_subscription_id='1e28943a-fba2-41f0-ab0e-ac49e9409fec' AND invoice_kind='seat_overage'
   AND status IN ('draft','pending') AND service_period_ends_at <= '2026-09-01Z';
ROLLBACK;
