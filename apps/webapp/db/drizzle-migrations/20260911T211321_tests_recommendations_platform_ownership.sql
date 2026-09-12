-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-VERIFY: SELECT (SELECT count(*) = 4 FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN ('tests', 'recommendations', 'clinical_test_regions', 'recommendation_regions') AND column_name = 'owner_kind' AND is_nullable = 'NO' AND column_default = '''organization''::text') AND (SELECT count(*) = 4 FROM pg_constraint WHERE conname IN ('tests_owner_check', 'recommendations_owner_check', 'clinical_test_regions_owner_check', 'recommendation_regions_owner_check')) AND to_regclass('public.idx_tests_catalog_owner') IS NOT NULL AND to_regclass('public.idx_recommendations_catalog_owner') IS NOT NULL
--
-- EXERCISE_STORE_PLAN §5 S0б: existing rows become organization-owned through the same
-- DEFAULT 'organization' NOT NULL shape as `lfk_exercises`. The four CHECK constraints make
-- platform ownership unambiguous: platform rows have no organization, organization rows do.
--
-- Reverse, before any S0в platform rows exist: drop the four owner CHECK constraints, drop the
-- two catalog-owner indexes, then drop `owner_kind` from all four relations. No existing payload
-- column is rewritten by that reversal.
ALTER TABLE public.tests
  ADD COLUMN owner_kind text DEFAULT 'organization'::text NOT NULL;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner

ALTER TABLE public.recommendations
  ADD COLUMN owner_kind text DEFAULT 'organization'::text NOT NULL;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner

ALTER TABLE public.clinical_test_regions
  ADD COLUMN owner_kind text DEFAULT 'organization'::text NOT NULL;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner

ALTER TABLE public.recommendation_regions
  ADD COLUMN owner_kind text DEFAULT 'organization'::text NOT NULL;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner

ALTER TABLE public.tests
  ADD CONSTRAINT tests_owner_check CHECK (
    ((owner_kind = 'organization'::text) AND (organization_id IS NOT NULL))
    OR ((owner_kind = 'platform'::text) AND (organization_id IS NULL))
  );
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner

ALTER TABLE public.recommendations
  ADD CONSTRAINT recommendations_owner_check CHECK (
    ((owner_kind = 'organization'::text) AND (organization_id IS NOT NULL))
    OR ((owner_kind = 'platform'::text) AND (organization_id IS NULL))
  );
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner

ALTER TABLE public.clinical_test_regions
  ADD CONSTRAINT clinical_test_regions_owner_check CHECK (
    ((owner_kind = 'organization'::text) AND (organization_id IS NOT NULL))
    OR ((owner_kind = 'platform'::text) AND (organization_id IS NULL))
  );
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner

ALTER TABLE public.recommendation_regions
  ADD CONSTRAINT recommendation_regions_owner_check CHECK (
    ((owner_kind = 'organization'::text) AND (organization_id IS NOT NULL))
    OR ((owner_kind = 'platform'::text) AND (organization_id IS NULL))
  );
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner

CREATE INDEX idx_tests_catalog_owner
  ON public.tests USING btree (owner_kind, organization_id, is_archived, updated_at DESC);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner

CREATE INDEX idx_recommendations_catalog_owner
  ON public.recommendations USING btree (owner_kind, organization_id, is_archived, updated_at DESC);
