-- TEMPORARY LOCAL MIGRATION NUMBER 0345
-- RECONCILES-MIGRATION-HASH: 0343_saas_billing_webhook_bootstrap_invoice_read_local
--
-- #1057 B0.3: applying this branch's migrations to DEV (`bash deploy/host/migrate-dev.sh
-- --execute`) surfaced a genuine migration-number COLLISION, the exact failure mode
-- `AGENTS.md` §1 warns about ("миграция под уже применённым номером не доедет никогда"): a
-- DIFFERENT parallel worktree (`wt/owner-findings-fix`) independently reserved and applied its
-- OWN, unrelated migration under the SAME number `0343`
-- (`0343_webapp_preauth_oauth_provider_capability_local.sql`, commit `03c929f7a1d`) to this SAME
-- shared `bcb_webapp_dev` database, using the same journal `when` value
-- (`1793539230047`) as this branch's `0343_saas_billing_webhook_bootstrap_invoice_read_local`.
-- Confirmed live: `drizzle.__drizzle_migrations` has exactly one row at `created_at=1793539230047`,
-- and its hash belongs to the OTHER branch's file (its function
-- `app.read_webapp_preauth_provider_setting(text)` exists on DEV); this branch's own
-- `app.resolve_saas_billing_invoice_for_webhook(text,text)` does NOT exist
-- (`to_regprocedure(...)` returned NULL) even after `pnpm migrate` completed with exit 0 --
-- the installed migrator advances a single `created_at` watermark, not per-hash, so once another
-- migration occupies that watermark slot the real `0343` body can never run through the ordinary
-- migrator again. Same repair idiom as `0330`/`0331`: an append-only forward migration that
-- reapplies the missed body and declares the reconciliation so
-- `apps/webapp/scripts/check-drizzle-journal-sync.sh` and the completeness check in
-- `run-webapp-drizzle-migrate.mjs` both treat `0343` as satisfied. `0343`'s own file is untouched.

GRANT SELECT ON TABLE public.saas_billing_invoices TO app_owner;
--> statement-breakpoint

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
