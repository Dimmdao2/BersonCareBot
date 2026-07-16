-- 0193_e1_safe_runtime_config: bounded E1 runtime projections for non-staff reads.
-- E1 safe runtime configuration closure.
-- Restricted system_settings remain closed to public/patient roles. Only reviewed scalar values and
-- derived provider-enabled booleans are projected into app_runtime_settings.

ALTER TABLE public.saas_isolation_events
  DROP CONSTRAINT IF EXISTS saas_isolation_events_source_operation_check;
ALTER TABLE public.saas_isolation_events
  ADD CONSTRAINT saas_isolation_events_source_operation_check CHECK (
    (source_service, source_operation) IN (
      ('webapp', 'webapp_db_request'), ('webapp', 'webapp_admin_system_health'),
      ('webapp', 'public_auth_config'), ('webapp', 'patient_runtime_config'),
      ('webapp', 'public_booking_config'),
      ('integrator', 'integrator_http_request'), ('integrator', 'integrator_projection'),
      ('worker', 'worker_queue_drain'), ('worker', 'worker_projection_delivery'),
      ('worker', 'worker_outgoing_delivery'), ('scheduler', 'scheduler_lock'),
      ('scheduler', 'scheduler_dispatch_tick'), ('media_worker', 'media_transcode_tick'),
      ('cron', 'cron_health'), ('cron', 'cron_media'), ('cron', 'cron_analytics'),
      ('cron', 'cron_reminders'), ('cron', 'cron_specialist_tasks')
    )
  );

