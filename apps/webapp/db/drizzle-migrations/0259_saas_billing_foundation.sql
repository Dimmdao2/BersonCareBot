-- Phase 4 boxes 1-5: org-owned SaaS billing foundation.
-- Invoices are the charge primitive; provider events are a patient-free idempotency ledger.

CREATE TABLE public.saas_billing_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  billing_email text,
  legal_name text,
  tax_identifier text,
  registration_reason_code text,
  billing_address jsonb NOT NULL DEFAULT '{}'::jsonb,
  billing_requisites jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT saas_billing_accounts_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE,
  CONSTRAINT saas_billing_accounts_organization_uidx UNIQUE (organization_id),
  CONSTRAINT saas_billing_accounts_id_organization_uidx UNIQUE (id, organization_id)
);

CREATE INDEX idx_saas_billing_accounts_org_updated
  ON public.saas_billing_accounts (organization_id, updated_at);

CREATE TABLE public.saas_billing_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  saas_billing_account_id uuid NOT NULL,
  tariff_id uuid NOT NULL,
  source text NOT NULL,
  status text NOT NULL,
  lifecycle_state text NOT NULL,
  provider_id text,
  saved_payment_method_id text,
  current_period_starts_at timestamptz,
  current_period_ends_at timestamptz,
  grace_ends_at timestamptz,
  read_only_ends_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT saas_billing_subscriptions_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE,
  CONSTRAINT saas_billing_subscriptions_account_org_fkey
    FOREIGN KEY (saas_billing_account_id, organization_id)
    REFERENCES public.saas_billing_accounts(id, organization_id) ON DELETE CASCADE,
  CONSTRAINT saas_billing_subscriptions_tariff_id_fkey
    FOREIGN KEY (tariff_id) REFERENCES public.saas_tariffs(id) ON DELETE RESTRICT,
  CONSTRAINT saas_billing_subscriptions_org_source_uidx UNIQUE (organization_id, source),
  CONSTRAINT saas_billing_subscriptions_id_organization_uidx UNIQUE (id, organization_id),
  CONSTRAINT saas_billing_subscriptions_source_check
    CHECK (source IN ('manual', 'paid_subscription')),
  CONSTRAINT saas_billing_subscriptions_status_check
    CHECK (status IN ('pending_payment', 'active', 'expired', 'cancelled')),
  CONSTRAINT saas_billing_subscriptions_lifecycle_check
    CHECK (lifecycle_state IN ('active', 'grace', 'read_only', 'blocked')),
  CONSTRAINT saas_billing_subscriptions_period_check CHECK (
    (current_period_starts_at IS NULL AND current_period_ends_at IS NULL)
    OR (
      current_period_starts_at IS NOT NULL
      AND current_period_ends_at IS NOT NULL
      AND current_period_starts_at < current_period_ends_at
    )
  ),
  CONSTRAINT saas_billing_subscriptions_lifecycle_dates_check CHECK (
    (grace_ends_at IS NULL OR current_period_ends_at IS NULL OR grace_ends_at >= current_period_ends_at)
    AND (read_only_ends_at IS NULL OR grace_ends_at IS NULL OR read_only_ends_at >= grace_ends_at)
  )
);

CREATE INDEX idx_saas_billing_subscriptions_org_status
  ON public.saas_billing_subscriptions (organization_id, status);
CREATE INDEX idx_saas_billing_subscriptions_lifecycle
  ON public.saas_billing_subscriptions (lifecycle_state, grace_ends_at, read_only_ends_at);

