-- Final migration number 0350.
-- #1057 B0.3: a genuinely fresh live TEST payment (2026-08-03, a clean test organization with no
-- prior billing history) reproduced a SECOND, previously undiscovered grant gap in the exact same
-- webhook capture path `0348` fixed the guard-trigger side of. `promotePaidInvoice`
-- (`apps/webapp/src/infra/repos/pgSaasBilling.ts`), immediately after applying the paid tariff on a
-- clinic's first-ever paid period, ends that organization's still-active trial with a direct
-- `UPDATE public.saas_organization_trials SET status = 'ended' ...` under `SET ROLE app_staff`
-- (`runWithDbOrganizationPrincipal`). `app_staff` only ever held `SELECT` on this table -- confirmed
-- live: `information_schema.role_table_grants` shows no `UPDATE` row for `app_staff` (or
-- `app_clinic_billing`) on `saas_organization_trials`. The webhook's own request log shows the
-- resulting `42501 permission denied for table saas_organization_trials` twice
-- (`2026-08-03 22:13:55`/`22:14:05`); the invoice stayed `pending`, no `saas_billing_provider_events`
-- row was written for it, and the organization's tariff/trial were left untouched -- no partial
-- state, no lasting effect.
--
-- Same idiom as `0348`, not a new one: fold the trial-ending write into the SAME narrow, fail-closed
-- SECURITY DEFINER accessor `apply_paid_saas_billing_tariff` already validates the paid invoice for,
-- rather than adding a second accessor (or a plain `app_staff` GRANT, which would hand every staff
-- session table-level UPDATE on this SaaS-sensitive table for the other, unrelated staff-facing
-- code paths that already read it). `CREATE OR REPLACE` keeps the exact signature and existing
-- EXECUTE grant to `app_staff` from `0348` -- nothing new to grant there. Ending an already-ended
-- trial (every payment after the clinic's first) is a zero-row, idempotent no-op, so removing the
-- old JS-side `subscription.currentPeriodEndsAt === null` gate around it (this migration's
-- companion product commit) changes no observable behavior on later periods.
GRANT UPDATE ON TABLE public.saas_organization_trials TO app_owner;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.apply_paid_saas_billing_tariff(
  p_saas_billing_invoice_id uuid,
  p_organization_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_tariff_id uuid;
BEGIN
  SELECT invoice.tariff_id INTO v_tariff_id
  FROM public.saas_billing_invoices AS invoice
  WHERE invoice.id = p_saas_billing_invoice_id
    AND invoice.organization_id = p_organization_id
    AND invoice.status = 'paid';

  IF v_tariff_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.be_organizations
  SET tariff_id = v_tariff_id
  WHERE id = p_organization_id;

  UPDATE public.saas_organization_trials
  SET status = 'ended', updated_at = now()
  WHERE organization_id = p_organization_id
    AND status = 'active';

  RETURN FOUND;
END;
$function$;
--> statement-breakpoint

COMMENT ON FUNCTION app.apply_paid_saas_billing_tariff(uuid, uuid) IS
  'Narrow fail-closed accessor for the SaaS tariff-payment capture path: applies the tariff of a confirmed-paid invoice to its own organization''s be_organizations.tariff_id and ends that organization''s active trial (if any), bypassing app.reject_staff_commercial_organization_update() and app_staff''s missing UPDATE grant on saas_organization_trials (SECURITY DEFINER owned by app_owner, not app_staff) without weakening either for any direct app_staff write. Never takes a tariff from the caller -- only from the paid invoice row itself, verified to belong to the given organization -- so it cannot be used to set an arbitrary tariff on an arbitrary organization. Returns false (never raises) for an unpaid invoice, a foreign organization, or an unknown invoice id.';
