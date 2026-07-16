-- 0195_e1_patient_maintenance_history: bounded current-patient canonical appointment projection.
-- The patient supplies no identity or organization parameters; both come from signed DB context.

CREATE OR REPLACE FUNCTION app.read_current_patient_appointment_history()
RETURNS TABLE (
  appointment_id uuid,
  start_at timestamptz,
  end_at timestamptz,
  status text,
  subtitle text,
  specialist_name text,
  branch_title text,
  room_title text,
  service_title text
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

  IF NOT EXISTS (
    SELECT 1
    FROM public.org_enrollments AS enrollment
    WHERE enrollment.organization_id = v_organization_id
      AND enrollment.platform_user_id = v_patient_user_id
      AND enrollment.status = 'active'
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    appointment.id,
    appointment.start_at,
    appointment.end_at,
    appointment.status,
    COALESCE(
      NULLIF(concat_ws(' · ', NULLIF(service.title, ''), NULLIF(branch.title, '')), ''),
      'Приём'
    ),
    specialist.full_name,
    branch.title,
    room.title,
    service.title
  FROM public.be_appointments AS appointment
  LEFT JOIN public.be_specialists AS specialist
    ON specialist.id = appointment.specialist_id
   AND specialist.organization_id = v_organization_id
  LEFT JOIN public.be_branches AS branch
    ON branch.id = appointment.branch_id
   AND branch.organization_id = v_organization_id
  LEFT JOIN public.be_rooms AS room
    ON room.id = appointment.room_id
   AND room.organization_id = v_organization_id
  LEFT JOIN public.be_clinic_services AS service
    ON service.id = appointment.service_id
   AND service.organization_id = v_organization_id
  WHERE appointment.organization_id = v_organization_id
    AND appointment.platform_user_id = v_patient_user_id
    AND appointment.deleted_at IS NULL
  ORDER BY appointment.start_at DESC, appointment.id DESC
  LIMIT 100;
END
$function$;

REVOKE ALL ON FUNCTION app.read_current_patient_appointment_history() FROM PUBLIC;
