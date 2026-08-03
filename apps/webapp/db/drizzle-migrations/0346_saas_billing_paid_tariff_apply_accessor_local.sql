-- TEMPORARY LOCAL MIGRATION NUMBER 0346
-- #1057 B0.3: applies the tariff of a confirmed-paid invoice onto its organization. The capture
-- path (`captureSaasBillingPaymentSucceeded` -> `promotePaidInvoice` and the tariff-upgrade branch,
-- `apps/webapp/src/infra/repos/pgSaasBilling.ts`) runs under `SET ROLE app_staff`
-- (`runWithDbOrganizationPrincipal`), and the long-standing guard trigger
-- `app.reject_staff_commercial_organization_update()` (`0225`/`0297`) unconditionally forbids
-- `app_staff` from changing `be_organizations.tariff_id`. The guard is right -- staff must not
-- self-grant a commercial tier -- it just does not know a webhook-driven capture write is
-- legitimate, and the fix is not to teach it that (see below).
--
-- Reproduced live on TEST 2026-08-03, no lasting effect (the transaction rolled back on its own):
-- a real, provider-confirmed webhook capture reached exactly this UPDATE and failed with
-- `platform_commercial_capability_required`, `PL/pgSQL function
-- app.reject_staff_commercial_organization_update() line 5 at RAISE`. Invoice stayed `pending`,
-- `saas_billing_provider_events` gained zero rows, the organization's tariff was untouched.
--
-- Fix is the same idiom as `0226`/`0245`/`0343`: a narrow, fail-closed SECURITY DEFINER accessor
-- owned by `app_owner`. Inside a SECURITY DEFINER function `current_user` becomes the function's
-- owner for the duration of the call, so the guard trigger's `current_user = 'app_staff'` check is
-- false there and the write proceeds -- without touching the trigger, without widening RLS, and
-- without granting `app_staff` anything beyond EXECUTE on this one function.
--
-- The tariff is never taken from the caller: it is read from the invoice row itself, after
-- verifying the invoice belongs to the given organization and is `status = 'paid'`. There is no
-- parameter that lets a caller name an arbitrary tariff or target a foreign organization -- an
-- unpaid invoice, a foreign organization, or an unknown invoice id all make the function a no-op
-- (returns false); it never raises, so it never leaks which of the three happened.
--
-- app_owner already holds SELECT on `saas_billing_invoices` from `0343`. It already holds
-- unrestricted table-level SELECT/UPDATE on `be_organizations` too on hosts that have applied
-- `deploy/postgres/patient-invites-rls.sql` (U3B) -- confirmed live on DEV before writing this
-- migration -- but that file is a host-applied overlay, not part of this migration chain: a
-- migration-only build (disposable PostgreSQL, a disaster-recovery rebuild) does not have it.
-- Proven live against exactly such a build: a column-scoped `UPDATE (tariff_id)` grant alone still
-- failed `permission denied for table be_organizations`, because `UPDATE ... WHERE id = ...` also
-- needs SELECT on `id` for the WHERE clause -- not just UPDATE on the assigned column. Grant the
-- same table-level SELECT, UPDATE shape U3B already uses, so the migration chain alone is
-- sufficient regardless of overlay order.
GRANT SELECT, UPDATE ON TABLE public.be_organizations TO app_owner;
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

  RETURN FOUND;
END;
$function$;
--> statement-breakpoint

ALTER FUNCTION app.apply_paid_saas_billing_tariff(uuid, uuid) OWNER TO app_owner;
REVOKE ALL ON FUNCTION app.apply_paid_saas_billing_tariff(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.apply_paid_saas_billing_tariff(uuid, uuid) TO app_staff;
--> statement-breakpoint

COMMENT ON FUNCTION app.apply_paid_saas_billing_tariff(uuid, uuid) IS
  'Narrow fail-closed accessor for the SaaS tariff-payment capture path: applies the tariff of a confirmed-paid invoice to its own organization''s be_organizations.tariff_id, bypassing app.reject_staff_commercial_organization_update() (SECURITY DEFINER owned by app_owner, not app_staff) without weakening that guard for any direct app_staff write. Never takes a tariff from the caller -- only from the paid invoice row itself, verified to belong to the given organization -- so it cannot be used to set an arbitrary tariff on an arbitrary organization. Returns false (never raises) for an unpaid invoice, a foreign organization, or an unknown invoice id.';
