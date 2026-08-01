-- TEMPORARY LOCAL MIGRATION NUMBER 0293 -- the lead assigns the final number at merge.
-- К6 (docs/_TODO/SAAS_FOUNDATION/PAYMENTS_CABINET_PLAN.md): autopay off the saved payment method.
-- `saved_payment_method_id` already existed unused since 0259; this adds the explicit-consent
-- record that gates actually charging it. Consent is stored as a (date, text) pair — the EXACT
-- text the payer saw — not a boolean, so a later copy change never rewrites what someone agreed
-- to. Revoking clears `autopay_revoked_at` back on grant, keeping "active" a simple two-column
-- read: `autopay_consented_at IS NOT NULL AND autopay_revoked_at IS NULL`.

ALTER TABLE public.saas_billing_subscriptions
  ADD COLUMN autopay_consented_at timestamptz,
  ADD COLUMN autopay_consent_text text,
  ADD COLUMN autopay_revoked_at timestamptz;

ALTER TABLE public.saas_billing_subscriptions
  ADD CONSTRAINT saas_billing_subscriptions_autopay_consent_check
  CHECK ((autopay_consented_at IS NULL) = (autopay_consent_text IS NULL));
