-- К2: platform cabinet refunds against a paid saas_billing_invoices row.
-- `provider_idempotency_key` unique key is what makes a repeated refund click a no-op — the
-- reservation transaction inserts under this key; a retry with the same key finds the row already
-- there instead of inserting a second one. See docs/_TODO/SAAS_FOUNDATION/PAYMENTS_CABINET_PLAN.md К2.

CREATE TABLE public.saas_billing_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  saas_billing_invoice_id uuid NOT NULL,
  amount_minor integer NOT NULL,
  currency text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  provider_id text NOT NULL,
  provider_refund_ref text,
  provider_idempotency_key text NOT NULL,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT saas_billing_refunds_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE,
  CONSTRAINT saas_billing_refunds_invoice_org_fkey
    FOREIGN KEY (saas_billing_invoice_id, organization_id)
    REFERENCES public.saas_billing_invoices(id, organization_id) ON DELETE RESTRICT,
  CONSTRAINT saas_billing_refunds_provider_idempotency_uidx
    UNIQUE (provider_id, provider_idempotency_key),
  CONSTRAINT saas_billing_refunds_amount_check CHECK (amount_minor > 0),
  CONSTRAINT saas_billing_refunds_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT saas_billing_refunds_status_check
    CHECK (status IN ('pending', 'succeeded', 'failed', 'canceled'))
);

CREATE INDEX idx_saas_billing_refunds_invoice_created
  ON public.saas_billing_refunds (saas_billing_invoice_id, created_at);
CREATE INDEX idx_saas_billing_refunds_status_created
  ON public.saas_billing_refunds (status, created_at);
CREATE INDEX idx_saas_billing_refunds_provider_ref
  ON public.saas_billing_refunds (provider_id, provider_refund_ref);

-- Same RLS shape as the rest of the saas_billing_* family (0259): platform operations own every
-- write; no other role gets table privilege.
ALTER TABLE public.saas_billing_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_billing_refunds FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON TABLE public.saas_billing_refunds TO app_platform_settings;

REVOKE ALL PRIVILEGES ON TABLE public.saas_billing_refunds FROM app_patient;

CREATE POLICY saas_billing_refunds_platform_select
  ON public.saas_billing_refunds FOR SELECT TO app_platform_settings USING (true);
CREATE POLICY saas_billing_refunds_platform_insert
  ON public.saas_billing_refunds FOR INSERT TO app_platform_settings WITH CHECK (true);
CREATE POLICY saas_billing_refunds_platform_update
  ON public.saas_billing_refunds
  FOR UPDATE TO app_platform_settings USING (true) WITH CHECK (true);
