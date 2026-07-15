-- S5-6 minimal safe runtime-settings root for patient request paths.
-- Restricted settings remain in public.system_settings. The trigger is deliberately generic:
-- a key is mirrored only after it has an existing registry row in app_runtime_settings.

CREATE TABLE IF NOT EXISTS public.app_runtime_settings (
  key             text NOT NULL,
  scope           text NOT NULL DEFAULT 'global',
  organization_id uuid,
  audience        text NOT NULL,
  value_json      jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid,
  CONSTRAINT app_runtime_settings_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE,
  CONSTRAINT app_runtime_settings_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES public.platform_users(id) ON DELETE SET NULL,
  CONSTRAINT app_runtime_settings_scope_check
    CHECK (scope = ANY (ARRAY['global'::text, 'doctor'::text, 'admin'::text])),
  CONSTRAINT app_runtime_settings_audience_check
    CHECK (audience = ANY (ARRAY['public'::text, 'authenticated_client'::text, 'server'::text]))
);

CREATE UNIQUE INDEX IF NOT EXISTS app_runtime_settings_global_key_scope_uidx
  ON public.app_runtime_settings (key, scope)
  WHERE organization_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS app_runtime_settings_org_key_scope_uidx
  ON public.app_runtime_settings (key, scope, organization_id)
  WHERE organization_id IS NOT NULL;

-- Register and backfill the first patient-safe runtime flag. A missing legacy row is fail-closed.
INSERT INTO public.app_runtime_settings
  (key, scope, organization_id, audience, value_json, updated_at, updated_by)
SELECT
  'patient_program_discussion_ui_enabled',
  'admin',
  NULL,
  'authenticated_client',
  COALESCE(
    (
      SELECT value_json
      FROM public.system_settings
      WHERE key = 'patient_program_discussion_ui_enabled'
        AND scope = 'admin'
        AND organization_id IS NULL
      LIMIT 1
    ),
    '{"value":false}'::jsonb
  ),
  COALESCE(
    (
      SELECT updated_at
      FROM public.system_settings
      WHERE key = 'patient_program_discussion_ui_enabled'
        AND scope = 'admin'
        AND organization_id IS NULL
      LIMIT 1
    ),
    now()
  ),
  (
    SELECT updated_by
    FROM public.system_settings
    WHERE key = 'patient_program_discussion_ui_enabled'
      AND scope = 'admin'
      AND organization_id IS NULL
    LIMIT 1
  )
ON CONFLICT (key, scope) WHERE organization_id IS NULL
DO UPDATE SET
  audience = EXCLUDED.audience,
  value_json = EXCLUDED.value_json,
  updated_at = EXCLUDED.updated_at,
  updated_by = EXCLUDED.updated_by;

INSERT INTO public.app_runtime_settings
  (key, scope, organization_id, audience, value_json, updated_at, updated_by)
SELECT
  key,
  scope,
  organization_id,
  'authenticated_client',
  value_json,
  updated_at,
  updated_by
FROM public.system_settings
WHERE key = 'patient_program_discussion_ui_enabled'
  AND scope = 'admin'
  AND organization_id IS NOT NULL
ON CONFLICT (key, scope, organization_id) WHERE organization_id IS NOT NULL
DO UPDATE SET
  audience = EXCLUDED.audience,
  value_json = EXCLUDED.value_json,
  updated_at = EXCLUDED.updated_at,
  updated_by = EXCLUDED.updated_by;

CREATE OR REPLACE FUNCTION public.sync_registered_app_runtime_setting()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  runtime_audience text;
BEGIN
  SELECT audience
    INTO runtime_audience
    FROM public.app_runtime_settings
   WHERE key = NEW.key
     AND scope = NEW.scope
   ORDER BY organization_id IS NULL DESC
   LIMIT 1;

  IF runtime_audience IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.organization_id IS NULL THEN
    INSERT INTO public.app_runtime_settings
      (key, scope, organization_id, audience, value_json, updated_at, updated_by)
    VALUES
      (NEW.key, NEW.scope, NULL, runtime_audience, NEW.value_json, NEW.updated_at, NEW.updated_by)
    ON CONFLICT (key, scope) WHERE organization_id IS NULL
    DO UPDATE SET
      value_json = EXCLUDED.value_json,
      updated_at = EXCLUDED.updated_at,
      updated_by = EXCLUDED.updated_by;
  ELSE
    INSERT INTO public.app_runtime_settings
      (key, scope, organization_id, audience, value_json, updated_at, updated_by)
    VALUES
      (NEW.key, NEW.scope, NEW.organization_id, runtime_audience, NEW.value_json, NEW.updated_at, NEW.updated_by)
    ON CONFLICT (key, scope, organization_id) WHERE organization_id IS NOT NULL
    DO UPDATE SET
      value_json = EXCLUDED.value_json,
      updated_at = EXCLUDED.updated_at,
      updated_by = EXCLUDED.updated_by;
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

ALTER TABLE public.app_runtime_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_runtime_settings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_runtime_settings_safe_read ON public.app_runtime_settings;
CREATE POLICY app_runtime_settings_safe_read ON public.app_runtime_settings
  FOR SELECT
  USING (
    audience IN ('public', 'authenticated_client')
    AND (
      organization_id IS NULL
      OR organization_id = NULLIF(current_setting('app.org', true), '')::uuid
    )
  );
DROP POLICY IF EXISTS app_runtime_settings_staff_write ON public.app_runtime_settings;
CREATE POLICY app_runtime_settings_staff_write ON public.app_runtime_settings
  FOR ALL
  USING (
    current_user <> 'app_patient'
    AND NULLIF(current_setting('app.patient_user_id', true), '') IS NULL
    AND (
      organization_id IS NULL
      OR organization_id = NULLIF(current_setting('app.org', true), '')::uuid
    )
  )
  WITH CHECK (
    current_user <> 'app_patient'
    AND NULLIF(current_setting('app.patient_user_id', true), '') IS NULL
    AND (
      organization_id IS NULL
      OR organization_id = NULLIF(current_setting('app.org', true), '')::uuid
    )
  );

DO $grant$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_patient') THEN
    GRANT SELECT ON TABLE public.app_runtime_settings TO app_patient;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_staff') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.app_runtime_settings TO app_staff;
  END IF;
END
$grant$;