CREATE OR REPLACE FUNCTION app.report_saas_isolation_event(
  p_event_class text,
  p_source_service text,
  p_source_operation text,
  p_explanation_status text DEFAULT 'unexplained'
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_fingerprint text;
  v_event_id uuid;
  v_bucket_start timestamptz := date_trunc('hour', clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
BEGIN
  IF p_event_class NOT IN (
    'missing_principal','invalid_signature_or_install','role_pool_mismatch',
    'rls_denial','cleanup_failure','unclassified_background_operation'
  ) THEN RAISE EXCEPTION 'invalid_saas_isolation_event_class' USING ERRCODE = '22023'; END IF;
  IF (p_source_service, p_source_operation) NOT IN (
    ('webapp','webapp_db_request'), ('webapp','webapp_admin_system_health'),
    ('webapp','public_auth_config'), ('webapp','patient_runtime_config'),
    ('webapp','public_booking_config'),
    ('integrator','integrator_http_request'), ('integrator','integrator_projection'),
    ('worker','worker_queue_drain'), ('worker','worker_projection_delivery'),
    ('worker','worker_outgoing_delivery'), ('scheduler','scheduler_lock'),
    ('scheduler','scheduler_dispatch_tick'), ('media_worker','media_transcode_tick'),
    ('cron','cron_health'), ('cron','cron_media'), ('cron','cron_analytics'),
    ('cron','cron_reminders'), ('cron','cron_specialist_tasks')
  ) THEN RAISE EXCEPTION 'invalid_saas_isolation_service_operation' USING ERRCODE = '22023'; END IF;
  IF p_explanation_status NOT IN ('explained','unexplained') THEN
    RAISE EXCEPTION 'invalid_saas_isolation_explanation' USING ERRCODE = '22023';
  END IF;
  v_fingerprint := 'v2:' || p_event_class || ':' || p_source_service || ':' || p_source_operation;
  INSERT INTO public.saas_isolation_events (
    fingerprint, event_class, source_service, source_operation, explanation_status
  ) VALUES (
    v_fingerprint, p_event_class, p_source_service, p_source_operation, p_explanation_status
  )
  ON CONFLICT (fingerprint) DO UPDATE SET
    explanation_status = CASE
      WHEN public.saas_isolation_events.explanation_status = 'unexplained'
        OR EXCLUDED.explanation_status = 'unexplained' THEN 'unexplained'
      ELSE 'explained'
    END,
    lifecycle_status = 'active', resolved_at = NULL, last_seen_at = now(),
    occurrence_count = public.saas_isolation_events.occurrence_count + 1
  RETURNING id INTO v_event_id;
  INSERT INTO public.saas_isolation_event_hourly (event_id, bucket_start, occurrence_count)
    VALUES (v_event_id, v_bucket_start, 1)
    ON CONFLICT (event_id, bucket_start) DO UPDATE SET
      occurrence_count = public.saas_isolation_event_hourly.occurrence_count + 1;
  DELETE FROM public.saas_isolation_event_hourly
    WHERE bucket_start < v_bucket_start - interval '8 days';
END
$function$;

WITH definitions(key, audience, default_value) AS (VALUES
  ('telegram_login_bot_username', 'public', '{"value":""}'::jsonb),
  ('max_login_bot_nickname', 'public', '{"value":""}'::jsonb),
  ('vk_web_login_url', 'public', '{"value":""}'::jsonb),
  ('support_contact_url', 'public', '{"value":""}'::jsonb),
  ('app_display_timezone', 'public', '{"value":"Europe/Moscow"}'::jsonb),
  ('specialist_signup_enabled', 'public', '{"value":false}'::jsonb),
  ('patient_app_maintenance_enabled', 'authenticated_client', '{"value":false}'::jsonb),
  ('patient_app_maintenance_message', 'authenticated_client', '{"value":""}'::jsonb),
  ('patient_booking_url', 'authenticated_client', '{"value":""}'::jsonb),
  ('video_playback_api_enabled', 'authenticated_client', '{"value":false}'::jsonb),
  ('video_default_delivery', 'authenticated_client', '{"value":"auto"}'::jsonb)
)
INSERT INTO public.app_runtime_settings
  (key, scope, organization_id, audience, value_json, updated_at, updated_by)
SELECT
  definitions.key,
  'admin',
  NULL,
  definitions.audience,
  COALESCE(setting.value_json, definitions.default_value),
  COALESCE(setting.updated_at, now()),
  setting.updated_by
FROM definitions
LEFT JOIN public.system_settings AS setting
  ON setting.key = definitions.key
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
SELECT key, scope, organization_id, 'authenticated_client', value_json, updated_at, updated_by
FROM public.system_settings
WHERE key = 'patient_booking_url'
  AND scope = 'admin'
  AND organization_id IS NOT NULL
ON CONFLICT (key, scope, organization_id) WHERE organization_id IS NOT NULL
DO UPDATE SET
  audience = EXCLUDED.audience,
  value_json = EXCLUDED.value_json,
  updated_at = EXCLUDED.updated_at,
  updated_by = EXCLUDED.updated_by;

WITH derived(key, enabled) AS (VALUES
  ('oauth_yandex_enabled', (
    SELECT count(*) FILTER (WHERE NULLIF(btrim(value_json->>'value'), '') IS NOT NULL) = 3
    FROM public.system_settings
    WHERE scope = 'admin' AND organization_id IS NULL
      AND key IN ('yandex_oauth_client_id', 'yandex_oauth_client_secret', 'yandex_oauth_redirect_uri')
  )),
  ('oauth_google_enabled', (
    SELECT count(*) FILTER (WHERE NULLIF(btrim(value_json->>'value'), '') IS NOT NULL) = 3
    FROM public.system_settings
    WHERE scope = 'admin' AND organization_id IS NULL
      AND key IN ('google_client_id', 'google_client_secret', 'google_oauth_login_redirect_uri')
  )),
  ('oauth_apple_enabled', (
    SELECT count(*) FILTER (WHERE NULLIF(btrim(value_json->>'value'), '') IS NOT NULL) = 5
    FROM public.system_settings
    WHERE scope = 'admin' AND organization_id IS NULL
      AND key IN ('apple_oauth_client_id', 'apple_oauth_redirect_uri', 'apple_oauth_team_id',
                  'apple_oauth_key_id', 'apple_oauth_private_key')
  ))
)
INSERT INTO public.app_runtime_settings
  (key, scope, organization_id, audience, value_json, updated_at, updated_by)
SELECT key, 'admin', NULL, 'public', jsonb_build_object('value', enabled), now(), NULL
FROM derived
ON CONFLICT (key, scope) WHERE organization_id IS NULL
DO UPDATE SET audience = EXCLUDED.audience, value_json = EXCLUDED.value_json, updated_at = EXCLUDED.updated_at;

INSERT INTO public.app_runtime_settings
  (key, scope, organization_id, audience, value_json, updated_at, updated_by)
SELECT
  'public_sms_fallback_enabled', 'admin', NULL, 'public',
  jsonb_build_object('value', COALESCE((
    SELECT CASE lower(value_json->>'value')
      WHEN 'true' THEN true WHEN '1' THEN true WHEN 'false' THEN false WHEN '0' THEN false ELSE NULL END
    FROM public.system_settings
    WHERE key = 'sms_fallback_enabled' AND organization_id IS NULL AND scope IN ('doctor', 'admin')
    ORDER BY CASE scope WHEN 'doctor' THEN 0 ELSE 1 END
    LIMIT 1
  ), true)),
  now(), NULL
ON CONFLICT (key, scope) WHERE organization_id IS NULL
DO UPDATE SET audience = EXCLUDED.audience, value_json = EXCLUDED.value_json, updated_at = EXCLUDED.updated_at;

CREATE OR REPLACE FUNCTION public.sync_registered_app_runtime_setting()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  runtime_audience text;
BEGIN
  IF NEW.organization_id IS NULL AND NEW.scope = 'admin' AND NEW.key IN (
    'yandex_oauth_client_id', 'yandex_oauth_client_secret', 'yandex_oauth_redirect_uri',
    'google_client_id', 'google_client_secret', 'google_oauth_login_redirect_uri',
    'apple_oauth_client_id', 'apple_oauth_redirect_uri', 'apple_oauth_team_id',
    'apple_oauth_key_id', 'apple_oauth_private_key'
  ) THEN
    INSERT INTO public.app_runtime_settings
      (key, scope, organization_id, audience, value_json, updated_at, updated_by)
    SELECT provider.key, 'admin', NULL, 'public', jsonb_build_object('value', provider.enabled), now(), NEW.updated_by
    FROM (VALUES
      ('oauth_yandex_enabled', (
        SELECT count(*) FILTER (WHERE NULLIF(btrim(value_json->>'value'), '') IS NOT NULL) = 3
        FROM public.system_settings WHERE scope = 'admin' AND organization_id IS NULL
          AND key IN ('yandex_oauth_client_id', 'yandex_oauth_client_secret', 'yandex_oauth_redirect_uri')
      )),
      ('oauth_google_enabled', (
        SELECT count(*) FILTER (WHERE NULLIF(btrim(value_json->>'value'), '') IS NOT NULL) = 3
        FROM public.system_settings WHERE scope = 'admin' AND organization_id IS NULL
          AND key IN ('google_client_id', 'google_client_secret', 'google_oauth_login_redirect_uri')
      )),
      ('oauth_apple_enabled', (
        SELECT count(*) FILTER (WHERE NULLIF(btrim(value_json->>'value'), '') IS NOT NULL) = 5
        FROM public.system_settings WHERE scope = 'admin' AND organization_id IS NULL
          AND key IN ('apple_oauth_client_id', 'apple_oauth_redirect_uri', 'apple_oauth_team_id',
                      'apple_oauth_key_id', 'apple_oauth_private_key')
      ))
    ) AS provider(key, enabled)
    ON CONFLICT (key, scope) WHERE organization_id IS NULL
    DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by;
  END IF;

  IF NEW.organization_id IS NULL AND NEW.key = 'sms_fallback_enabled' AND NEW.scope IN ('doctor', 'admin') THEN
    INSERT INTO public.app_runtime_settings
      (key, scope, organization_id, audience, value_json, updated_at, updated_by)
    VALUES (
      'public_sms_fallback_enabled', 'admin', NULL, 'public',
      jsonb_build_object('value', COALESCE((
        SELECT CASE lower(value_json->>'value')
          WHEN 'true' THEN true WHEN '1' THEN true WHEN 'false' THEN false WHEN '0' THEN false ELSE NULL END
        FROM public.system_settings
        WHERE key = 'sms_fallback_enabled' AND organization_id IS NULL AND scope IN ('doctor', 'admin')
        ORDER BY CASE scope WHEN 'doctor' THEN 0 ELSE 1 END LIMIT 1
      ), true)),
      NEW.updated_at, NEW.updated_by
    )
    ON CONFLICT (key, scope) WHERE organization_id IS NULL
    DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by;
  END IF;

  SELECT audience INTO runtime_audience
  FROM public.app_runtime_settings
  WHERE key = NEW.key AND scope = NEW.scope
  ORDER BY organization_id IS NULL DESC
  LIMIT 1;

  IF runtime_audience IS NULL THEN RETURN NEW; END IF;

  IF NEW.organization_id IS NULL THEN
    INSERT INTO public.app_runtime_settings
      (key, scope, organization_id, audience, value_json, updated_at, updated_by)
    VALUES (NEW.key, NEW.scope, NULL, runtime_audience, NEW.value_json, NEW.updated_at, NEW.updated_by)
    ON CONFLICT (key, scope) WHERE organization_id IS NULL
    DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by;
  ELSE
    INSERT INTO public.app_runtime_settings
      (key, scope, organization_id, audience, value_json, updated_at, updated_by)
    VALUES (NEW.key, NEW.scope, NEW.organization_id, runtime_audience, NEW.value_json, NEW.updated_at, NEW.updated_by)
    ON CONFLICT (key, scope, organization_id) WHERE organization_id IS NOT NULL
    DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS system_settings_sync_registered_runtime ON public.system_settings;
CREATE TRIGGER system_settings_sync_registered_runtime
AFTER INSERT OR UPDATE OF value_json, updated_at, updated_by
ON public.system_settings
FOR EACH ROW
EXECUTE FUNCTION public.sync_registered_app_runtime_setting();

CREATE OR REPLACE FUNCTION app.read_public_runtime_setting(p_key text, p_scope text)
RETURNS TABLE (
  key text,
  scope text,
  organization_id uuid,
  audience text,
  value_json jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT setting.key, setting.scope, setting.organization_id, setting.audience, setting.value_json
  FROM public.app_runtime_settings AS setting
  WHERE setting.key = p_key
    AND setting.scope = p_scope
    AND setting.organization_id IS NULL
    AND setting.audience = 'public'
  LIMIT 1
$function$;

GRANT SELECT ON TABLE public.app_runtime_settings TO app_owner;
ALTER FUNCTION app.read_public_runtime_setting(text, text) OWNER TO app_owner;
REVOKE ALL ON FUNCTION app.read_public_runtime_setting(text, text) FROM PUBLIC;

REVOKE ALL ON TABLE public.system_settings FROM app_patient;
REVOKE ALL ON TABLE public.system_settings_audit FROM app_patient;
GRANT SELECT ON TABLE public.app_runtime_settings TO app_patient;
