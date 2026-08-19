-- Ф3, ступень «конструкция»: счёт за место нельзя отменить даже прямым UPDATE мимо приложения.
-- Транзакция заканчивается ROLLBACK — DEV не меняется.
BEGIN;
\set ON_ERROR_STOP off
\set org   '''da6a96cb-8e94-4ec2-99da-2258bda0ce4d'''
\set sub   '''4e48935b-c20d-4185-a516-9957b575f726'''
\set acct  '''199b5010-8669-4e40-8796-a3b4375dd276'''
\set tar   '''e07db366-f471-40a5-bc9b-499908636acd'''

INSERT INTO public.saas_billing_invoices
  (id, organization_id, saas_billing_account_id, saas_billing_subscription_id, tariff_id, tariff_name,
   invoice_kind, additional_seat_quantity, amount_minor, currency, tariff_billing_period,
   service_period_starts_at, service_period_ends_at, status, provider_id, provider_idempotency_key)
VALUES
  ('11111111-1111-4111-8111-111111111111', :org, :acct, :sub, :tar, 'T', 'seat_overage', 1, 150000,
   'RUB', 'month', '2026-07-01', '2026-08-01', 'pending', 'mock', 'proof-seat-1');

\echo '--- 1. отмена счёта за место (void без преемника) ---'
SAVEPOINT s1;
UPDATE public.saas_billing_invoices SET status = 'void'
 WHERE id = '11111111-1111-4111-8111-111111111111';

ROLLBACK TO SAVEPOINT s1;

\echo '--- 2. счёт за период отменяется по-прежнему ---'
INSERT INTO public.saas_billing_invoices
  (id, organization_id, saas_billing_account_id, saas_billing_subscription_id, tariff_id, tariff_name,
   invoice_kind, additional_seat_quantity, amount_minor, currency, tariff_billing_period,
   service_period_starts_at, service_period_ends_at, status, provider_id, provider_idempotency_key)
VALUES
  ('22222222-2222-4222-8222-222222222222', :org, :acct, :sub, :tar, 'T', 'tariff_period', 0, 500000,
   'RUB', 'month', '2026-06-01', '2026-07-01', 'pending', 'mock', 'proof-period-1');
UPDATE public.saas_billing_invoices SET status = 'void'
 WHERE id = '22222222-2222-4222-8222-222222222222';
SELECT status AS period_invoice_status FROM public.saas_billing_invoices
 WHERE id = '22222222-2222-4222-8222-222222222222';

\echo '--- 3. перевыставление: void ВМЕСТЕ с преемником разрешено ---'
INSERT INTO public.saas_billing_invoices
  (id, organization_id, saas_billing_account_id, saas_billing_subscription_id, tariff_id, tariff_name,
   invoice_kind, additional_seat_quantity, amount_minor, currency, tariff_billing_period,
   service_period_starts_at, service_period_ends_at, status, provider_id, provider_idempotency_key)
VALUES
  ('33333333-3333-4333-8333-333333333333', :org, :acct, :sub, :tar, 'T', 'seat_overage', 1, 150000,
   'RUB', 'month', '2026-07-01', '2026-08-01', 'draft', 'mock', 'proof-seat-successor');
UPDATE public.saas_billing_invoices
   SET status = 'void', superseded_by_invoice_id = '33333333-3333-4333-8333-333333333333'
 WHERE id = '11111111-1111-4111-8111-111111111111';
SELECT status AS seat_invoice_status, superseded_by_invoice_id IS NOT NULL AS has_successor
  FROM public.saas_billing_invoices WHERE id = '11111111-1111-4111-8111-111111111111';

\echo '--- 4. и обратно: снять преемника, оставив void, тоже нельзя ---'
SAVEPOINT s4;
UPDATE public.saas_billing_invoices SET superseded_by_invoice_id = NULL
 WHERE id = '11111111-1111-4111-8111-111111111111';
ROLLBACK TO SAVEPOINT s4;
ROLLBACK;
