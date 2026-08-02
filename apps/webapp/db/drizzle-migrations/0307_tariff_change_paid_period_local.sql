-- #1057 #1069: a paid period keeps its effective tariff. Downgrades name only the next tariff;
-- invoices freeze the whole tariff row that was offered, so a later live-tariff edit cannot alter
-- what a webhook activates.
ALTER TABLE public.saas_billing_subscriptions
  ADD COLUMN pending_tariff_id uuid REFERENCES public.saas_tariffs(id) ON DELETE RESTRICT;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_saas_billing_subscriptions_pending_tariff
  ON public.saas_billing_subscriptions (pending_tariff_id);
--> statement-breakpoint

ALTER TABLE public.saas_billing_invoices
  ADD COLUMN tariff_snapshot jsonb;
