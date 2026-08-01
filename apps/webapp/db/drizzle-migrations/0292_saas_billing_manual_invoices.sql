-- К4: manual invoices from the platform cabinet.
-- `description` — admin-entered "за что" for a manual invoice; NULL for auto/renewal invoices
-- (those are fully described by `tariff_name` + the service period already on the row).
-- `expires_at` — the invoice's OWN payment deadline ("срок действия"), distinct from
-- `service_period_ends_at` (the paid period the invoice grants once paid). Overdue is derived by
-- comparing this to now at read time, never a stored status.
-- See docs/_TODO/SAAS_FOUNDATION/PAYMENTS_CABINET_PLAN.md К4.

ALTER TABLE public.saas_billing_invoices ADD COLUMN description text;
ALTER TABLE public.saas_billing_invoices ADD COLUMN expires_at timestamptz;