CREATE TABLE public.saas_billing_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  saas_billing_account_id uuid NOT NULL,
  saas_billing_subscription_id uuid NOT NULL,
  tariff_id uuid NOT NULL,
  tariff_name text NOT NULL,
  amount_minor integer NOT NULL,
  currency text NOT NULL,
  tariff_billing_period text NOT NULL,
  service_period_starts_at timestamptz NOT NULL,
  service_period_ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  provider_id text NOT NULL,
  provider_invoice_ref text,
  provider_checkout_url text,
  provider_idempotency_key text NOT NULL,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT saas_billing_invoices_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE,
  CONSTRAINT saas_billing_invoices_account_org_fkey
    FOREIGN KEY (saas_billing_account_id, organization_id)
    REFERENCES public.saas_billing_accounts(id, organization_id) ON DELETE RESTRICT,
  CONSTRAINT saas_billing_invoices_saas_billing_subscription_org_fkey
    FOREIGN KEY (saas_billing_subscription_id, organization_id)
    REFERENCES public.saas_billing_subscriptions(id, organization_id) ON DELETE RESTRICT,
  CONSTRAINT saas_billing_invoices_tariff_id_fkey
    FOREIGN KEY (tariff_id) REFERENCES public.saas_tariffs(id) ON DELETE RESTRICT,
  CONSTRAINT saas_billing_invoices_id_organization_uidx UNIQUE (id, organization_id),
  CONSTRAINT saas_billing_invoices_provider_idempotency_uidx
    UNIQUE (provider_id, provider_idempotency_key),
  CONSTRAINT saas_billing_invoices_period_uidx
    UNIQUE (saas_billing_subscription_id, service_period_starts_at, service_period_ends_at),
  CONSTRAINT saas_billing_invoices_amount_check CHECK (amount_minor >= 0),
  CONSTRAINT saas_billing_invoices_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT saas_billing_invoices_period_check
    CHECK (service_period_starts_at < service_period_ends_at),
  CONSTRAINT saas_billing_invoices_tariff_billing_period_check
    CHECK (tariff_billing_period IN ('day', 'month', 'year')),
  CONSTRAINT saas_billing_invoices_status_check
    CHECK (status IN ('draft', 'pending', 'paid', 'failed', 'void'))
);

CREATE INDEX idx_saas_billing_invoices_org_created
  ON public.saas_billing_invoices (organization_id, created_at);
CREATE INDEX idx_saas_billing_invoices_status_created
  ON public.saas_billing_invoices (status, created_at);

CREATE TABLE public.saas_billing_provider_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  saas_billing_invoice_id uuid,
  provider_id text NOT NULL,
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  raw_payload jsonb NOT NULL,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT saas_billing_provider_events_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE,
  CONSTRAINT saas_billing_provider_events_invoice_org_fkey
    FOREIGN KEY (saas_billing_invoice_id, organization_id)
    REFERENCES public.saas_billing_invoices(id, organization_id) ON DELETE RESTRICT,
  CONSTRAINT saas_billing_provider_events_provider_event_uidx
    UNIQUE (provider_id, provider_event_id),
  CONSTRAINT saas_billing_provider_events_payload_check
    CHECK (
      jsonb_typeof(raw_payload) = 'object'
      AND raw_payload - ARRAY[
        'providerId',
        'providerEventId',
        'type',
        'status',
        'amountMinor',
        'currency',
        'invoiceReference',
        'subscriptionReference',
        'occurredAt'
      ] = '{}'::jsonb
    )
);

CREATE INDEX idx_saas_billing_provider_events_org_created
  ON public.saas_billing_provider_events (organization_id, created_at);
CREATE INDEX idx_saas_billing_provider_events_unprocessed
  ON public.saas_billing_provider_events (created_at)
  WHERE processed_at IS NULL;

-- Carry Phase 3 manual assignments into the canonical billing rows.
INSERT INTO public.saas_billing_accounts (organization_id)
SELECT organization.id
FROM public.be_organizations AS organization
WHERE organization.tariff_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.saas_organization_trials AS trial
    WHERE trial.organization_id = organization.id
      AND trial.status = 'active'
  )
ON CONFLICT (organization_id) DO NOTHING;

INSERT INTO public.saas_billing_subscriptions (
  organization_id,
  saas_billing_account_id,
  tariff_id,
  source,
  status,
  lifecycle_state
)
SELECT
  organization.id,
  account.id,
  organization.tariff_id,
  'manual',
  'active',
  'active'
FROM public.be_organizations AS organization
JOIN public.saas_billing_accounts AS account
  ON account.organization_id = organization.id
WHERE organization.tariff_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.saas_organization_trials AS trial
    WHERE trial.organization_id = organization.id
      AND trial.status = 'active'
  )
ON CONFLICT (organization_id, source) DO UPDATE SET
  tariff_id = EXCLUDED.tariff_id,
  status = 'active',
  lifecycle_state = 'active',
  cancelled_at = NULL,
  updated_at = now();

