-- 0216_current_patient_organization_context: bounded organization-context reads for U5A.
-- The patient identity comes only from the protected signed DB principal. A caller may propose
-- a treatment instance id, but can never supply a patient id or an organization id.

CREATE OR REPLACE FUNCTION app.read_current_patient_active_organizations()
RETURNS TABLE (
  organization_id uuid,
  organization_title text,
  platform_user_id uuid,
  enrollment_created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_patient_user_id uuid := app.current_patient_user_id();
BEGIN
  IF v_patient_user_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT organization.id, organization.title, v_patient_user_id, enrollment.created_at
  FROM public.org_enrollments AS enrollment
  INNER JOIN public.be_organizations AS organization
    ON organization.id = enrollment.organization_id
   AND organization.is_active = true
  WHERE enrollment.platform_user_id = v_patient_user_id
    AND enrollment.status = 'active'
  ORDER BY enrollment.created_at, organization.id;
END
$function$;

CREATE OR REPLACE FUNCTION app.resolve_current_patient_treatment_program_organization(
  p_instance_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_patient_user_id uuid := app.current_patient_user_id();
  v_organization_id uuid;
BEGIN
  IF v_patient_user_id IS NULL OR p_instance_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT instance.organization_id
  INTO v_organization_id
  FROM public.treatment_program_instances AS instance
  INNER JOIN public.org_enrollments AS enrollment
    ON enrollment.organization_id = instance.organization_id
   AND enrollment.platform_user_id = v_patient_user_id
   AND enrollment.status = 'active'
  INNER JOIN public.be_organizations AS organization
    ON organization.id = instance.organization_id
   AND organization.is_active = true
  WHERE instance.id = p_instance_id
    AND instance.patient_user_id = v_patient_user_id
  LIMIT 1;

  RETURN v_organization_id;
END
$function$;

REVOKE ALL ON FUNCTION app.read_current_patient_active_organizations() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.resolve_current_patient_treatment_program_organization(uuid) FROM PUBLIC;
