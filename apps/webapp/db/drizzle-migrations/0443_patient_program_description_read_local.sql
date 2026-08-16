-- TEMPORARY LOCAL MIGRATION NUMBER 0443
-- BCB-MIGRATION-OWNER: app_seam_patient_program_resolver_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- A patient may read only the description attached to an instance it owns in its current clinic.
-- The template remains a staff-only aggregate; this root returns one scalar projection.

CREATE OR REPLACE FUNCTION app.read_current_patient_treatment_program_description(
  p_instance_id uuid
)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER PARALLEL UNSAFE
SET search_path = pg_catalog
AS $function$
DECLARE
  v_patient_user_id uuid := app.current_patient_user_id();
  v_organization_id uuid := app.current_org_id();
  v_description text;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_patient_program_resolver_owner', 'app_patient', 'patient',
    'patient.program.description.read',
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', CASE WHEN p_instance_id IS NULL THEN NULL ELSE uuid_send(p_instance_id) END)::app.port_typed_arg
    ]),
    'app.read_current_patient_treatment_program_description(uuid)'::regprocedure
  );

  IF v_patient_user_id IS NULL OR v_organization_id IS NULL OR p_instance_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT template.description
    INTO v_description
    FROM public.treatment_program_instances AS instance
    INNER JOIN public.treatment_program_templates AS template
      ON template.id = instance.template_id
     AND template.organization_id = instance.organization_id
    INNER JOIN public.org_enrollments AS enrollment
      ON enrollment.organization_id = instance.organization_id
     AND enrollment.platform_user_id = v_patient_user_id
     AND enrollment.status = 'active'
    INNER JOIN public.be_organizations AS organization
      ON organization.id = instance.organization_id
     AND organization.is_active = true
   WHERE instance.id = p_instance_id
     AND instance.patient_user_id = v_patient_user_id
     AND instance.organization_id = v_organization_id
   LIMIT 1;

  RETURN NULLIF(btrim(v_description), '');
END
$function$;

REVOKE ALL ON FUNCTION app.read_current_patient_treatment_program_description(uuid) FROM PUBLIC;
