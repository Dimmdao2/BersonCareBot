-- Patient-safe runtime cooldown plus narrow playback telemetry write accessors.
-- Restricted system_settings remains the authoring source; patient roles receive no table grants.

INSERT INTO public.app_runtime_settings
  (key, scope, organization_id, audience, value_json, updated_at, updated_by)
SELECT
  'patient_treatment_plan_item_done_repeat_cooldown_minutes',
  'admin',
  NULL,
  'authenticated_client',
  COALESCE(setting.value_json, '{"value":60}'::jsonb),
  COALESCE(setting.updated_at, now()),
  setting.updated_by
FROM (SELECT 1) AS seed
LEFT JOIN public.system_settings AS setting
  ON setting.key = 'patient_treatment_plan_item_done_repeat_cooldown_minutes'
 AND setting.scope = 'admin'
 AND setting.organization_id IS NULL
ON CONFLICT (key, scope) WHERE organization_id IS NULL
DO UPDATE SET
  audience = EXCLUDED.audience,
  value_json = EXCLUDED.value_json,
  updated_at = EXCLUDED.updated_at,
  updated_by = EXCLUDED.updated_by;

INSERT INTO public.app_runtime_settings
  (key, scope, organization_id, audience, value_json, updated_at, updated_by)
SELECT
  setting.key,
  setting.scope,
  setting.organization_id,
  'authenticated_client',
  setting.value_json,
  setting.updated_at,
  setting.updated_by
FROM public.system_settings AS setting
WHERE setting.key = 'patient_treatment_plan_item_done_repeat_cooldown_minutes'
  AND setting.scope = 'admin'
  AND setting.organization_id IS NOT NULL
ON CONFLICT (key, scope, organization_id) WHERE organization_id IS NOT NULL
DO UPDATE SET
  audience = EXCLUDED.audience,
  value_json = EXCLUDED.value_json,
  updated_at = EXCLUDED.updated_at,
  updated_by = EXCLUDED.updated_by;

CREATE OR REPLACE FUNCTION app.increment_media_playback_resolution_stat(
  p_user_id uuid,
  p_media_id uuid,
  p_delivery text,
  p_fallback_used boolean
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_organization_id uuid := app.current_org_id();
  v_patient_user_id uuid := app.current_patient_user_id();
BEGIN
  IF v_organization_id IS NULL OR p_delivery NOT IN ('hls', 'mp4', 'file') THEN
    RAISE EXCEPTION 'media_playback_telemetry_context_denied' USING ERRCODE = '42501';
  END IF;
  -- Staff principal context currently does not carry a DB-verifiable staff actor id. This
  -- patient-behaviour telemetry therefore accepts only an exact signed patient identity.
  IF v_patient_user_id IS NULL OR v_patient_user_id <> p_user_id THEN
    RAISE EXCEPTION 'media_playback_telemetry_actor_denied' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.media_files AS media
    WHERE media.id = p_media_id
      AND media.organization_id = v_organization_id
  ) THEN
    RAISE EXCEPTION 'media_playback_telemetry_media_denied' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.media_playback_stats_hourly
    (bucket_hour, delivery, resolved_count, fallback_count)
  VALUES
    (date_trunc('hour', clock_timestamp()), p_delivery, 1, CASE WHEN p_fallback_used THEN 1 ELSE 0 END)
  ON CONFLICT (bucket_hour, delivery) DO UPDATE
    SET resolved_count = public.media_playback_stats_hourly.resolved_count + 1,
        fallback_count = public.media_playback_stats_hourly.fallback_count
          + CASE WHEN EXCLUDED.fallback_count > 0 THEN 1 ELSE 0 END;
END
$function$;

CREATE OR REPLACE FUNCTION app.record_media_playback_resolution_event(
  p_user_id uuid,
  p_media_id uuid,
  p_delivery text,
  p_fallback_used boolean
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_organization_id uuid := app.current_org_id();
  v_patient_user_id uuid := app.current_patient_user_id();
BEGIN
  IF v_organization_id IS NULL OR p_delivery NOT IN ('hls', 'mp4', 'file') THEN
    RAISE EXCEPTION 'media_playback_telemetry_context_denied' USING ERRCODE = '42501';
  END IF;
  -- Do not accept caller-supplied p_user_id as proof of a staff actor. Until the signed
  -- context carries a staff id, staff/org-only/integrator contexts are all denied here.
  IF v_patient_user_id IS NULL OR v_patient_user_id <> p_user_id THEN
    RAISE EXCEPTION 'media_playback_telemetry_actor_denied' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.media_files AS media
    WHERE media.id = p_media_id
      AND media.organization_id = v_organization_id
  ) THEN
    RAISE EXCEPTION 'media_playback_telemetry_media_denied' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.media_playback_resolution_events
    (organization_id, user_id, media_id, delivery, fallback_used)
  VALUES
    (v_organization_id, p_user_id, p_media_id, p_delivery, p_fallback_used);
END
$function$;

REVOKE ALL ON FUNCTION app.increment_media_playback_resolution_stat(uuid, uuid, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.record_media_playback_resolution_event(uuid, uuid, text, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION app.increment_media_playback_resolution_stat(uuid, uuid, text, boolean)
  FROM app_staff;
REVOKE EXECUTE ON FUNCTION app.record_media_playback_resolution_event(uuid, uuid, text, boolean)
  FROM app_staff;
GRANT EXECUTE ON FUNCTION app.increment_media_playback_resolution_stat(uuid, uuid, text, boolean)
  TO app_patient;
GRANT EXECUTE ON FUNCTION app.record_media_playback_resolution_event(uuid, uuid, text, boolean)
  TO app_patient;
