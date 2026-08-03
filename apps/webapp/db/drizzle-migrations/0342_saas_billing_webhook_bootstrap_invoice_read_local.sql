-- TEMPORARY LOCAL MIGRATION NUMBER 0342 — the lead assigns the final number at merge.
-- #1057 B0.3: the live YooKassa webhook arrived for the first time 03.08 and failed
-- `permission denied for table saas_billing_invoices`. `POST /api/payments/saas-webhook/[provider]`
-- resolves its invoice by provider ref BEFORE the organization is known (bootstrap principal — see
-- the route's own header comment), and `0311` only ever granted `app_clinic_billing`, which the
-- bootstrap connection never becomes (it stays on its bare NOINHERIT login the whole request, see
-- `packages/db-principal/src/index.ts`'s `bootstrap`/`infra` case and
-- `deploy/postgres/dev-c1-bootstrap-schema-app-grants.sql`'s header for the same fact proven live).
--
-- Fix is the same idiom `0226`/`0245` already use for a bootstrap-reachable provider lookup: a
-- narrow, fail-closed SECURITY DEFINER resolver, owned by the BYPASSRLS `app_owner`, returning only
-- the `(id, organization_id, amount_minor, currency)` fields the webhook's unknown-reference/
-- amount-mismatch/currency-mismatch check genuinely needs for a `(provider_id,
-- provider_invoice_ref)` pair — never the full row, no table grant to any runtime-reachable role.
-- EXECUTE reaches the actual bootstrap login only via the TEST D3.4 closure
-- (`deploy/postgres/d3-4-bootstrap-base-login-read-grants.sql` + `deploy/host/deploy-test-saas.sh`),
-- not a static role grant here — no authenticated principal ever calls this function, so there is
-- nothing to grant `app_staff`/`app_patient`/`app_clinic_billing`.

GRANT SELECT ON TABLE public.saas_billing_invoices TO app_owner;
--> statement-breakpoint

-- Returns only the four fields `resolveSaasBillingInvoiceForWebhook` (modules/saas-billing/service.ts)
-- actually reads to decide unknown-reference/amount-mismatch/currency-mismatch/resolved — never the
-- full row (tariff snapshot, description, checkout url, ...). Capture itself stays a separate,
-- org-scoped step behind `runWithDbOrganizationPrincipal`, untouched by this migration.
CREATE OR REPLACE FUNCTION app.resolve_saas_billing_invoice_for_webhook(
  p_provider_id text,
  p_provider_invoice_ref text
)
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  amount_minor integer,
  currency text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT invoice.id, invoice.organization_id, invoice.amount_minor, invoice.currency
  FROM public.saas_billing_invoices AS invoice
  WHERE invoice.provider_id = p_provider_id
    AND invoice.provider_invoice_ref = p_provider_invoice_ref
  LIMIT 1;
$function$;
--> statement-breakpoint

ALTER FUNCTION app.resolve_saas_billing_invoice_for_webhook(text, text) OWNER TO app_owner;
REVOKE ALL ON FUNCTION app.resolve_saas_billing_invoice_for_webhook(text, text) FROM PUBLIC;

COMMENT ON FUNCTION app.resolve_saas_billing_invoice_for_webhook(text, text) IS
  'Narrow fail-closed bootstrap resolver for the SaaS tariff payment webhook: returns id/organization_id/amount_minor/currency for an exact (provider_id, provider_invoice_ref) pair before the organization principal is known. EXECUTE is granted only to the bootstrap/nonstaff runtime login by the D3.4 deploy closure, never to PUBLIC or any authenticated app_* role.';
