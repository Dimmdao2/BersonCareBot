-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-VERIFY: SELECT count(*) = 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'saas_billing_invoices' AND column_name = 'storage_package_id'
--
-- Владелец 10.09.2026: «если человек хочет, он может просто докупить объём дополнительно»;
-- стоимость — «с момента покупки до конца периода подписки основного тарифа». План —
-- `docs/_TODO/STORAGE_PACKAGES_2026-09-10.md`, этап М3.
--
-- Докупка объёма — ВТОРОЙ вид покупки внутри оплаченного периода, устроенный ровно как первый
-- (место сверх тарифа): счёт на пропорциональную часть остатка, срок жизни — конец периода,
-- неоплаченный к концу периода долг переезжает в счёт продления (Р-15/Р-18/Р-19). Поэтому здесь
-- НЕ заводится вторая машинерия: правила, написанные для места, расширяются на оба вида — иначе у
-- одного правила появилось бы две реализации, и они разъехались бы молча, на деньгах.
--
-- `storage_package_id` на счёте — ССЫЛКА на пакет каталога, а не скопированные байты: сколько в
-- пакете места, знает каталог, и второго ответа на этот вопрос быть не должно. Колонка обязательна
-- для счёта за пакет и допустима (но не обязательна) для счёта продления, в сумму которого цена
-- действующего пакета входит строкой — так же, как входит количество мест.
--
-- Права на новую колонку выдаются НЕ здесь — `deploy/postgres/privileges/declaration.ts` +
-- reconcile (AGENTS.md §1).

ALTER TABLE public.saas_billing_invoices
  ADD COLUMN storage_package_id uuid
    REFERENCES public.saas_storage_packages(id) ON DELETE RESTRICT;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE public.saas_billing_invoices
  DROP CONSTRAINT IF EXISTS saas_billing_invoices_kind_check;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE public.saas_billing_invoices
  ADD CONSTRAINT saas_billing_invoices_kind_check
  CHECK (invoice_kind = ANY (ARRAY['tariff_period'::text, 'seat_overage'::text, 'storage_package'::text]));
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
-- Счёт за пакет обязан говорить, ЗА КАКОЙ пакет он выставлен: без этого продление не знает, что
-- продлевать, а возврат — что снимать.
ALTER TABLE public.saas_billing_invoices
  ADD CONSTRAINT saas_billing_invoices_storage_package_check
  CHECK (invoice_kind <> 'storage_package' OR storage_package_id IS NOT NULL);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
-- Р-17 распространяется на оба вида покупок внутри периода: такой счёт не аннулируется «просто
-- так» — он либо оплачен, либо перевыставлен с ссылкой на преемника, куда переехала его сумма.
ALTER TABLE public.saas_billing_invoices
  DROP CONSTRAINT IF EXISTS saas_billing_invoices_seat_void_has_successor_check;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE public.saas_billing_invoices
  ADD CONSTRAINT saas_billing_invoices_prorated_void_has_successor_check
  CHECK (
    invoice_kind NOT IN ('seat_overage', 'storage_package')
    OR status <> 'void'
    OR superseded_by_invoice_id IS NOT NULL
  );
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
-- Тот же частичный индекс, что искал долг за место, теперь покрывает обе покупки: перенос долга
-- ищет их одним запросом, и второго индекса (как и второго правила) не появляется.
CREATE INDEX IF NOT EXISTS idx_saas_billing_invoices_prorated_debt
  ON public.saas_billing_invoices (saas_billing_subscription_id, service_period_ends_at)
  WHERE invoice_kind IN ('seat_overage', 'storage_package') AND status IN ('draft', 'pending');
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
DROP INDEX IF EXISTS public.idx_saas_billing_invoices_seat_debt;