-- Restricted global platform-merchant config. Payee values stay data and intentionally start empty.
INSERT INTO public.system_settings (
  key,
  scope,
  organization_id,
  value_json,
  updated_at,
  updated_by
)
VALUES (
  'saas_billing_payment_provider',
  'admin',
  NULL,
  jsonb_build_object(
    'value',
    jsonb_build_object(
      'defaultProviderId', 'mock',
      'providers', jsonb_build_array(
        jsonb_build_object('id', 'mock', 'label', 'Mock', 'enabled', true)
      ),
      'payeeRequisites', jsonb_build_object(
        'legalEntityType', NULL,
        'taxIdentifier', NULL,
        'registrationReasonCode', NULL,
        'bankAccount', NULL,
        'taxRegime', NULL,
        'vatRate', NULL
      )
    )
  ),
  now(),
  NULL
)
ON CONFLICT (key, scope) WHERE organization_id IS NULL DO NOTHING;

INSERT INTO integrator.system_settings (
  key,
  scope,
  organization_id,
  value_json,
  updated_at,
  updated_by
)
SELECT key, scope, NULL, value_json, updated_at, updated_by::text
FROM public.system_settings
WHERE key = 'saas_billing_payment_provider'
  AND scope = 'admin'
  AND organization_id IS NULL
ON CONFLICT (key, scope) WHERE organization_id IS NULL DO UPDATE SET
  value_json = EXCLUDED.value_json,
  updated_at = EXCLUDED.updated_at,
  updated_by = EXCLUDED.updated_by;

-- Every new table is FORCE RLS. Platform operations own global billing mutations. Clinic billing
-- reads are installed by the re-applied C5A runtime overlay after it creates the dedicated
-- app_clinic_billing role; ambient app_staff receives no billing table privilege.
ALTER TABLE public.saas_billing_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_billing_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.saas_billing_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_billing_subscriptions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.saas_billing_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_billing_invoices FORCE ROW LEVEL SECURITY;
ALTER TABLE public.saas_billing_provider_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_billing_provider_events FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON TABLE
  public.saas_billing_accounts,
  public.saas_billing_subscriptions,
  public.saas_billing_invoices,
  public.saas_billing_provider_events
TO app_platform_settings;

REVOKE ALL PRIVILEGES ON TABLE
  public.saas_billing_accounts,
  public.saas_billing_subscriptions,
  public.saas_billing_invoices,
  public.saas_billing_provider_events
FROM app_patient;

CREATE POLICY saas_billing_accounts_platform_select
  ON public.saas_billing_accounts FOR SELECT TO app_platform_settings USING (true);
CREATE POLICY saas_billing_accounts_platform_insert
  ON public.saas_billing_accounts FOR INSERT TO app_platform_settings WITH CHECK (true);
CREATE POLICY saas_billing_accounts_platform_update
  ON public.saas_billing_accounts
  FOR UPDATE TO app_platform_settings USING (true) WITH CHECK (true);

CREATE POLICY saas_billing_subscriptions_platform_select
  ON public.saas_billing_subscriptions FOR SELECT TO app_platform_settings USING (true);
CREATE POLICY saas_billing_subscriptions_platform_insert
  ON public.saas_billing_subscriptions FOR INSERT TO app_platform_settings WITH CHECK (true);
CREATE POLICY saas_billing_subscriptions_platform_update
  ON public.saas_billing_subscriptions
  FOR UPDATE TO app_platform_settings USING (true) WITH CHECK (true);

CREATE POLICY saas_billing_invoices_platform_select
  ON public.saas_billing_invoices FOR SELECT TO app_platform_settings USING (true);
CREATE POLICY saas_billing_invoices_platform_insert
  ON public.saas_billing_invoices FOR INSERT TO app_platform_settings WITH CHECK (true);
CREATE POLICY saas_billing_invoices_platform_update
  ON public.saas_billing_invoices
  FOR UPDATE TO app_platform_settings USING (true) WITH CHECK (true);

CREATE POLICY saas_billing_provider_events_platform_select
  ON public.saas_billing_provider_events FOR SELECT TO app_platform_settings USING (true);
CREATE POLICY saas_billing_provider_events_platform_insert
  ON public.saas_billing_provider_events FOR INSERT TO app_platform_settings WITH CHECK (true);
CREATE POLICY saas_billing_provider_events_platform_update
  ON public.saas_billing_provider_events
  FOR UPDATE TO app_platform_settings USING (true) WITH CHECK (true);
