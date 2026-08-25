-- BCB-MIGRATION-BACKFILL
-- BCB-MIGRATION-VERIFY: SELECT count(*) = 2 FROM public.system_settings WHERE key IN ('booking_min_notice_hours', 'booking_max_consecutive_slot_hours') AND scope = 'admin' AND organization_id IS NULL AND value_json ? 'value'
--
-- The patient slot flow reads these settings from the database and refuses to build a schedule
-- when neither an organization override nor the platform default exists. The active schema-B
-- baseline retained the readers but omitted both registry defaults, so the service selection
-- silently redirected patients back to the booking hub. Global admin-scope rows are the existing
-- fallback supported by the canonical exact-organization-over-global read path; clinic overrides
-- remain authoritative.
--
-- Rights analysis: data-only insert into the existing public.system_settings root. No object,
-- function, runtime owner or privilege changes are introduced. Existing values win.

INSERT INTO public.system_settings (
  key,
  scope,
  organization_id,
  value_json,
  updated_at,
  updated_by
)
VALUES
  (
    'booking_min_notice_hours',
    'admin',
    NULL,
    pg_catalog.jsonb_build_object('value', 0),
    pg_catalog.now(),
    NULL
  ),
  (
    'booking_max_consecutive_slot_hours',
    'admin',
    NULL,
    pg_catalog.jsonb_build_object('value', 3),
    pg_catalog.now(),
    NULL
  )
ON CONFLICT (key, scope) WHERE organization_id IS NULL DO NOTHING;
