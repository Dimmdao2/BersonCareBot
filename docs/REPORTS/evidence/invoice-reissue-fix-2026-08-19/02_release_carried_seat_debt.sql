-- Ф2: шов снимает переехавший долг ровно на оплаченную сумму и не трогает уже оплаченный счёт.
-- Тело берётся ИЗ БАЗЫ (`pg_get_functiondef`) и переименовывается, снимается только строка гейта
-- контекста — арифметика и обход цепочки проверяются те самые, что стоят в каталоге.
-- Транзакция заканчивается ROLLBACK — DEV не меняется.
BEGIN;
\set ON_ERROR_STOP off
\set org   '''da6a96cb-8e94-4ec2-99da-2258bda0ce4d'''
\set sub   '''4e48935b-c20d-4185-a516-9957b575f726'''
\set acct  '''199b5010-8669-4e40-8796-a3b4375dd276'''
\set tar   '''e07db366-f471-40a5-bc9b-499908636acd'''

\echo '--- 0. настоящий шов без принятого контекста отказывает ---'
SAVEPOINT gate;
SELECT app.release_carried_seat_debt('11111111-1111-4111-8111-111111111111'::uuid, :org::uuid);
ROLLBACK TO SAVEPOINT gate;

-- Копия живого тела без строки гейта: проверяется расчёт, а не право вызова.
DO $$
DECLARE body text;
BEGIN
  SELECT pg_get_functiondef('app.release_carried_seat_debt(uuid,uuid)'::regprocedure) INTO body;
  body := replace(body, 'app.release_carried_seat_debt', 'public.proof_release_carried_seat_debt');
  body := regexp_replace(body, 'PERFORM app\.require_attested_context_for_roles\([^;]*;', '');
  IF body LIKE '%require_attested_context%' THEN
    RAISE EXCEPTION 'proof copy still carries the context gate — the test would prove nothing';
  END IF;
  body := replace(body, 'SECURITY DEFINER', '');
  EXECUTE body;
END $$;

INSERT INTO public.saas_billing_invoices
  (id, organization_id, saas_billing_account_id, saas_billing_subscription_id, tariff_id, tariff_name,
   invoice_kind, additional_seat_quantity, amount_minor, carried_debt_minor, currency,
   tariff_billing_period, service_period_starts_at, service_period_ends_at, status, provider_id,
   provider_idempotency_key)
VALUES
  -- место июля, 150 000, не оплачено
  ('11111111-1111-4111-8111-111111111111', :org, :acct, :sub, :tar, 'T', 'seat_overage', 1, 150000, 0,
   'RUB', 'month', '2026-07-01', '2026-08-01', 'pending', 'mock', 'proof-seat-july'),
  -- счёт августа: тариф 500 000 + переехавший долг 150 000
  ('22222222-2222-4222-8222-222222222222', :org, :acct, :sub, :tar, 'T', 'tariff_period', 0, 650000, 150000,
   'RUB', 'month', '2026-08-01', '2026-09-01', 'draft', 'mock', 'proof-period-august');
UPDATE public.saas_billing_invoices
   SET status = 'void', superseded_by_invoice_id = '22222222-2222-4222-8222-222222222222'
 WHERE id = '11111111-1111-4111-8111-111111111111';

\echo '--- 1. долг снят ровно на сумму оплаченного счёта ---'
SELECT public.proof_release_carried_seat_debt('11111111-1111-4111-8111-111111111111'::uuid, :org::uuid) AS outcome;
SELECT amount_minor, carried_debt_minor FROM public.saas_billing_invoices
 WHERE id = '22222222-2222-4222-8222-222222222222';

\echo '--- 2. повторный вызов не снимает второй раз ---'
SELECT public.proof_release_carried_seat_debt('11111111-1111-4111-8111-111111111111'::uuid, :org::uuid) AS outcome;
SELECT amount_minor, carried_debt_minor FROM public.saas_billing_invoices
 WHERE id = '22222222-2222-4222-8222-222222222222';

\echo '--- 3. преемник уже оплачен — долг не снимается, сумма не правится ---'
SAVEPOINT paid_successor;
UPDATE public.saas_billing_invoices SET amount_minor = 650000, carried_debt_minor = 150000
 WHERE id = '22222222-2222-4222-8222-222222222222';
UPDATE public.saas_billing_invoices SET status = 'paid', paid_at = now()
 WHERE id = '22222222-2222-4222-8222-222222222222';
SELECT public.proof_release_carried_seat_debt('11111111-1111-4111-8111-111111111111'::uuid, :org::uuid) AS outcome;
SELECT amount_minor, carried_debt_minor FROM public.saas_billing_invoices
 WHERE id = '22222222-2222-4222-8222-222222222222';
ROLLBACK TO SAVEPOINT paid_successor;

\echo '--- 4. чужая организация до счёта не достаёт ---'
SELECT public.proof_release_carried_seat_debt('11111111-1111-4111-8111-111111111111'::uuid,
       '00000000-0000-4000-8000-000000000000'::uuid) AS outcome;
ROLLBACK;
