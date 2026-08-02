-- #1057 #1069: paid additional specialist seats are a separate purchase, never a tariff period.
ALTER TABLE public.saas_billing_subscriptions
  ADD COLUMN paid_additional_seats integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE public.saas_billing_subscriptions
  ADD CONSTRAINT saas_billing_subscriptions_paid_additional_seats_check
  CHECK (paid_additional_seats >= 0);
--> statement-breakpoint
ALTER TABLE public.saas_billing_invoices
  ADD COLUMN invoice_kind text,
  ADD COLUMN additional_seat_quantity integer NOT NULL DEFAULT 0;
--> statement-breakpoint
UPDATE public.saas_billing_invoices
SET invoice_kind = CASE
  WHEN description LIKE 'Дополнительное место специалиста сверх тарифа — %' THEN 'seat_overage'
  ELSE 'tariff_period'
END,
additional_seat_quantity = CASE
  WHEN description LIKE 'Дополнительное место специалиста сверх тарифа — %' THEN 1
  ELSE 0
END;
--> statement-breakpoint
UPDATE public.saas_billing_subscriptions s
SET paid_additional_seats = paid.seats
FROM (
  SELECT saas_billing_subscription_id, sum(additional_seat_quantity)::integer AS seats
  FROM public.saas_billing_invoices
  WHERE invoice_kind = 'seat_overage' AND status = 'paid'
  GROUP BY saas_billing_subscription_id
) paid
WHERE paid.saas_billing_subscription_id = s.id;
--> statement-breakpoint
ALTER TABLE public.saas_billing_invoices
  ALTER COLUMN invoice_kind SET NOT NULL,
  ALTER COLUMN invoice_kind DROP DEFAULT,
  ADD CONSTRAINT saas_billing_invoices_kind_check
    CHECK (invoice_kind IN ('tariff_period', 'seat_overage')),
  ADD CONSTRAINT saas_billing_invoices_additional_seat_quantity_check
    CHECK (additional_seat_quantity >= 0 AND (invoice_kind <> 'seat_overage' OR additional_seat_quantity > 0));
--> statement-breakpoint
ALTER TABLE public.saas_billing_invoices
  DROP CONSTRAINT IF EXISTS saas_billing_invoices_period_uidx;
--> statement-breakpoint
CREATE UNIQUE INDEX saas_billing_invoices_period_uidx
  ON public.saas_billing_invoices (saas_billing_subscription_id, service_period_starts_at, service_period_ends_at)
  WHERE invoice_kind = 'tariff_period';
--> statement-breakpoint
CREATE UNIQUE INDEX saas_billing_invoices_provider_ref_uidx
  ON public.saas_billing_invoices (provider_id, provider_invoice_ref)
  WHERE provider_invoice_ref IS NOT NULL;
