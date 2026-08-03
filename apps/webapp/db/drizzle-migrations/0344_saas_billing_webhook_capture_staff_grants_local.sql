-- TEMPORARY LOCAL MIGRATION NUMBER 0344
-- #1057 B0.3: 0343 lets the webhook resolve its invoice as the bootstrap principal; the very next
-- statement the route runs is `captureSaasBillingProviderWebhookEvent`
-- (`apps/webapp/src/app/api/payments/saas-webhook/[provider]/route.ts:114`) through
-- `runWithDbOrganizationPrincipal`, which `SET ROLE app_staff` for an 'organization' principal
-- (`packages/db-principal/src/index.ts`'s `dbRuntimeRoleForPrincipal`). `0311` granted only
-- `app_clinic_billing` on `saas_billing_accounts`/`saas_billing_subscriptions`/`saas_billing_invoices`;
-- `app_staff` has never held any privilege on those tables nor on `saas_billing_provider_events`.
--
-- Reproduced live on DEV before writing this migration (rolled back, no lasting effect):
--   BEGIN; SET ROLE app_staff;
--   INSERT INTO public.saas_billing_provider_events (organization_id, saas_billing_invoice_id,
--     provider_id, provider_event_id, event_type, raw_payload) VALUES (...);
--   -> ERROR: permission denied for table saas_billing_provider_events
-- The same session, still under app_staff with a real org context installed, also shows
-- `permission denied for table saas_billing_invoices` and `... saas_billing_subscriptions` on the
-- plain SELECTs `captureSaasBillingPaymentSucceeded`/`promotePaidInvoice`
-- (`apps/webapp/src/infra/repos/pgSaasBilling.ts`) issue.
--
-- A second, quieter gap in the same capture path: `public.be_organizations` already grants
-- `app_staff` table-level UPDATE, but the only permissive policy for that role is
-- `be_organizations_staff_current_org_read` (SELECT only) -- FORCE RLS with no matching UPDATE
-- policy does not error, it silently affects zero rows. Reproduced live (rolled back): under the
-- same app_staff + org context, `UPDATE public.be_organizations SET tariff_id = tariff_id WHERE id =
-- app.current_org_id()` returns `UPDATE 0`. Left unfixed, `promotePaidInvoice`'s
-- `tx.update(beOrganizations).set({ tariffId })` would silently no-op after a real payment: the
-- invoice would show paid while the clinic's tariff never actually changed.
--
-- Fix is an exact grant scoped to the operations the capture path actually performs
-- (`recordSaasBillingProviderEvent`, `captureSaasBillingPaymentSucceeded`, `markSaasBillingInvoiceFailed`,
-- `promotePaidInvoice`), using the same `app.current_org_id()`-scoped RLS shape `0311` already uses for
-- `app_clinic_billing` on the same three tables. No INSERT is granted on
-- `saas_billing_invoices`/`saas_billing_subscriptions` -- capture never creates either row, only reads
-- (row-locking) and updates one the clinic-billing door already created.

-- Found live on DEV while reproducing the gap above, backed by no migration or deploy/postgres
-- overlay anywhere in the repo (`grep -rn "webhook_bootstrap\|staff_org_write" deploy/
-- apps/webapp/db` -- zero hits): an undocumented, broader-than-this-fix stopgap had already been
-- applied by hand -- `saas_billing_invoices_webhook_bootstrap_select`/`_write` granting the
-- bootstrap-reachable `bcb_dev_runtime_nonstaff_login` login `USING (true)` (unscoped, full-table)
-- SELECT/UPDATE on `saas_billing_invoices`, plus the same shape on
-- `saas_billing_provider_events`/`saas_billing_subscriptions`, and inert (grant-less, so harmless
-- but stray) `*_staff_org_write` ALL-command policies duplicating what this migration adds
-- properly. That bootstrap grant is exactly what `0343`'s SECURITY DEFINER resolver was written to
-- avoid ("never the full row, no table grant to any runtime-reachable role") -- left in place it
-- is a live, wider-than-intended hole on DEV. Superseded here: dropped and revoked, DEV-only
-- (guarded on role existence so this runs unchanged on TEST/PROD, which never had it).
DROP POLICY IF EXISTS saas_billing_invoices_webhook_bootstrap_select ON public.saas_billing_invoices;
DROP POLICY IF EXISTS saas_billing_invoices_webhook_bootstrap_write ON public.saas_billing_invoices;
DROP POLICY IF EXISTS saas_billing_invoices_staff_org_write ON public.saas_billing_invoices;
DROP POLICY IF EXISTS saas_billing_subscriptions_webhook_bootstrap_write ON public.saas_billing_subscriptions;
DROP POLICY IF EXISTS saas_billing_subscriptions_staff_org_write ON public.saas_billing_subscriptions;
DROP POLICY IF EXISTS saas_billing_provider_events_webhook_bootstrap_write ON public.saas_billing_provider_events;
DROP POLICY IF EXISTS saas_billing_provider_events_staff_org_write ON public.saas_billing_provider_events;
--> statement-breakpoint

-- Same undocumented-drift class, found by the same grep (also zero hits in the repo): a redundant
-- `_clinic_billing_write` ALL-command policy per table duplicates exactly what 0311's
-- `_clinic_billing_select`/`_clinic_billing_insert`/`_clinic_billing_update` policies already cover
-- for `app_clinic_billing` (identical qual, narrower per-command policies already grant every
-- operation the working checkout path (B0.3a) uses) -- dropping it changes no behavior, only
-- removes an ungoverned duplicate the exact-grant assertion below does not expect.
DROP POLICY IF EXISTS saas_billing_accounts_clinic_billing_write ON public.saas_billing_accounts;
DROP POLICY IF EXISTS saas_billing_subscriptions_clinic_billing_write ON public.saas_billing_subscriptions;
DROP POLICY IF EXISTS saas_billing_invoices_clinic_billing_write ON public.saas_billing_invoices;
--> statement-breakpoint

DO $revoke_stray_dev_bootstrap_grant$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bcb_dev_runtime_nonstaff_login') THEN
    REVOKE ALL PRIVILEGES ON TABLE
      public.saas_billing_invoices,
      public.saas_billing_subscriptions,
      public.saas_billing_provider_events
    FROM bcb_dev_runtime_nonstaff_login;
  END IF;
END
$revoke_stray_dev_bootstrap_grant$;
--> statement-breakpoint

GRANT SELECT, UPDATE ON TABLE public.saas_billing_invoices TO app_staff;
--> statement-breakpoint
GRANT SELECT, UPDATE ON TABLE public.saas_billing_subscriptions TO app_staff;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE public.saas_billing_provider_events TO app_staff;
--> statement-breakpoint

DROP POLICY IF EXISTS saas_billing_invoices_staff_capture_select ON public.saas_billing_invoices;
CREATE POLICY saas_billing_invoices_staff_capture_select ON public.saas_billing_invoices
  FOR SELECT TO app_staff
  USING (app.current_org_id() IS NOT NULL AND organization_id = app.current_org_id());
--> statement-breakpoint

DROP POLICY IF EXISTS saas_billing_invoices_staff_capture_update ON public.saas_billing_invoices;
CREATE POLICY saas_billing_invoices_staff_capture_update ON public.saas_billing_invoices
  FOR UPDATE TO app_staff
  USING (app.current_org_id() IS NOT NULL AND organization_id = app.current_org_id())
  WITH CHECK (app.current_org_id() IS NOT NULL AND organization_id = app.current_org_id());
--> statement-breakpoint

DROP POLICY IF EXISTS saas_billing_subscriptions_staff_capture_select ON public.saas_billing_subscriptions;
CREATE POLICY saas_billing_subscriptions_staff_capture_select ON public.saas_billing_subscriptions
  FOR SELECT TO app_staff
  USING (app.current_org_id() IS NOT NULL AND organization_id = app.current_org_id());
--> statement-breakpoint

DROP POLICY IF EXISTS saas_billing_subscriptions_staff_capture_update ON public.saas_billing_subscriptions;
CREATE POLICY saas_billing_subscriptions_staff_capture_update ON public.saas_billing_subscriptions
  FOR UPDATE TO app_staff
  USING (app.current_org_id() IS NOT NULL AND organization_id = app.current_org_id())
  WITH CHECK (app.current_org_id() IS NOT NULL AND organization_id = app.current_org_id());
--> statement-breakpoint

DROP POLICY IF EXISTS saas_billing_provider_events_staff_capture_select ON public.saas_billing_provider_events;
CREATE POLICY saas_billing_provider_events_staff_capture_select ON public.saas_billing_provider_events
  FOR SELECT TO app_staff
  USING (app.current_org_id() IS NOT NULL AND organization_id = app.current_org_id());
--> statement-breakpoint

DROP POLICY IF EXISTS saas_billing_provider_events_staff_capture_insert ON public.saas_billing_provider_events;
CREATE POLICY saas_billing_provider_events_staff_capture_insert ON public.saas_billing_provider_events
  FOR INSERT TO app_staff
  WITH CHECK (app.current_org_id() IS NOT NULL AND organization_id = app.current_org_id());
--> statement-breakpoint

DROP POLICY IF EXISTS saas_billing_provider_events_staff_capture_update ON public.saas_billing_provider_events;
CREATE POLICY saas_billing_provider_events_staff_capture_update ON public.saas_billing_provider_events
  FOR UPDATE TO app_staff
  USING (app.current_org_id() IS NOT NULL AND organization_id = app.current_org_id())
  WITH CHECK (app.current_org_id() IS NOT NULL AND organization_id = app.current_org_id());
--> statement-breakpoint

-- be_organizations already grants app_staff table-level UPDATE (pre-existing, broader than this one
-- migration -- staff manage other organization fields too); only the missing permissive UPDATE policy
-- is added here, matching the existing staff SELECT policy's exact scoping expression.
DROP POLICY IF EXISTS be_organizations_staff_current_org_update ON public.be_organizations;
CREATE POLICY be_organizations_staff_current_org_update ON public.be_organizations
  FOR UPDATE TO app_staff
  USING (app.is_staff() AND app.current_org_id() IS NOT NULL AND id = app.current_org_id())
  WITH CHECK (app.is_staff() AND app.current_org_id() IS NOT NULL AND id = app.current_org_id());
