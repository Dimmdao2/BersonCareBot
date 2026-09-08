-- BCB-MIGRATION-OWNER: app_seam_settings_runtime_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-REHOME-FUNCTION: app.read_current_patient_ui_setting(text,text)
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.strpos(p.prosrc, '''patient_label''') > 0 FROM pg_catalog.pg_proc p WHERE p.oid = pg_catalog.to_regprocedure('app.read_current_patient_ui_setting(text,text)')
-- TEST acceptance defect batch (2026-09-08): the patient shell resolves organization terminology
-- (`patient_label`, scope=doctor, audience `authenticated_client` in the settings registry) via
-- `listSettingsByScope('doctor', ...)`, which is the unbounded `getByScope` reader — a raw
-- `SELECT ... FROM system_settings` with no patient door at all (unlike the single-key `getByKey`
-- reader, which already special-cases `getCurrentDbPrincipal().kind === 'patient'`). Under the
-- patient DB principal this raw read has no table grant and fails with SQLSTATE 42501, which is
-- what sent the configured TEST patient from `/app/patient` into the server error boundary.
--
-- Fix: extend the existing bounded patient-safe settings door with `patient_label` and switch the
-- caller (`apps/webapp/src/app/app/patient/layout.tsx`) to the single-key `getByKey` reader instead
-- of the unbounded scope scan, exactly like the sibling `doctor_workspace_composition`/
-- `doctor_workspace_client_defaults` keys already do. No second settings store, no bypass.
--
-- Rights analysis: this replaces the existing SECURITY DEFINER function under its existing seam
-- owner. The body still reads only public.org_enrollments and public.system_settings through the
-- same already-declared SELECT surfaces. No object signature, role, policy or privilege changes.
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
        'doctor_patient_support_media_without_support_default_enabled',
        'patient_label'
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
