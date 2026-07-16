-- 0197_patient_plan_opened_capability: current-patient-only write capability.
-- Identity and organization are derived from the signed DB principal; the client supplies only
-- the program instance id. The definer verifies active enrollment and row ownership before update.

CREATE OR REPLACE FUNCTION app.touch_current_patient_plan_last_opened(p_instance_id uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_organization_id uuid := app.current_org_id();
  v_patient_user_id uuid := app.current_patient_user_id();
  v_updated_count bigint := 0;
BEGIN
  IF v_organization_id IS NULL OR v_patient_user_id IS NULL THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.org_enrollments AS enrollment
    WHERE enrollment.organization_id = v_organization_id
      AND enrollment.platform_user_id = v_patient_user_id
      AND enrollment.status = 'active'
  ) THEN
    RETURN false;
  END IF;

  UPDATE public.treatment_program_instances AS instance
  SET patient_plan_last_opened_at = now(), updated_at = now()
  WHERE instance.id = p_instance_id
    AND instance.organization_id = v_organization_id
    AND instance.patient_user_id = v_patient_user_id
    AND instance.status = 'active';

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RETURN v_updated_count > 0;
END
$function$;

REVOKE ALL ON FUNCTION app.touch_current_patient_plan_last_opened(uuid) FROM PUBLIC;
