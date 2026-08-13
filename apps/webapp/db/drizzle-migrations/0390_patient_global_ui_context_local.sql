-- BCB-MIGRATION-OWNER: app_seam_context_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- A valid patient relation context may intentionally have no selected organization.
-- Missing context still raises; only the accepted no-organization patient case returns NULL.
CREATE OR REPLACE FUNCTION app.current_org_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
PARALLEL UNSAFE
SET search_path = pg_catalog, app, app_ext, pg_temp
AS $function$
DECLARE
  value uuid;
BEGIN
  SELECT organization_id
    INTO value
    FROM app_ext.accepted_port_contexts
   WHERE database_oid = (SELECT oid FROM pg_database WHERE datname = current_database())
     AND backend_pid = pg_backend_pid()
     AND transaction_id = pg_current_xact_id()
     AND cleared_at IS NULL
     AND target_role IN ('app_staff','app_patient','app_integrator_request','app_tenant_service');
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'accepted organization context required';
  END IF;
  RETURN value;
END
$function$;

--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_seam_settings_runtime_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.read_current_patient_ui_setting(
  p_key text,
  p_scope text
)
RETURNS TABLE (
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
SET search_path = pg_catalog
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
  IF v_patient_user_id IS NULL OR p_scope <> 'admin' THEN
    RETURN;
  END IF;
  IF p_key NOT IN (
    'patient_home_mood_icons',
    'patient_home_daily_warmup_repeat_cooldown_minutes',
    'patient_home_daily_warmup_rotation_enabled',
    'patient_home_daily_warmup_rotation_times',
    'patient_home_daily_practice_target',
    'notifications_topics',
    'patient_default_promo_treatment_program_template_id'
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
  SELECT setting.key, setting.scope, setting.organization_id, setting.value_json,
         setting.updated_at, setting.updated_by
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
