-- Patient-visible content/catalog SELECT policies.
--
-- This is a post-P2-B overlay: the fresh-dump migration chain intentionally installs
-- app.current_org_id()/app.current_patient_user_id() after Drizzle migrations.  Keep this
-- artifact idempotent so fresh restores and code-only deploys converge to the same policy set.

DO $patient_visible_catalog_prerequisites$
BEGIN
  IF to_regprocedure('app.current_org_id()') IS NULL
     OR to_regprocedure('app.current_patient_user_id()') IS NULL THEN
    RAISE EXCEPTION 'patient_visible_catalog_principal_helpers_missing';
  END IF;
END
$patient_visible_catalog_prerequisites$;

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
FOR SELECT TO app_patient
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
FOR SELECT TO app_patient
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

SELECT 'patient-visible-catalog RLS overlay: OK' AS status;
