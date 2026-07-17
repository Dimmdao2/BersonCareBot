-- Custom SQL migration file, put your code below! --
-- `clinic_public_directory_entries` is a tenant-owned projection. Anonymous/bootstrap callers
-- receive no table privileges; the canonical slug lookup remains the narrow SECURITY DEFINER
-- `app.resolve_public_organization_by_slug(text)` owned by the BYPASSRLS NOLOGIN app_owner role.
-- Repeat the 0203 DDL idempotently because databases that had already consumed journal idx 203
-- before that forward file landed will otherwise skip the table creation entirely.

CREATE TABLE IF NOT EXISTS public.clinic_public_directory_entries (
  organization_id uuid PRIMARY KEY NOT NULL,
  slug text NOT NULL,
  display_name text NOT NULL,
  is_published boolean DEFAULT false NOT NULL,
  published_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'clinic_public_directory_entries_organization_id_fkey'
  ) THEN
    ALTER TABLE public.clinic_public_directory_entries
      ADD CONSTRAINT clinic_public_directory_entries_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'clinic_public_directory_entries_slug_lower_check'
  ) THEN
    ALTER TABLE public.clinic_public_directory_entries
      ADD CONSTRAINT clinic_public_directory_entries_slug_lower_check
      CHECK (slug = lower(slug));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'clinic_public_directory_entries_slug_not_blank_check'
  ) THEN
    ALTER TABLE public.clinic_public_directory_entries
      ADD CONSTRAINT clinic_public_directory_entries_slug_not_blank_check
      CHECK (length(btrim(slug)) > 0);
  END IF;
END
$constraints$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_clinic_public_directory_entries_slug
  ON public.clinic_public_directory_entries USING btree (slug);
CREATE INDEX IF NOT EXISTS idx_clinic_public_directory_entries_published
  ON public.clinic_public_directory_entries USING btree (is_published);

ALTER TABLE "public"."clinic_public_directory_entries" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."clinic_public_directory_entries";

CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."clinic_public_directory_entries"
  FOR ALL
  USING (
    NULLIF(current_setting('app.org', true), '') IS NULL
    OR "organization_id" = NULLIF(current_setting('app.org', true), '')::uuid
  )
  WITH CHECK (
    NULLIF(current_setting('app.org', true), '') IS NULL
    OR "organization_id" = NULLIF(current_setting('app.org', true), '')::uuid
  );

ALTER TABLE "public"."clinic_public_directory_entries" FORCE ROW LEVEL SECURITY;

DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_patient') THEN
    REVOKE ALL ON TABLE public.clinic_public_directory_entries FROM app_patient;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_staff') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON TABLE public.clinic_public_directory_entries TO app_staff;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner') THEN
    GRANT SELECT ON TABLE public.clinic_public_directory_entries TO app_owner;
  END IF;
END
$grants$;
