-- 0198_patient_visible_catalog_reads: tenant-safe patient reads for patient-facing screen config.
-- These policies expose rows only inside the signed current patient organization. Product-level
-- visibility (enabled home blocks / visible content sections) remains enforced by the services.

-- A fresh production dump does not contain the protected principal helpers yet: the hard
-- migration protocol installs P2-B only after the Drizzle transaction.  Keep the migration
-- valid in that ordering; the canonical post-P2-B overlay installs the policies afterwards.
-- Code-only upgrades, where P2-B already exists, still install them in this migration.
DO $patient_visible_catalog_reads$
BEGIN
  IF to_regprocedure('app.current_org_id()') IS NULL
     OR to_regprocedure('app.current_patient_user_id()') IS NULL THEN
    RAISE NOTICE '0198: protected principal helpers absent; deferring patient catalog policies to post-P2-B overlay';
    RETURN;
  END IF;

  DROP POLICY IF EXISTS patient_current_org_select ON public.patient_home_blocks;
  CREATE POLICY patient_current_org_select ON public.patient_home_blocks
FOR SELECT
USING (
  app.current_patient_user_id() IS NOT NULL
  AND organization_id = app.current_org_id()
  AND EXISTS (
    SELECT 1 FROM public.org_enrollments AS enrollment
    WHERE enrollment.organization_id = app.current_org_id()
      AND enrollment.platform_user_id = app.current_patient_user_id()
      AND enrollment.status = 'active'
  )
  );

  DROP POLICY IF EXISTS patient_current_org_select ON public.patient_home_block_items;
  CREATE POLICY patient_current_org_select ON public.patient_home_block_items
FOR SELECT
USING (
  app.current_patient_user_id() IS NOT NULL
  AND organization_id = app.current_org_id()
  AND EXISTS (
    SELECT 1 FROM public.org_enrollments AS enrollment
    WHERE enrollment.organization_id = app.current_org_id()
      AND enrollment.platform_user_id = app.current_patient_user_id()
      AND enrollment.status = 'active'
  )
  );

  DROP POLICY IF EXISTS patient_visible_current_org_select ON public.content_sections;
  CREATE POLICY patient_visible_current_org_select ON public.content_sections
FOR SELECT
USING (
  app.current_patient_user_id() IS NOT NULL
  AND organization_id = app.current_org_id()
  AND is_visible = true
  AND EXISTS (
    SELECT 1 FROM public.org_enrollments AS enrollment
    WHERE enrollment.organization_id = app.current_org_id()
      AND enrollment.platform_user_id = app.current_patient_user_id()
      AND enrollment.status = 'active'
  )
  );

  DROP POLICY IF EXISTS patient_visible_current_org_select ON public.content_pages;
  CREATE POLICY patient_visible_current_org_select ON public.content_pages
FOR SELECT
USING (
  app.current_patient_user_id() IS NOT NULL
  AND organization_id = app.current_org_id()
  AND is_published = true
  AND archived_at IS NULL
  AND deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.org_enrollments AS enrollment
    WHERE enrollment.organization_id = app.current_org_id()
      AND enrollment.platform_user_id = app.current_patient_user_id()
      AND enrollment.status = 'active'
  )
  );

  DROP POLICY IF EXISTS patient_current_org_select ON public.content_section_slug_history;
  CREATE POLICY patient_current_org_select ON public.content_section_slug_history
FOR SELECT
USING (
  app.current_patient_user_id() IS NOT NULL
  AND organization_id = app.current_org_id()
  AND EXISTS (
    SELECT 1 FROM public.org_enrollments AS enrollment
    WHERE enrollment.organization_id = app.current_org_id()
      AND enrollment.platform_user_id = app.current_patient_user_id()
      AND enrollment.status = 'active'
  )
  );
END
$patient_visible_catalog_reads$;
