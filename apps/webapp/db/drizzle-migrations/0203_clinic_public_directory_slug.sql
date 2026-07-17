-- Minimal seed of the S6 public-catalog projection needed for #805 canonical `/book/{publicSlug}`.
-- Owner canon: docs/_TODO/SAAS_FOUNDATION/OWNER_RULINGS_2026-07-17.md §1. Full schema target:
-- docs/_TODO/SAAS_FOUNDATION/SAAS_S6_CLINIC_DIRECTORY_AND_ORG_BOUNDARY.md §5 (this table is a
-- forward-compatible subset; S6.3 may ADD COLUMN onto it later without touching this slice).

CREATE TABLE IF NOT EXISTS "clinic_public_directory_entries" (
  "organization_id" uuid PRIMARY KEY NOT NULL,
  "slug" text NOT NULL,
  "display_name" text NOT NULL,
  "is_published" boolean DEFAULT false NOT NULL,
  "published_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clinic_public_directory_entries_organization_id_fkey'
  ) THEN
    ALTER TABLE "clinic_public_directory_entries"
      ADD CONSTRAINT "clinic_public_directory_entries_organization_id_fkey"
      FOREIGN KEY ("organization_id") REFERENCES "be_organizations"("id") ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clinic_public_directory_entries_slug_lower_check'
  ) THEN
    ALTER TABLE "clinic_public_directory_entries"
      ADD CONSTRAINT "clinic_public_directory_entries_slug_lower_check"
      CHECK ("slug" = lower("slug"));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clinic_public_directory_entries_slug_not_blank_check'
  ) THEN
    ALTER TABLE "clinic_public_directory_entries"
      ADD CONSTRAINT "clinic_public_directory_entries_slug_not_blank_check"
      CHECK (length(btrim("slug")) > 0);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_clinic_public_directory_entries_slug"
  ON "clinic_public_directory_entries" USING btree ("slug");

CREATE INDEX IF NOT EXISTS "idx_clinic_public_directory_entries_published"
  ON "clinic_public_directory_entries" USING btree ("is_published");
