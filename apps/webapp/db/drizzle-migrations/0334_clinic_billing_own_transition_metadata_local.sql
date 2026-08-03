-- TEMPORARY LOCAL MIGRATION NUMBER 0334: final journal position is assigned when this branch lands.
-- Live TEST checkout repair: the existing own-tariff transition evaluator reads the clinic's
-- current trial and entitlement overrides while running as app_clinic_billing. Keep those reads
-- tenant-scoped through the already signed app.current_org_id(); no mutation grant is introduced.

GRANT SELECT ON TABLE
  public.saas_organization_trials,
  public.saas_org_entitlement_overrides
TO app_clinic_billing;

DROP POLICY IF EXISTS saas_organization_trials_clinic_billing_current_org_read
  ON public.saas_organization_trials;
CREATE POLICY saas_organization_trials_clinic_billing_current_org_read
  ON public.saas_organization_trials
  FOR SELECT TO app_clinic_billing
  USING (
    app.current_org_id() IS NOT NULL
    AND organization_id = app.current_org_id()
  );

DROP POLICY IF EXISTS saas_org_entitlement_overrides_clinic_billing_current_org_read
  ON public.saas_org_entitlement_overrides;
CREATE POLICY saas_org_entitlement_overrides_clinic_billing_current_org_read
  ON public.saas_org_entitlement_overrides
  FOR SELECT TO app_clinic_billing
  USING (
    app.current_org_id() IS NOT NULL
    AND organization_id = app.current_org_id()
  );

DO $clinic_billing_transition_metadata_exact_wall$
BEGIN
  IF NOT (
    has_table_privilege('app_clinic_billing', 'public.saas_organization_trials', 'SELECT')
    AND has_table_privilege('app_clinic_billing', 'public.saas_org_entitlement_overrides', 'SELECT')
    AND NOT has_table_privilege('app_clinic_billing', 'public.saas_organization_trials', 'INSERT')
    AND NOT has_table_privilege('app_clinic_billing', 'public.saas_organization_trials', 'UPDATE')
    AND NOT has_table_privilege('app_clinic_billing', 'public.saas_organization_trials', 'DELETE')
    AND NOT has_table_privilege('app_clinic_billing', 'public.saas_org_entitlement_overrides', 'INSERT')
    AND NOT has_table_privilege('app_clinic_billing', 'public.saas_org_entitlement_overrides', 'UPDATE')
    AND NOT has_table_privilege('app_clinic_billing', 'public.saas_org_entitlement_overrides', 'DELETE')
  ) THEN
    RAISE EXCEPTION 'clinic billing transition metadata exact ACL wall failed';
  END IF;
END
$clinic_billing_transition_metadata_exact_wall$;
