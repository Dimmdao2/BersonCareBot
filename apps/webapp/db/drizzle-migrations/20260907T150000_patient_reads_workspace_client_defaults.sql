-- BCB-MIGRATION-OWNER: app_seam_settings_runtime_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-REHOME-FUNCTION: app.read_current_patient_ui_setting(text,text)
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.strpos(p.prosrc, '''doctor_workspace_client_defaults''') > 0 FROM pg_catalog.pg_proc p WHERE p.oid = pg_catalog.to_regprocedure('app.read_current_patient_ui_setting(text,text)')
-- C3M-09 extends the existing bounded patient settings door with client channel defaults and the
-- two compatibility rows used only while the structured per-organization row is absent.
-- Rights analysis: same SECURITY DEFINER signature and owner; the body reads only the already
-- declared org_enrollments/system_settings surfaces. No role, policy, or privilege change.
CREATE OR REPLACE FUNCTION app.read_current_patient_ui_setting(p_key text, p_scope text)
RETURNS TABLE(
  key text,
  scope text,
  organization_id uuid,
  value_json jsonb,
  updated_at timestamptz,
  updated_by uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_organization_id uuid;
  v_patient_user_id uuid;
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_settings_runtime_owner'::name,
    ARRAY['app_patient'::name]::name[]
  );

  v_organization_id := app.current_org_id();
  v_patient_user_id := app.current_patient_user_id();
  IF v_patient_user_id IS NULL THEN
    RETURN;
  END IF;
  IF NOT (
    (
      p_scope = 'admin'
      AND p_key IN (
        'patient_home_mood_icons',
        'patient_home_daily_warmup_repeat_cooldown_minutes',
        'patient_home_daily_warmup_rotation_enabled',
        'patient_home_daily_warmup_rotation_times',
        'patient_home_daily_practice_target',
        'notifications_topics',
        'patient_default_promo_treatment_program_template_id',
        'booking_lifecycle_notifications'
      )
    )
    OR (
      p_scope = 'doctor'
      AND p_key IN (
        'doctor_workspace_composition',
        'doctor_workspace_client_defaults',
        'doctor_patient_support_comments_without_support_default_enabled',
        'doctor_patient_support_media_without_support_default_enabled'
      )
    )
  ) THEN
    RETURN;
  END IF;
  IF v_organization_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.org_enrollments AS enrollment
    WHERE enrollment.organization_id = v_organization_id
      AND enrollment.platform_user_id = v_patient_user_id
      AND enrollment.status = 'active'
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT setting.key,
         setting.scope,
         setting.organization_id,
         setting.value_json,
         setting.updated_at,
         setting.updated_by
  FROM public.system_settings AS setting
  WHERE setting.key = p_key
    AND setting.scope = p_scope
    AND (
      setting.organization_id IS NULL
      OR (v_organization_id IS NOT NULL AND setting.organization_id = v_organization_id)
    )
  ORDER BY setting.organization_id IS NULL ASC
  LIMIT 1;
END
$function$;
