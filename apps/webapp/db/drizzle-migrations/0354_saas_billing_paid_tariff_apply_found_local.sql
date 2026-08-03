-- TEMPORARY LOCAL MIGRATION NUMBER 0354 -- final number assigned at merge.
-- #1057 B0.3: root cause of "клиника не может оплатить тариф на TEST end-to-end" through both the
-- 03.08 and 04.08 live-payment runs, found by a live DEV measurement (not by reading code): a real
-- ЮKassa test payment succeeded, the webhook was delivered, `app.current_org_id()` resolved
-- correctly under the signed `locked`-mode principal, and `UPDATE saas_billing_invoices SET
-- status='paid'` genuinely affected the row inside the SAME transaction (`rowCount=1`, confirmed by
-- re-reading it back) -- yet `app.apply_paid_saas_billing_tariff` still returned `applied=false`,
-- which made the caller (`pgSaasBilling.ts:126`) throw `saas_billing_tariff_apply_failed` and roll
-- back the whole transaction, undoing even the correct invoice-paid write.
--
-- `0350` (this same #1057 branch) folded a second write into this SECURITY DEFINER accessor --
-- ending the organization's active trial -- and left the function's tail as a bare `RETURN FOUND;`.
-- In PL/pgSQL, `FOUND` is overwritten by every UPDATE/SELECT INTO/etc. that runs, reflecting only
-- the MOST RECENT statement. The accessor runs two UPDATEs before that RETURN:
--   1. `UPDATE be_organizations SET tariff_id = ...` -- the write that actually matters here;
--   2. `UPDATE saas_organization_trials SET status = 'ended' ... WHERE status = 'active'` -- ends an
--      active trial, correctly a no-op (0 rows) for any organization with no trial row at all or
--      whose trial already ended, i.e. every organization past its first paid period.
-- `RETURN FOUND` therefore returned whatever (2) found, not (1) -- so EVERY renewal/upgrade payment
-- for a clinic without a currently-active trial reported `applied=false` regardless of whether the
-- tariff was actually applied. Reproduced live on DEV (ROLLBACK, no lasting effect): signed org
-- context installed correctly, `current_user=app_staff`, `app.current_org_id()` matched, the invoice
-- UPDATE affected 1 row and was independently re-readable as `status='paid'` in the same
-- transaction, `saas_organization_trials` had zero rows for the organization (no trial, ever) -- and
-- the accessor still returned `false`. `be_organizations.tariff_id` was confirmed unaffected only
-- because it already equalled the invoice's tariff in that probe; the underlying UPDATE itself does
-- affect the row (`FOUND` was true right after statement 1) regardless of value equality.
--
-- Fix: capture whether the tariff write itself matched a row immediately after that UPDATE, before
-- the trial-ending UPDATE has a chance to overwrite `FOUND`. The trial-ending UPDATE stays exactly
-- as `0350` added it (idempotent no-op when there is no active trial) -- it is not this function's
-- success signal, it never was meant to be.
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
  v_applied boolean;
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

  v_applied := FOUND;

  UPDATE public.saas_organization_trials
  SET status = 'ended', updated_at = now()
  WHERE organization_id = p_organization_id
    AND status = 'active';

  RETURN v_applied;
END;
$function$;
--> statement-breakpoint

COMMENT ON FUNCTION app.apply_paid_saas_billing_tariff(uuid, uuid) IS
  'Narrow fail-closed accessor for the SaaS tariff-payment capture path: applies the tariff of a confirmed-paid invoice to its own organization''s be_organizations.tariff_id and ends that organization''s active trial (if any), bypassing app.reject_staff_commercial_organization_update() and app_staff''s missing UPDATE grant on saas_organization_trials (SECURITY DEFINER owned by app_owner, not app_staff) without weakening either for any direct app_staff write. Never takes a tariff from the caller -- only from the paid invoice row itself, verified to belong to the given organization -- so it cannot be used to set an arbitrary tariff on an arbitrary organization. Success reflects only the be_organizations tariff write (captured via FOUND right after that UPDATE, before the trial-ending UPDATE below can overwrite it) -- ending a trial is a best-effort side effect, not the success signal, and its own no-op (no active trial) must never make an otherwise-successful tariff apply report failure. Returns false (never raises) for an unpaid invoice, a foreign organization, or an unknown invoice id.';
