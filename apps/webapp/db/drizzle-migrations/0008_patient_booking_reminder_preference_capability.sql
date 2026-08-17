-- BCB-MIGRATION-OWNER: app_seam_patient_booking_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.set_current_patient_booking_reminder_preset(
  p_appointment_id uuid,
  p_preset_id text
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
  v_updated boolean := false;
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_booking_owner'::name,
    ARRAY['app_patient'::name]::name[]
  );
  IF v_org IS NULL OR v_patient IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.be_appointments AS appointment
  SET appointment_reminder_preset_id = p_preset_id,
      appointment_reminder_selection_source = 'patient',
      updated_at = now()
  WHERE appointment.id = p_appointment_id
    AND appointment.organization_id = v_org
    AND appointment.platform_user_id = v_patient
    AND appointment.deleted_at IS NULL
    AND appointment.status IN ('confirmed', 'rescheduled')
    AND (
      p_preset_id IS NULL
      OR appointment.appointment_reminder_allowed_preset_ids @> jsonb_build_array(p_preset_id)
    )
    AND EXISTS (
      SELECT 1
      FROM public.org_enrollments AS enrollment
      WHERE enrollment.organization_id = v_org
        AND enrollment.platform_user_id = v_patient
        AND enrollment.status = 'active'
    )
  RETURNING true INTO v_updated;

  RETURN COALESCE(v_updated, false);
END
$function$;
