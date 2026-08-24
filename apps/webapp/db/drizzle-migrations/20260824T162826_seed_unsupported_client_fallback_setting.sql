-- BCB-MIGRATION-BACKFILL
-- BCB-MIGRATION-VERIFY: SELECT EXISTS (SELECT 1 FROM public.system_settings WHERE key = 'patient_unsupported_client_fallback_enabled' AND scope = 'admin' AND organization_id IS NULL AND pg_catalog.jsonb_typeof(value_json -> 'value') = 'boolean')
--
-- The unsupported-client fallback is an operator-controlled global rollout flag. Older TEST and
-- PROD snapshots predate its canonical system_settings row, so the required public reader fails
-- instead of returning the disabled state declared when the feature was introduced. Seed only a
-- missing canonical row; an existing operator choice is never overwritten. This does not restore
-- the retired app_runtime_settings mirror or add a second read/write path.
--
-- Rights analysis: this is a data-only insert into the existing public.system_settings root under
-- the migration administrator. It creates or changes no database object, function, role, grant,
-- policy or runtime relation access.
INSERT INTO public.system_settings (
  key,
  scope,
  organization_id,
  value_json,
  updated_at,
  updated_by
)
VALUES (
  'patient_unsupported_client_fallback_enabled',
  'admin',
  NULL,
  pg_catalog.jsonb_build_object('value', false),
  pg_catalog.now(),
  NULL
)
ON CONFLICT (key, scope) WHERE organization_id IS NULL DO NOTHING;
