-- TEMPORARY LOCAL MIGRATION NUMBER 0311
-- #1057: the authenticated clinic billing surface must be able to derive its own assigned tariff
-- and create its own provider checkout records. All organization-owned reads and writes remain
-- pinned to the signed app.current_org_id() by FORCE RLS; the global tariff catalog is read-only.

GRANT SELECT ON TABLE public.saas_tariffs, public.be_organizations TO app_clinic_billing;
--> statement-breakpoint

DROP POLICY IF EXISTS saas_tariffs_clinic_billing_read ON public.saas_tariffs;
CREATE POLICY saas_tariffs_clinic_billing_read ON public.saas_tariffs
  FOR SELECT TO app_clinic_billing USING (true);
--> statement-breakpoint

DROP POLICY IF EXISTS be_organizations_clinic_billing_current_org_read
  ON public.be_organizations;
CREATE POLICY be_organizations_clinic_billing_current_org_read
  ON public.be_organizations
  FOR SELECT TO app_clinic_billing
  USING (
    app.current_org_id() IS NOT NULL
    AND id = app.current_org_id()
  );
--> statement-breakpoint

DO $clinic_billing_mutation_walls$
DECLARE
  relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'saas_billing_accounts',
    'saas_billing_subscriptions',
    'saas_billing_invoices'
  ] LOOP
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE ON TABLE public.%I TO app_clinic_billing',
      relation_name
    );
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      relation_name || '_clinic_billing_insert',
      relation_name
    );
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      relation_name || '_clinic_billing_update',
      relation_name
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO app_clinic_billing WITH CHECK (app.current_org_id() IS NOT NULL AND organization_id = app.current_org_id())',
      relation_name || '_clinic_billing_insert',
      relation_name
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO app_clinic_billing USING (app.current_org_id() IS NOT NULL AND organization_id = app.current_org_id()) WITH CHECK (app.current_org_id() IS NOT NULL AND organization_id = app.current_org_id())',
      relation_name || '_clinic_billing_update',
      relation_name
    );
  END LOOP;
END
$clinic_billing_mutation_walls$;
