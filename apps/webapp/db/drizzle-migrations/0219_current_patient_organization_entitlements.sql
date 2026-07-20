-- 0219_current_patient_organization_entitlements: bounded entitlement projection for the
-- server-selected current patient organization. The caller supplies neither patient nor
-- organization identity; both come only from the protected signed DB principal.

-- These SELECT-only policies let the non-login app_owner of the SECURITY DEFINER capability
-- traverse exactly the tariff and overrides of the signed current patient organization under
-- FORCE RLS. app_patient still receives no table grant, so it cannot use the policies directly.
DROP POLICY IF EXISTS saas_tariffs_current_patient_capability_read ON public.saas_tariffs;
CREATE POLICY saas_tariffs_current_patient_capability_read ON public.saas_tariffs
  FOR SELECT
  USING (
    app.current_org_id() IS NOT NULL
    AND app.current_patient_user_id() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.be_organizations AS organization
      INNER JOIN public.org_enrollments AS enrollment
        ON enrollment.organization_id = organization.id
       AND enrollment.platform_user_id = app.current_patient_user_id()
       AND enrollment.status = 'active'
      WHERE organization.id = app.current_org_id()
        AND organization.is_active = true
        AND organization.tariff_id = saas_tariffs.id
    )
  );

DROP POLICY IF EXISTS saas_org_entitlement_overrides_current_patient_capability_read
  ON public.saas_org_entitlement_overrides;
CREATE POLICY saas_org_entitlement_overrides_current_patient_capability_read
  ON public.saas_org_entitlement_overrides
  FOR SELECT
  USING (
    app.current_org_id() IS NOT NULL
    AND app.current_patient_user_id() IS NOT NULL
    AND organization_id = app.current_org_id()
    AND EXISTS (
      SELECT 1
      FROM public.be_organizations AS organization
      INNER JOIN public.org_enrollments AS enrollment
        ON enrollment.organization_id = organization.id
       AND enrollment.platform_user_id = app.current_patient_user_id()
       AND enrollment.status = 'active'
      WHERE organization.id = app.current_org_id()
        AND organization.is_active = true
    )
  );

CREATE OR REPLACE FUNCTION app.read_current_patient_organization_entitlements()
RETURNS TABLE (
  tariff_mechanics jsonb,
  included_seats integer,
  override_mechanic text,
  override_enabled boolean,
  seat_limit_override integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_organization_id uuid := app.current_org_id();
  v_patient_user_id uuid := app.current_patient_user_id();
BEGIN
  IF v_organization_id IS NULL OR v_patient_user_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    tariff.mechanics,
    tariff.included_seats,
    entitlement_override.mechanic,
    entitlement_override.enabled,
    entitlement_override.seat_limit_override
  FROM public.org_enrollments AS enrollment
  INNER JOIN public.be_organizations AS organization
    ON organization.id = enrollment.organization_id
   AND organization.is_active = true
  LEFT JOIN public.saas_tariffs AS tariff
    ON tariff.id = organization.tariff_id
  LEFT JOIN public.saas_org_entitlement_overrides AS entitlement_override
    ON entitlement_override.organization_id = organization.id
  WHERE enrollment.organization_id = v_organization_id
    AND enrollment.platform_user_id = v_patient_user_id
    AND enrollment.status = 'active'
  ORDER BY entitlement_override.mechanic;
END
$function$;

REVOKE ALL ON FUNCTION app.read_current_patient_organization_entitlements() FROM PUBLIC;
