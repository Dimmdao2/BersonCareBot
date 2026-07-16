-- Register the two media-worker runtime flags in the generic runtime store.
-- Values remain authored through restricted system_settings; the generic 0186 trigger mirrors
-- later writes after these rows exist. app_worker receives only server-audience global rows.

WITH definitions(key, scope, audience, default_value) AS (
  VALUES
    ('video_hls_pipeline_enabled', 'admin', 'server', '{"value":false}'::jsonb),
    ('video_watermark_enabled', 'admin', 'server', '{"value":false}'::jsonb)
)
INSERT INTO public.app_runtime_settings
  (key, scope, organization_id, audience, value_json, updated_at, updated_by)
SELECT
  definition.key,
  definition.scope,
  NULL,
  definition.audience,
  COALESCE(setting.value_json, definition.default_value),
  COALESCE(setting.updated_at, now()),
  setting.updated_by
FROM definitions AS definition
LEFT JOIN public.system_settings AS setting
  ON setting.key = definition.key
 AND setting.scope = definition.scope
 AND setting.organization_id IS NULL
ON CONFLICT (key, scope) WHERE organization_id IS NULL
DO UPDATE SET
  audience = EXCLUDED.audience,
  value_json = EXCLUDED.value_json,
  updated_at = EXCLUDED.updated_at,
  updated_by = EXCLUDED.updated_by;

DROP POLICY IF EXISTS app_runtime_settings_safe_read ON public.app_runtime_settings;
CREATE POLICY app_runtime_settings_safe_read ON public.app_runtime_settings
  FOR SELECT
  USING (
    (
      audience IN ('public', 'authenticated_client')
      AND NOT pg_has_role(current_user, 'app_worker', 'member')
      AND (
        organization_id IS NULL
        OR organization_id = NULLIF(current_setting('app.org', true), '')::uuid
      )
    )
    OR (
      audience = 'server'
      AND organization_id IS NULL
      AND pg_has_role(current_user, 'app_worker', 'member')
      AND NULLIF(current_setting('app.org', true), '') IS NULL
      AND NULLIF(current_setting('app.patient_user_id', true), '') IS NULL
    )
  );

DROP POLICY IF EXISTS app_runtime_settings_staff_write ON public.app_runtime_settings;
CREATE POLICY app_runtime_settings_staff_write ON public.app_runtime_settings
  FOR ALL
  USING (
    current_user <> 'app_patient'
    AND NOT pg_has_role(current_user, 'app_worker', 'member')
    AND NULLIF(current_setting('app.patient_user_id', true), '') IS NULL
    AND (
      organization_id IS NULL
      OR organization_id = NULLIF(current_setting('app.org', true), '')::uuid
    )
  )
  WITH CHECK (
    current_user <> 'app_patient'
    AND NOT pg_has_role(current_user, 'app_worker', 'member')
    AND NULLIF(current_setting('app.patient_user_id', true), '') IS NULL
    AND (
      organization_id IS NULL
      OR organization_id = NULLIF(current_setting('app.org', true), '')::uuid
    )
  );

GRANT SELECT ON TABLE public.app_runtime_settings TO app_worker;
