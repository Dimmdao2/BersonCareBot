-- BCB-MIGRATION-BACKFILL
-- BCB-MIGRATION-VERIFY: SELECT EXISTS (SELECT 1 FROM public.system_settings WHERE key = 'doctor_today_preferences' AND scope = 'doctor' AND organization_id IS NULL AND value_json = '{"value":{"peopleListMode":"on_support"}}'::jsonb)
--
-- The doctor Today page treats a missing or malformed preference as unavailable instead of
-- silently choosing product behaviour in code. The B0/forward ledger retained that reader but
-- omitted the database seed formerly carried by the retired migration history, so every clinic
-- without a saved override failed its server render. A global doctor-scope row is the platform
-- default already supported by the canonical exact-org-over-global read path; clinic rows still
-- override it and newly provisioned clinics need no second seed path.
--
-- Rights analysis: data-only insert into the existing public.system_settings root. No object,
-- function, runtime owner or privilege changes are introduced. Existing admin values win.

INSERT INTO public.system_settings (
  key,
  scope,
  organization_id,
  value_json,
  updated_at,
  updated_by
)
VALUES (
  'doctor_today_preferences',
  'doctor',
  NULL,
  pg_catalog.jsonb_build_object(
    'value',
    pg_catalog.jsonb_build_object('peopleListMode', 'on_support')
  ),
  pg_catalog.now(),
  NULL
)
ON CONFLICT (key, scope) WHERE organization_id IS NULL DO NOTHING;
