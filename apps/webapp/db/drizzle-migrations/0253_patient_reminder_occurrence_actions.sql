-- 0253: let a patient snooze or skip only their own reminder occurrence without table UPDATE access.
--
-- app_owner bypasses RLS, so both action bodies repeat the patient ownership bridge from the
-- reminder_occurrence_history policy and also bind the explicit platform-user argument to the
-- signed current patient principal.

DO $patient_reminder_occurrence_action_owner_grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner') THEN
    GRANT SELECT, UPDATE ON TABLE public.reminder_occurrence_history TO app_owner;
  END IF;
END
$patient_reminder_occurrence_action_owner_grants$;

CREATE OR REPLACE FUNCTION app.patient_snooze_reminder_occurrence(
  p_platform_user_id uuid,
  p_integrator_occurrence_id text,
  p_minutes integer
)
RETURNS TABLE (snoozed_until timestamptz)
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  UPDATE public.reminder_occurrence_history AS occurrence
  SET snoozed_at = statement_timestamp(),
      snoozed_until = statement_timestamp() + make_interval(mins => p_minutes)
  WHERE occurrence.integrator_occurrence_id = p_integrator_occurrence_id
    AND occurrence.skipped_at IS NULL
    AND p_minutes BETWEEN 1 AND 720
    AND app.current_patient_user_id() IS NOT NULL
    AND p_platform_user_id = app.current_patient_user_id()
    AND EXISTS (
      SELECT 1
      FROM public.platform_users AS patient
      WHERE patient.integrator_user_id = occurrence.integrator_user_id
        AND patient.id = app.current_patient_user_id()
        AND patient.id = p_platform_user_id
    )
  RETURNING occurrence.snoozed_until
$function$;

CREATE OR REPLACE FUNCTION app.patient_skip_reminder_occurrence(
  p_platform_user_id uuid,
  p_integrator_occurrence_id text,
  p_reason text
)
RETURNS TABLE (skipped_at timestamptz)
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  UPDATE public.reminder_occurrence_history AS occurrence
  SET skipped_at = COALESCE(occurrence.skipped_at, statement_timestamp()),
      skip_reason = CASE
        WHEN occurrence.skipped_at IS NULL THEN p_reason
        ELSE occurrence.skip_reason
      END
  WHERE occurrence.integrator_occurrence_id = p_integrator_occurrence_id
    AND app.current_patient_user_id() IS NOT NULL
    AND p_platform_user_id = app.current_patient_user_id()
    AND EXISTS (
      SELECT 1
      FROM public.platform_users AS patient
      WHERE patient.integrator_user_id = occurrence.integrator_user_id
        AND patient.id = app.current_patient_user_id()
        AND patient.id = p_platform_user_id
    )
  RETURNING occurrence.skipped_at
$function$;

DO $patient_reminder_occurrence_action_owner$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner') THEN
    ALTER FUNCTION app.patient_snooze_reminder_occurrence(uuid, text, integer) OWNER TO app_owner;
    ALTER FUNCTION app.patient_skip_reminder_occurrence(uuid, text, text) OWNER TO app_owner;
  END IF;
END
$patient_reminder_occurrence_action_owner$;

REVOKE ALL ON FUNCTION app.patient_snooze_reminder_occurrence(uuid, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.patient_skip_reminder_occurrence(uuid, text, text) FROM PUBLIC;

DO $patient_reminder_occurrence_action_grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_patient') THEN
    GRANT EXECUTE ON FUNCTION app.patient_snooze_reminder_occurrence(uuid, text, integer) TO app_patient;
    GRANT EXECUTE ON FUNCTION app.patient_skip_reminder_occurrence(uuid, text, text) TO app_patient;
  END IF;
END
$patient_reminder_occurrence_action_grants$;

COMMENT ON FUNCTION app.patient_snooze_reminder_occurrence(uuid, text, integer) IS
  'Patient reminder action: snoozes only the current signed patient principal own occurrence for 1..720 minutes.';
COMMENT ON FUNCTION app.patient_skip_reminder_occurrence(uuid, text, text) IS
  'Patient reminder action: idempotently skips only the current signed patient principal own occurrence.';
