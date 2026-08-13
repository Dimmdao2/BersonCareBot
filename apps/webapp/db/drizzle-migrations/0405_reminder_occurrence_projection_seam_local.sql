-- BCB-MIGRATION-OWNER: app_seam_reminder_patient_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- A signed webapp projection receives one exact write root, never broad tenant relation access.
CREATE OR REPLACE FUNCTION app.record_reminder_occurrence_finalized_projection(
  p_integrator_occurrence_id text,
  p_integrator_rule_id text,
  p_integrator_user_id bigint,
  p_platform_user_id uuid,
  p_organization_id uuid,
  p_category text,
  p_status text,
  p_delivery_channel text,
  p_error_code text,
  p_occurred_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_row_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.org_enrollments AS enrollment
    WHERE enrollment.organization_id = p_organization_id
      AND enrollment.platform_user_id = p_platform_user_id
      AND enrollment.status = 'active'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'active patient enrollment required for reminder occurrence projection';
  END IF;

  INSERT INTO public.reminder_occurrence_history (
    integrator_occurrence_id,
    integrator_rule_id,
    integrator_user_id,
    platform_user_id,
    organization_id,
    category,
    status,
    delivery_channel,
    error_code,
    occurred_at
  ) VALUES (
    p_integrator_occurrence_id,
    p_integrator_rule_id,
    p_integrator_user_id,
    p_platform_user_id,
    p_organization_id,
    p_category,
    p_status,
    p_delivery_channel,
    p_error_code,
    p_occurred_at
  )
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  RETURN v_row_count > 0;
END
$function$;

REVOKE ALL ON FUNCTION app.record_reminder_occurrence_finalized_projection(
  text,text,bigint,uuid,uuid,text,text,text,text,timestamptz
) FROM PUBLIC;
