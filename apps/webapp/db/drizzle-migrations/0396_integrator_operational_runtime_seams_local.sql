-- BCB-MIGRATION-OWNER: app_seam_settings_integrator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: sql
-- Runtime seams previously lived only in TEST host overlays even though the same integrator code
-- calls them in every environment. Put their bodies in the portable migration ledger; the access
-- declaration remains the sole authority for owners, EXECUTE and transaction-context gates.
CREATE OR REPLACE FUNCTION app.read_integrator_runtime_setting(p_key text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT setting.value_json
  FROM public.system_settings AS setting
  WHERE p_key IN (
      'integrator_linked_phone_source', 'admin_telegram_ids', 'admin_max_ids',
      'doctor_telegram_ids', 'doctor_max_ids', 'operator_health_alert_config',
      'admin_incident_alert_config', 'app_display_timezone',
      'notif_template:created:patient', 'notif_template:created:doctor',
      'notif_template:cancelled:patient', 'notif_template:cancelled:doctor',
      'notif_template:rescheduled:patient', 'notif_template:rescheduled:doctor'
    )
    AND setting.key = p_key
    AND setting.scope = 'admin'
    AND setting.organization_id IS NULL
  LIMIT 1
$function$;
--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_seam_settings_integrator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: sql
CREATE OR REPLACE FUNCTION app.read_integrator_google_calendar_setting(
  p_key text,
  p_organization_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT setting.value_json
  FROM public.system_settings AS setting
  WHERE (
      (p_organization_id IS NULL
        AND p_key IN ('google_client_id', 'google_client_secret', 'google_redirect_uri')
        AND setting.organization_id IS NULL)
      OR
      (p_organization_id IS NOT NULL
        AND p_key IN ('google_calendar_enabled', 'google_calendar_id', 'google_refresh_token')
        AND setting.organization_id = p_organization_id)
    )
    AND setting.key = p_key
    AND setting.scope = 'admin'
  LIMIT 1
$function$;
--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_seam_settings_integrator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: sql
CREATE OR REPLACE FUNCTION app.read_integrator_clinic_delivery_credential(
  p_key text,
  p_organization_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT setting.value_json
  FROM public.system_settings AS setting
  WHERE p_organization_id IS NOT NULL
    AND p_key IN (
      'clinic_smtp_outbound', 'clinic_smsc_api_key',
      'clinic_telegram_bot_token', 'clinic_max_bot_api_key'
    )
    AND setting.key = p_key
    AND setting.scope = 'admin'
    AND setting.organization_id = p_organization_id
  LIMIT 1
$function$;
--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_seam_settings_integrator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: sql
CREATE OR REPLACE FUNCTION app.read_operator_health_probe_config()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT setting.value_json
  FROM public.system_settings AS setting
  WHERE setting.key = 'operator_health_probe_config'
    AND setting.scope = 'admin'
    AND setting.organization_id IS NULL
  LIMIT 1
$function$;
--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: sql
CREATE OR REPLACE FUNCTION app.list_google_calendar_probe_organization_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT setting.organization_id
  FROM public.system_settings AS setting
  WHERE setting.key = 'google_calendar_enabled'
    AND setting.scope = 'admin'
    AND setting.organization_id IS NOT NULL
    AND lower(COALESCE(setting.value_json ->> 'value', '')) IN ('true', '1')
  ORDER BY setting.updated_at DESC, setting.organization_id
$function$;
--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: sql
CREATE OR REPLACE FUNCTION app.read_operator_outbound_probe_meta()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT COALESCE((
    SELECT status.meta_json
    FROM public.operator_job_status AS status
    WHERE status.job_key = 'health.outbound_probe.run'
    LIMIT 1
  ), '{}'::jsonb)
$function$;
--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.record_operator_outbound_probe_run(
  p_last_status text,
  p_finished_at timestamptz,
  p_last_error text,
  p_meta_json jsonb
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  IF p_last_status IS NULL
    OR p_last_status NOT IN ('success', 'failure')
    OR p_finished_at IS NULL
    OR p_meta_json IS NULL
    OR jsonb_typeof(p_meta_json) <> 'object'
    OR pg_column_size(p_meta_json) > 65536
    OR length(COALESCE(p_last_error, '')) > 1000
  THEN
    RAISE EXCEPTION 'invalid operator outbound probe run input'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.operator_job_status AS status (
    job_key, job_family, last_status, last_started_at, last_finished_at,
    last_success_at, last_failure_at, last_duration_ms, last_error, meta_json
  ) VALUES (
    'health.outbound_probe.run', 'health', p_last_status, p_finished_at, p_finished_at,
    CASE WHEN p_last_status = 'success' THEN p_finished_at END,
    CASE WHEN p_last_status = 'failure' THEN p_finished_at END,
    0, NULLIF(p_last_error, ''), p_meta_json
  )
  ON CONFLICT (job_key) DO UPDATE SET
    job_family = 'health',
    last_status = EXCLUDED.last_status,
    last_finished_at = EXCLUDED.last_finished_at,
    last_success_at = CASE
      WHEN EXCLUDED.last_status = 'success' THEN EXCLUDED.last_finished_at
      ELSE status.last_success_at
    END,
    last_failure_at = CASE
      WHEN EXCLUDED.last_status = 'failure' THEN EXCLUDED.last_finished_at
      ELSE NULL
    END,
    last_duration_ms = 0,
    last_error = EXCLUDED.last_error,
    meta_json = EXCLUDED.meta_json;
END
$function$;
--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.resolve_operator_probe_incidents(p_dedup_key_prefix text)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_resolved integer;
BEGIN
  IF p_dedup_key_prefix IS NULL
    OR p_dedup_key_prefix NOT IN (
      'outbound:max:', 'outbound:telegram:', 'outbound:google_calendar:'
    )
  THEN
    RAISE EXCEPTION 'invalid operator probe incident prefix'
      USING ERRCODE = '23514';
  END IF;

  WITH resolved AS (
    UPDATE public.operator_incidents AS incident
    SET resolved_at = now()
    WHERE incident.resolved_at IS NULL
      AND incident.dedup_key LIKE p_dedup_key_prefix || '%'
    RETURNING incident.id
  )
  SELECT count(*)::integer INTO v_resolved FROM resolved;

  RETURN v_resolved;
END
$function$;
--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.open_or_touch_operator_probe_incident(
  p_integration text,
  p_error_class text,
  p_error_detail text
)
RETURNS TABLE (id uuid, occurrence_count integer)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  IF p_integration IS NULL
    OR p_error_class IS NULL
    OR (p_integration, p_error_class) NOT IN (
      ('max', 'max_probe_failed'),
      ('telegram', 'telegram_probe_failed'),
      ('google_calendar', 'google_calendar_probe_failed')
    )
    OR length(COALESCE(p_error_detail, '')) > 1000
  THEN
    RAISE EXCEPTION 'invalid operator probe incident input'
      USING ERRCODE = '23514';
  END IF;

  RETURN QUERY
  SELECT incident.id, incident.occurrence_count
  FROM app.open_or_touch_operator_incident(
    'outbound:' || p_integration || ':' || p_error_class,
    'outbound',
    p_integration,
    p_error_class,
    NULLIF(p_error_detail, '')
  ) AS incident;
END
$function$;
--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_seam_settings_integrator_owner
REVOKE ALL ON FUNCTION app.read_integrator_runtime_setting(text) FROM PUBLIC;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_settings_integrator_owner
REVOKE ALL ON FUNCTION app.read_integrator_google_calendar_setting(text, uuid) FROM PUBLIC;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_settings_integrator_owner
REVOKE ALL ON FUNCTION app.read_integrator_clinic_delivery_credential(text, uuid) FROM PUBLIC;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_settings_integrator_owner
REVOKE ALL ON FUNCTION app.read_operator_health_probe_config() FROM PUBLIC;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
REVOKE ALL ON FUNCTION app.list_google_calendar_probe_organization_ids() FROM PUBLIC;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
REVOKE ALL ON FUNCTION app.read_operator_outbound_probe_meta() FROM PUBLIC;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
REVOKE ALL ON FUNCTION app.record_operator_outbound_probe_run(text, timestamptz, text, jsonb) FROM PUBLIC;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
REVOKE ALL ON FUNCTION app.resolve_operator_probe_incidents(text) FROM PUBLIC;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
REVOKE ALL ON FUNCTION app.open_or_touch_operator_probe_incident(text, text, text) FROM PUBLIC;
