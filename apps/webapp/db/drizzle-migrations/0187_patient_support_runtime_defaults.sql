-- Register the patient-safe doctor support defaults in the generic runtime store.
-- Restricted system_settings remains the authoring source during the S5 compatibility phase;
-- the generic trigger installed by 0186 mirrors later writes after these keys are registered.

WITH definitions(key, scope, audience, default_value) AS (
  VALUES
    ('doctor_patient_support_comments_without_support_default_enabled', 'doctor', 'authenticated_client', '{"value":false}'::jsonb),
    ('doctor_patient_support_media_without_support_default_enabled', 'doctor', 'authenticated_client', '{"value":false}'::jsonb)
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

WITH definitions(key, scope, audience) AS (
  VALUES
    ('doctor_patient_support_comments_without_support_default_enabled', 'doctor', 'authenticated_client'),
    ('doctor_patient_support_media_without_support_default_enabled', 'doctor', 'authenticated_client')
)
INSERT INTO public.app_runtime_settings
  (key, scope, organization_id, audience, value_json, updated_at, updated_by)
SELECT
  setting.key,
  setting.scope,
  setting.organization_id,
  definition.audience,
  setting.value_json,
  setting.updated_at,
  setting.updated_by
FROM public.system_settings AS setting
JOIN definitions AS definition
  ON definition.key = setting.key
 AND definition.scope = setting.scope
WHERE setting.organization_id IS NOT NULL
ON CONFLICT (key, scope, organization_id) WHERE organization_id IS NOT NULL
DO UPDATE SET
  audience = EXCLUDED.audience,
  value_json = EXCLUDED.value_json,
  updated_at = EXCLUDED.updated_at,
  updated_by = EXCLUDED.updated_by;
