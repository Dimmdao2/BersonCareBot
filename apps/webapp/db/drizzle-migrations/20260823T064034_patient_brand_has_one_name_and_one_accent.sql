-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-VERIFY: SELECT count(*) = 2 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'org_brand_revisions' AND column_name IN ('patient_app_name', 'accent_token')
-- B4 extends the one existing revision store. Both values remain optional and versioned by the
-- same draft -> published transition as display_name/logo_media_id; no theme or parallel brand
-- table is introduced.
ALTER TABLE public.org_brand_revisions
  ADD COLUMN patient_app_name text,
  ADD COLUMN accent_token text,
  ADD CONSTRAINT org_brand_revisions_patient_app_name_check
    CHECK (
      patient_app_name IS NULL
      OR (btrim(patient_app_name) <> '' AND length(patient_app_name) <= 120)
    ),
  ADD CONSTRAINT org_brand_revisions_accent_token_check
    CHECK (accent_token IS NULL OR accent_token ~ '^#[0-9a-f]{6}$');
